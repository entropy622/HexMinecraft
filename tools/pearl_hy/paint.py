"""Bake the HY albedo onto the fitted surface, with sealed mip-safe boundaries."""

import math
from copy import deepcopy

import numpy as np
from pearl_cut import panel
from PIL import Image, ImageDraw, ImageFilter
from sheets import sheets

FRONT = np.array([0.0, 0.0, 1.0])


def front_color(scan, x, y):
    o = np.stack([x, y, np.full_like(x, 8.0)], -1)
    r = scan.rays(o.reshape(-1, 3), -FRONT)
    o[..., 2] -= r["tfar"].reshape(x.shape)
    return scan.color(o, FRONT)


def bake(scan, bones, surfaces):
    tiles = []
    for name, sections in surfaces.items():
        for center, n, u, v, xy, cap in (
            (c, n, u, v, xy, cap)
            for tris, cap in sections
            if len(tris)
            for c, n, u, v, xy in sheets(tris)
        ):
            density = 25 if name == "Head" else 17
            lo = xy.min((0, 1)) - 0.055
            hi = xy.max((0, 1)) + 0.055
            w, h = np.maximum(4, np.ceil((hi - lo) * density)).astype(int)
            # Rectangle spans the union's plane. Every island and interior hole
            # in its footprint is carried by the native texture alpha.
            corners = np.array([lo, [hi[0], lo[1]], hi, [lo[0], hi[1]]])
            panel(
                bones[name],
                "skin",
                center + corners[:, 0, None] * u + corners[:, 1, None] * v,
                u,
                n,
                (0, 0),
                False,
            )
            cube = bones[name]["cubes"][-1]
            for k in ("_part", "_cut", "_depth", "_hem"):
                cube.pop(k)
            uv = cube["uv"]["north"]
            coords = (xy - lo) / (hi - lo) * [w, h]
            coords[:, :, 1] = h - coords[:, :, 1]
            mask = Image.new("L", (w * 2, h * 2))
            draw = ImageDraw.Draw(mask)
            for tr in coords:
                draw.polygon([tuple(pt) for pt in tr * 2], fill=255)
            mask = mask.filter(ImageFilter.MaxFilter(3)).resize(
                (w, h), Image.Resampling.BOX
            )
            alpha = np.asarray(mask)
            if not alpha.any():
                bones[name]["cubes"].pop()
                continue
            tx, ty = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
            xyz = (
                center
                + (lo[0] + tx * (hi[0] - lo[0]))[..., None] * u
                + (hi[1] - ty * (hi[1] - lo[1]))[..., None] * v
            )
            rgb = scan.color(xyz, n)
            # Avoid neighbouring limbs bleeding into closed caps when they rotate.
            inside = np.full(xyz.shape[:2], cap)
            if inside.any():
                shade = (
                    [243, 202, 192]
                    if name.endswith("Arm") and not name.endswith("ForeArm")
                    else [194, 164, 200]
                    if not name.startswith("Tail")
                    else [176, 140, 184]
                )
                rgb[inside] = shade
                if name.endswith("Leg"):
                    rgb[inside & (xyz[..., 1] > 4)] = [249, 202, 190]
                    rgb[inside & (xyz[..., 1] <= 4)] = [221, 201, 227]
                if name.endswith("ForeArm"):
                    rgb[inside & (xyz[..., 1] < 11.95)] = [244, 198, 183]
            x, y, z = xyz.transpose(2, 0, 1)
            eyes = (
                name == "Head"
                and not cap
                and n[2] > 0.55
                and np.any((abs(x) < 3.35) & (y > 22.28) & (y < 24.75) & (z > 3.25))
            )
            if eyes:
                face = (abs(x) < 3.42) & (y > 21) & (y < 24.78) & (z > 3.25)
                rgb[face] = front_color(scan, x[face], y[face])
            tiles.append((uv, np.dstack([rgb, alpha])))
            if not eyes:
                continue
            window = (
                (abs(x) > 1.08)
                & (abs(x) < 3.18)
                & (y > 22.43)
                & (y < 24.57)
                & (z > 3.24)
            )
            if not np.any(window & (alpha > 0)):
                continue
            for expr, scale, dy in [
                ("Blink", 0.09, 0.08),
                ("CuriousEyes", 1.06, 0.045),
                ("IntentEyes", 0.70, 0.02),
                ("WideEyes", 1.15, 0),
            ]:
                c = deepcopy(cube)
                c["origin"][2] += 0.07
                c["pivot"][2] += 0.07
                bones[expr].setdefault("cubes", []).append(c)
                sy = (y - 23.43 - dy) / scale + 23.43
                if expr == "CuriousEyes":
                    sy += 0.12 * np.sign(x)
                sy = np.where((sy < 22.46) | (sy > 24.56), 22.38, sy)
                col = rgb.copy()
                col[window] = front_color(scan, x[window], sy[window])
                tiles.append((c["uv"]["north"], np.dstack([col, alpha * window])))
    tiles.sort(key=lambda t: -t[1].shape[0])
    width = 2048
    x = y = row = 0
    places = []
    for field, pix in tiles:
        h, w = pix.shape[:2]
        if x + w + 4 > width:
            x = 0
            y += row
            row = 0
        places.append((x, y))
        field.update(uv=[x + 2, y + 2], uv_size=[w, h])
        x += w + 4
        row = max(row, h + 4)
    atlas = Image.new("RGBA", (width, 2 ** math.ceil(math.log2(y + row))))
    for (_, pix), at in zip(tiles, places):
        atlas.paste(
            Image.fromarray(np.pad(pix, ((2, 2), (2, 2), (0, 0)), mode="edge")), at
        )
    return atlas
