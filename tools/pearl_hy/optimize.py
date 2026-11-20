"""Consolidate an existing Pearl YSM surface pack, using its painted RGBA islands."""

import argparse
import io
import json
import math
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt, map_coordinates
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
from hem import LEGS, SKIRTS, legs, lining, native_rotation, outer_skirt, shoe_reference
from waist import CUT, finish, pendant
from clasp import relief
import lapels
from articulation import fit_arms, fit_head_pitch, trim_chin


FLIP = np.array([1, 1, -1])
SIGNS = np.array([1, -1, -1])
EYES = {"Blink", "CuriousEyes", "IntentEyes", "WideEyes"}


class Patch:
    def __init__(self, cube, atlas):
        self.cube = cube
        face = cube["uv"]["north"]
        x, y = face["uv"]
        w, h = face["uv_size"]
        self.tile = atlas[y : y + h, x : x + w].copy()
        self.basis = Rotation.from_euler(
            "xyz", np.array(cube["rotation"]) * SIGNS, degrees=True
        ).as_matrix()
        size = np.asarray(cube["size"])
        pivot = np.asarray(cube["pivot"]) * FLIP
        midpoint = (np.asarray(cube["origin"]) + size / 2) * FLIP
        self.center = pivot + self.basis @ (midpoint - pivot + [0, 0, size[2] / 2])
        self.span = size[:2]
        # Test adjacency against the painted footprint, including concave edges and holes.
        opaque = self.tile[..., 3] > 24
        row, col = np.nonzero(opaque & ~binary_erosion(opaque))
        offsets = (
            np.column_stack(((col + 0.5) / w - 0.5, 0.5 - (row + 0.5) / h)) * self.span
        )
        self.edge = self.center + offsets @ self.basis[:, :2].T
        self.weight = max(1e-6, opaque.mean() * np.prod(self.span))
        self.normal = self.basis[:, 2]
        self.cap = bool(
            opaque.any() and np.ptp(self.tile[opaque, :3], axis=0).max() == 0
        )


def protected_face(patch, name):
    x, y, z = patch.center
    return name in EYES or (
        name == "Head" and z > 2.8 and 20.5 < y < 25.2 and abs(x) < 3.8
    )


def pixel_color(p, name):
    """Snap low-contrast pigment to a shared physical grid; keep alpha and ink edges."""
    if protected_face(p, name) or p.cap:
        return
    tile = p.tile
    h, w = tile.shape[:2]
    row, col = np.indices((h, w), dtype=float)
    axes = p.basis[:, :2]
    # World-projected cells keep adjacent UV islands on the same grid.
    world = (
        p.center
        + ((col[..., None] + 0.5) / w - 0.5) * p.span[0] * axes[:, 0]
        + (0.5 - (row[..., None] + 0.5) / h) * p.span[1] * axes[:, 1]
    )
    plane = np.delete(world, np.argmax(abs(p.normal)), axis=2)
    keys = np.floor(plane * 3.5).astype(int)
    keys -= keys.min(axis=(0, 1))
    ids = (keys[..., 0] * (1 + keys[..., 1].max()) + keys[..., 1]).ravel()
    rgb = tile[..., :3].reshape(-1, 3).astype(float)
    alpha = tile[..., 3].ravel() / 255
    weights = np.maximum(np.bincount(ids, weights=alpha), 1e-8)
    tones = np.column_stack(
        [np.bincount(ids, weights=v * alpha) / weights for v in rgb.T]
    )
    flat = np.clip(5 * np.round(tones[ids] / 5), 0, 255)
    # Fine markings and highlights retain their original contrast and texels.
    same_color = (np.max(abs(rgb - flat), axis=1) <= 13) & (alpha > 0)
    rgb[same_color] = flat[same_color]
    tile[..., :3] = rgb.reshape(h, w, 3).astype("u1")


def neighbours(parts):
    boundaries = [p.edge for p in parts]
    if not sum(map(len, boundaries)):
        return [set() for _ in parts]
    ids = np.repeat(np.arange(len(parts)), list(map(len, boundaries)))
    pairs = cKDTree(np.concatenate(boundaries)).query_pairs(
        0.115, output_type="ndarray"
    )
    pairs = np.sort(ids[pairs], axis=1)
    pairs = np.unique(pairs[pairs[:, 0] != pairs[:, 1]], axis=0)
    adj = [set() for _ in parts]
    for a, b in pairs:
        if parts[a].cap == parts[b].cap:
            adj[a].add(b)
            adj[b].add(a)
    return adj


