"""Reconstruct the original five-lobed clasp as a continuous relief with sidewalls."""

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import (
    distance_transform_edt,
    gaussian_filter,
    label,
    map_coordinates,
)
from scipy.spatial import Delaunay, cKDTree

from hem import samples, sheet
from waist import FRONT, add_sheet, clasp_center, cloth_depth, face_frame, face_grid


def simplify_line(line, tolerance):
    if len(line) < 3:
        return line
    chord = line[-1] - line[0]
    t = np.clip((line - line[0]) @ chord / max(chord @ chord, 1e-12), 0, 1)
    error = np.linalg.norm(line - line[0] - t[:, None] * chord, axis=1)
    i = error.argmax()
    if error[i] <= tolerance:
        return line[[0, -1]]
    return np.vstack(
        (
            simplify_line(line[: i + 1], tolerance)[:-1],
            simplify_line(line[i:], tolerance),
        )
    )


def borders(mask):
    filled = np.pad(mask, 1)
    edges = {}
    for neighbour, a, b in [
        (filled[:-2, 1:-1], (0, 0), (1, 0)),
        (filled[1:-1, 2:], (1, 0), (1, 1)),
        (filled[2:, 1:-1], (1, 1), (0, 1)),
        (filled[1:-1, :-2], (0, 1), (0, 0)),
    ]:
        for y, x in zip(*np.nonzero(mask & ~neighbour)):
            edges.setdefault((x + a[0], y + a[1]), []).append((x + b[0], y + b[1]))
    loops = []
    while edges:
        start = p = next(iter(edges))
        loop = []
        while p in edges:
            loop.append(p)
            dest = edges[p].pop()
            if not edges[p]:
                del edges[p]
            p = dest
            if p == start:
                break
        if len(loop) < 14:
            continue
        line = np.asarray(loop, dtype=float) - 0.5
        far = np.argmax(np.linalg.norm(line - line[0], axis=1))
        clean = np.vstack(
            (
                simplify_line(line[: far + 1], 1.30)[:-1],
                simplify_line(np.vstack((line[far:], line[:1])), 1.30)[:-1],
            )
        )
        if len(clean) >= 3:
            loops.append(clean)
    return loops