def fit(group):
    weights = [p.weight for p in group]
    n = np.average([p.normal for p in group], axis=0, weights=weights)
    n /= np.linalg.norm(n)
    u = group[0].basis[:, 0].copy()
    u -= n * (u @ n)
    u /= np.linalg.norm(u)
    return np.average(
        [p.center for p in group], axis=0, weights=weights
    ), np.column_stack((u, np.cross(n, u), n))


def groups(parts, name):
    adj = neighbours(parts)
    sculpted = name == "Head" or any(
        k in name for k in ("Wing", "Tail", "Hair", "Lock")
    )
    height = 0.054 if sculpted else 0.085
    cosine = math.cos(math.radians(29 if sculpted else 36))
    used = set()
    for seed in sorted(range(len(parts)), key=lambda i: -parts[i].weight):
        if seed in used:
            continue
        p = parts[seed]
        group = [p]
        used.add(seed)
        if protected_face(p, name):
            yield group
            continue
        todo = set(adj[seed])
        while todo:
            i = min(todo)
            todo.remove(i)
            if i in used:
                continue
            q = parts[i]
            if protected_face(q, name) or q.normal @ p.normal < cosine:
                continue
            # Parallel offset layers (fringe, feathers, scales) need separate depth.
            if (
                q.normal @ p.normal > 0.985
                and abs((q.center - p.center) @ p.normal) > 0.022
            ):
                continue
            trial = group + [q]
            center, basis = fit(trial)
            if any(
                np.max(abs((t.edge - center) @ basis[:, 2])) > height for t in trial
            ):
                continue
            used.add(i)
            group.append(q)
            todo.update(adj[i] - used)
        yield group


def flatten(group):
    """Reproject original RGBA islands into the same plane validated during grouping."""
    origin, basis = fit(group)
    axes, normal = basis[:, :2], basis[:, 2]
    edges = (np.concatenate([s.edge for s in group]) - origin) @ axes
    density = max(max(np.array(s.tile.shape[1::-1]) / s.span) for s in group)
    density = min(32, max(17, density))
    lo = np.floor(edges.min(0) * density - 2) / density
    hi = np.ceil(edges.max(0) * density + 2) / density
    w, h = np.rint((hi - lo) * density).astype(int)
    # Work at double resolution to carry alpha cutouts across the UV transform.
    row, col = np.indices((h * 2, w * 2), dtype=float)
    world = (
        origin
        + (lo[0] + (col[..., None] + 0.5) / (2 * density)) * axes[:, 0]
        + (hi[1] - (row[..., None] + 0.5) / (2 * density)) * axes[:, 1]
    )
    image = np.zeros((h * 2, w * 2, 4), dtype="u1")
    depth = np.full((h * 2, w * 2), -np.inf)
    for s in group:
        local = world - s.center
        dist = -(local @ s.normal) / (normal @ s.normal)
        xy = (local + dist[..., None] * normal) @ s.basis[:, :2] / s.span
        sh, sw = s.tile.shape[:2]
        uv = np.stack(((0.5 - xy[..., 1]) * sh - 0.5, (xy[..., 0] + 0.5) * sw - 0.5))
        source = s.tile
        clear = source[..., 3] < CUT
        if clear.all():
            continue
        if clear.any():
            nearest = distance_transform_edt(
                clear, return_distances=False, return_indices=True
            )
            source = source.copy()
            source[clear, :3] = source[tuple(nearest[:, clear])][:, :3]
        tex = np.stack(
            [
                map_coordinates(channel, uv, order=1, mode="nearest")
                for channel in source.transpose(2, 0, 1)
            ],
            -1,
        )
        inside = np.all(abs(xy) <= 0.5, axis=2)
        alpha = np.where(inside, tex[..., 3], 0)
        # Depth decides which piece of cloth is visible at each covered subpixel.
        copy = (alpha >= CUT) & (dist >= depth)
        image[copy] = tex[copy]
        image[copy, 3] = 255
        depth[copy] = dist[copy]
    tile = np.array(Image.fromarray(image).resize((w, h), Image.Resampling.BOX))
    # Supply edge colours for bilinear/mipmap sampling outside the cutout.
    empty = tile[..., 3] == 0
    if empty.any() and not empty.all():
        nearest = distance_transform_edt(
            empty, return_distances=False, return_indices=True
        )
        tile[empty, :3] = tile[tuple(nearest[:, empty])][:, :3]
    extent = np.r_[hi - lo, 0.02]
    center = (origin + axes @ ((hi + lo) / 2) - 0.01 * normal) * FLIP
    cube = dict(
        origin=(center - extent / 2).round(6).tolist(),
        size=extent.round(6).tolist(),
        pivot=center.round(6).tolist(),
        rotation=native_rotation(basis),
        uv={"north": {}},
    )
    return cube, tile


def optimize(src, dest):
    with ZipFile(src) as z:
        files = {n: z.read(n) for n in z.namelist()}
    main = json.loads(files["models/main.json"])
    arms = json.loads(files["models/arm.json"])
    atlas = np.array(
        Image.open(io.BytesIO(files["textures/pearl.png"])).convert("RGBA")
    )
    geo = main["minecraft:geometry"][0]
    tiles = []
    patches = {
        b["name"]: [Patch(c, atlas) for c in b["cubes"]]
        for b in geo["bones"]
        if b.get("cubes")
    }
    if not any(p.cap and p.weight > 45 for p in patches["Skirt"]):
        raise ValueError(
            "Expected the original HY pack with its closed skirt sections."
        )
    lower = legs(shoe_reference(patches))
    clasps = {side: relief(patches, side) for side in (-1, 1)}
    facings = lapels.surfaces(patches)
    facings["UpperBody"] = lapels.belt() + lapels.bodice()
    inner, lining_radius = lining(patches)
    lower.update(inner)
    for bone in geo["bones"]:
        if not bone.get("cubes") or bone["name"].endswith("Arm"):
            continue
        name = bone["name"]
        parts = patches[name]
        if name in LEGS:
            parts = []
        if name in SKIRTS:
            parts = [p for p in parts if outer_skirt(p, lining_radius)]
        for p in parts:
            pixel_color(p, name)
        result = []
        for group in groups(parts, name):
            cube, tile = (
                flatten(group) if len(group) > 1 else (group[0].cube, group[0].tile)
            )
            trim_chin(name, cube, tile)
            finished = finish(name, cube, tile, lapels.replaced, lapels.belt_cut)
            if finished:
                cube, tile = finished
                tiles.append((cube["uv"]["north"], tile))
                result.append(cube)
        for cube, tile in lower.get(name, []):
            tile[..., 3] = np.where(tile[..., 3] >= 115, 255, 0)
            tiles.append((cube["uv"]["north"], tile))
            result.append(cube)
        fittings = list(facings.get(name, []))
        for side, skirt in [(-1, "RightSkirt"), (1, "LeftSkirt")]:
            if name == skirt:
                # Both parts of the fastening swing together with their lapel.
                fittings.extend(clasps[side])
                fittings.extend(pendant(side))
        for cube, tile in fittings:
            tiles.append((cube["uv"]["north"], tile))
            result.append(cube)
        print(name, len(patches[name]), "->", len(result), flush=True)
        bone["cubes"] = result
    arm_geo = arms["minecraft:geometry"][0]
    fit_arms(geo["bones"], tiles)
    fit_arms(arm_geo["bones"], tiles, first_person=True)
    # Compile held-item tracks against the finished wrist and grip hierarchy.
    # Older input packs omitted the wrist tracks when they only had locators.
    held = json.loads(
        Path(__file__)
        .with_name("cc0-arm.animation.json")
        .read_text(encoding="utf-8-sig")
    )
    names = {b["name"] for b in arm_geo["bones"]}
    for clip in held["animations"].values():
        if "bones" in clip:
            clip["bones"] = {k: v for k, v in clip["bones"].items() if k in names}
    files["animations/arm.animation.json"] = json.dumps(
        held, separators=(",", ":")
    ).encode()
    clips = json.loads(files["animations/main.animation.json"])
    fit_head_pitch(geo["bones"], clips["animations"], tiles)
    files["animations/main.animation.json"] = json.dumps(
        clips, separators=(",", ":")
    ).encode()
    width = 2048
    x = y = row = 0
    places = []
    for face, tile in sorted(tiles, key=lambda t: -t[1].shape[0]):
        h, w = tile.shape[:2]
        if x + w + 4 > width:
            x = 0
            y += row
            row = 0
        face.update(uv=[x + 2, y + 2], uv_size=[w, h])
        places.append(((x, y), tile))
        row = max(row, h + 4)
        x += w + 4
    out = Image.new("RGBA", (width, 1 << (y + row - 1).bit_length()))
    for pos, tile in places:
        out.paste(
            Image.fromarray(np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode="edge")), pos
        )
    for g in (geo, arm_geo):
        g["description"].update(texture_width=out.width, texture_height=out.height)
    buf = io.BytesIO()
    out.save(buf, "PNG")
    files["textures/pearl.png"] = buf.getvalue()
    for path, data in (("models/main.json", main), ("models/arm.json", arms)):
        files[path] = json.dumps(data, separators=(",", ":"), allow_nan=False).encode()
    with ZipFile(dest, "w") as z:
        for name, data in files.items():
            z.writestr(ZipInfo(name), data, compress_type=ZIP_DEFLATED)
    return sum(len(c["uv"]) * 2 for b in geo["bones"] for c in b.get("cubes", []))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    optimize(args.source, args.destination)