def relief(patches, side):
    cx = clasp_center(side)
    cy = 13.77
    scale = 44
    res = 143
    top = np.array([cx, cy]) - ((res - 1) / 2) / scale
    xyz = []
    rgb = []
    for bone in ("UpperBody", "LeftSkirt", "RightSkirt"):
        for p in patches[bone]:
            if (
                p.cap
                or p.normal[2] < 0.04
                or not (
                    p.edge[:, 0].max() > cx - 1.8
                    and p.edge[:, 0].min() < cx + 1.8
                    and p.edge[:, 1].min() < 15.45
                    and p.edge[:, 1].max() > 12.15
                )
            ):
                continue
            q, col = samples(p)
            keep = (abs(q[:, 0] - cx) < 1.75) & (abs(q[:, 1] - cy) < 1.75)
            xyz.extend(q[keep])
            rgb.extend(col[keep])
    pts = np.array(xyz)
    pigment = np.array(rgb)
    iy, ix = np.indices((res, res))
    grid = np.stack((ix, iy), -1) / scale + top
    dist, idx = cKDTree(pts[:, :2]).query(grid, k=18)
    depths = pts[idx, 2].copy()
    depths[dist > 0.083] = -20
    choice = np.take_along_axis(idx, depths.argmax(2)[..., None], axis=2)[..., 0]
    x, y = grid.transpose(2, 0, 1)
    height = depths.max(2)
    measured = (
        (height > cloth_depth(x, y, side) + 0.18)
        & (np.hypot(x - cx, y - cy) < 1.51)
        & (y > 12.40)
    )
    mask = gaussian_filter(measured.astype(float), 0.95) > 0.5
    ids, _ = label(mask)
    mask = ids == (1 + np.argmax(np.bincount(ids[mask])[1:]))
    gaps, _ = label(~mask)
    counts = np.bincount(gaps.ravel())
    mask |= (gaps != 0) & (counts[gaps] < 22)
    loops = borders(mask)
    # New rim texels and filled pinholes inherit a measured point on the relief.
    nearest = distance_transform_edt(
        ~(mask & measured), return_distances=False, return_indices=True
    )
    field = gaussian_filter(height[tuple(nearest)], 2.0)
    color = pigment[choice][tuple(nearest)]

    def sample(array, uv):
        return map_coordinates(
            array, np.moveaxis(uv[..., [1, 0]], -1, 0), order=1, mode="nearest"
        )

    def surface(uv):
        return np.column_stack((uv / scale + top, sample(field, uv)))

    def paint(points, normal):
        uv = (points[..., :2] - top) * scale
        return np.stack(
            [sample(channel, uv) for channel in color.transpose(2, 0, 1)], -1
        )

    # Constrained boundaries: split any missing rim edge before filling the interior.
    distance = distance_transform_edt(mask)
    eligible = distance > 2.0
    probes = np.stack((ix[eligible], iy[eligible]), axis=1).astype(float)
    interior = probes[:1]
    for iteration in range(10):
        outline = np.concatenate(loops)
        uv = np.vstack((outline, interior))
        mesh = Delaunay(uv)
        edges = {
            tuple(sorted((a, b)))
            for tri in mesh.simplices
            for a, b in zip(tri, np.roll(tri, -1))
        }
        offset = 0
        expanded = []
        for loop in loops:
            ring = []
            for j, a in enumerate(loop):
                k = (j + 1) % len(loop)
                ring.append(a)
                if tuple(sorted((offset + j, offset + k))) not in edges:
                    ring.append((a + loop[k]) / 2)
            expanded.append(np.asarray(ring))
            offset += len(loop)
        if sum(map(len, expanded)) > len(outline):
            loops = expanded
            continue
        simplex = mesh.find_simplex(probes)
        bary = (
            mesh.transform[simplex, :2]
            @ (probes - mesh.transform[simplex, 2])[..., None]
        )
        bary = bary[:, :, 0]
        weights = np.column_stack((bary, 1 - bary.sum(1)))
        interp = np.sum(weights * sample(field, uv)[mesh.simplices[simplex]], axis=1)
        err = abs(interp - sample(field, probes))
        spacing = cKDTree(uv).query(probes)[0]
        score = (err / 0.048 + spacing / 10) * (spacing > 4.5) * (simplex >= 0)
        add = []
        for k in np.argsort(-score):
            if score[k] < 1.45 or len(add) >= 13:
                break
            if (
                not add
                or np.linalg.norm(np.asarray(add) - probes[k], axis=1).min() > 5.5
            ):
                add.append(probes[k])
        if not add or iteration == 9:
            break
        interior = np.vstack((interior, add))
    outline = np.concatenate(loops)
    uv = np.vstack((outline, interior))
    mesh = Delaunay(uv)
    xyz = surface(uv)
    faces = []
    # Fill only the connected face inside the exterior and outside each eyelet.
    inside = Image.new("L", (res, res))
    pen = ImageDraw.Draw(inside)
    for j, loop in enumerate(
        sorted(
            loops,
            key=lambda v: -abs(
                np.sum(v[:, 0] * np.roll(v[:, 1], 1) - v[:, 1] * np.roll(v[:, 0], 1))
            ),
        )
    ):
        pen.polygon([tuple(q) for q in loop], fill=255 if j == 0 else 0)
    occupied = np.array(inside) > 0
    for tri in mesh.simplices:
        mid = uv[tri].mean(0).round().astype(int)
        if not occupied[mid[1], mid[0]]:
            continue
        # Pick the longest edge for an exact native geometry boundary.
        start = np.argmax(np.linalg.norm(xyz[tri] - xyz[np.roll(tri, -1)], axis=1))
        add_sheet(
            faces, xyz[np.roll(tri, -start)], FRONT, paint, density=80, seam=0.014
        )
    for loop in loops:
        rim = surface(loop)
        base = rim.copy()
        base[:, 2] = cloth_depth(rim[:, 0], rim[:, 1], side) - 0.012
        for j, a in enumerate(rim):
            k = (j + 1) % len(rim)
            edge = rim[k] - a
            outward = np.array([edge[1], -edge[0], 0])
            tone = np.maximum(0, sample(color[..., 0], loop[[j, k]]).mean() - 18)
            sidecolor = [tone, max(0, tone - 33), min(255, tone + 13)]
            add_sheet(
                faces, [a, rim[k], base[k], base[j]], outward, sidecolor, 64, seam=0.012
            )
    # A closed back fits the same pierced outline as the relief. It remains
    # visible from behind when the skirt swings away from the fastening.
    corners = (
        np.array([[0, 0], [res - 1, 0], [res - 1, res - 1], [0, res - 1]]) / scale + top
    )
    bottom = np.column_stack(
        (corners, cloth_depth(corners[:, 0], corners[:, 1], side) - 0.012)
    )
    cube, tile = sheet(bottom, -FRONT, [182, 149, 196], 64)
    loc, axes, size = face_frame(cube)
    xy = face_grid(loc, axes, size, tile.shape[:2])[..., :2]
    tile[..., 3] = (sample(occupied.astype(float), (xy - top) * scale) >= 0.5) * 255
    faces.append((cube, tile))
    return faces
