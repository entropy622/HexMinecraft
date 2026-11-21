"""Fold each wing along its span, using a single outline for both skins and the rim."""

import numpy as np
from scipy.ndimage import binary_closing, binary_fill_holes, median_filter
from shapely import box, contains_xy, get_parts, union_all
from shapely.geometry import Point, Polygon
from shapely.geometry.polygon import orient

from surfaces import PaintedSurface, crossings, outline
from waist import CUT, face_frame, face_grid


def skin_depths(patches, x, y):
    low = np.full((len(y), len(x)), np.inf)
    high = np.full_like(low, -np.inf)
    for cols, rows, z, _ in crossings(patches, (x, y, None), 2):
        at = rows, cols
        low[at] = np.minimum(low[at], z)
        high[at] = np.maximum(high[at], z)
    return low, high


def profile(x, depths):
    # Take the height-median section of each pleat. Fit shared creases at both
    # skins' slope changes, keeping the front and back physically separated.
    reliable = np.isfinite(depths)
    values = np.array(
        [
            np.median(col[ok]) if ok.any() else np.nan
            for col, ok in zip(depths.T, reliable.T)
        ]
    )
    valid = np.isfinite(values)
    return median_filter(np.interp(x, x[valid], values[valid]), size=3)


def clip_span(a, b, xa, xb, last):
    dx = b[0] - a[0]
    if abs(dx) < 1.0e-8:
        if not (xa <= a[0] < xb or (last and a[0] == xb)):
            return None
    else:
        t = np.clip(np.sort([(xa - a[0]) / dx, (xb - a[0]) / dx]), 0, 1)
        if t[1] - t[0] < 1.0e-6:
            return None
        a, b = a + (b - a) * t[0], a + (b - a) * t[1]
    return a, b


def edge_wall(surface, a, b, knots, pair, source_interval, step):
    length = np.linalg.norm(b - a)
    v = np.r_[(a - b) / length, 0.0]
    bounds = np.array([np.interp([a[0], b[0]], knots, z) for z in pair]).ravel()
    if source_interval is not None:
        xy = a + (b - a) * np.linspace(0, 1, max(3, int(length / step) + 1))[:, None]
        limits = source_interval(xy).ravel()
        bounds = np.r_[bounds, limits[np.isfinite(limits)]]
    z0, z1 = bounds.min(), bounds.max()
    center = np.r_[(a + b) / 2, (z0 + z1) / 2]
    toward = np.array([0.0, 0.0, 1.0])

    def in_panel(pos):
        back, front = [np.interp(pos[..., 0], knots, z) for z in pair]
        return (pos[..., 2] >= back - 0.02) & (pos[..., 2] <= front + 0.02)

    surface.panel(center, toward, v, z1 - z0, length, in_panel)
    if source_interval is not None:

        def original_step(pos):
            back, front = source_interval(pos)
            return (
                (pos[..., 2] >= back - 0.02)
                & (pos[..., 2] <= front + 0.02)
                & ~in_panel(pos)
            )

        surface.panel(center, -toward, v, z1 - z0, length, original_step)


def wing(patches, retained):
    surface = PaintedSurface(patches)
    xyz = surface.xyz
    step = 0.05
    lo = np.floor(xyz[:, :2].min(0) / step - 3).astype(int)
    hi = np.ceil(xyz[:, :2].max(0) / step + 3).astype(int)
    x, y = [(np.arange(a, b) + 0.5) * step for a, b in zip(lo, hi)]
    low, high = skin_depths(patches, x, y)
    inside = binary_fill_holes(binary_closing(np.isfinite(low), iterations=2))
    shape = orient(
        max(get_parts(outline(inside, lo, step)), key=lambda g: g.area).simplify(0.075),
        sign=1,
    )
    # Keep the small crest blocks and the shoulder cut containing a separate
    # coat fold. Both have depth changes that are independent of the membrane.
    roof = np.array([y[col].max() if col.any() else np.nan for col in inside.T])
    valid = np.isfinite(roof)
    roof = median_filter(np.interp(x, x[valid], roof[valid]), size=3)
    crest = Polygon([*zip(x, roof - 0.34), (x[-1], 24), (x[0], 24)]).simplify(0.045)
    keep = union_all([box(-4.9, 10, 4.9, 24), box(-6.4, 10, 6.4, 16.23), crest])
    expanded = keep.buffer(0.025)
    for cube, source_tile in retained:
        center, basis, span = face_frame(cube)
        world = face_grid(center, basis, span, source_tile.shape[:2])
        tile = source_tile.copy()
        tile[..., 3] = np.where(
            contains_xy(expanded, world[..., 0], world[..., 1]) & (tile[..., 3] >= CUT),
            255,
            0,
        )
        if tile[..., 3].any():
            surface.faces.append((cube, tile))
    shape = shape.difference(keep)
    # A second pair of profiles carries the raised leading edge. The original
    # fold is visible on both skins, with the terminal spar running to the tip.
    side = 1 if x.mean() > 0 else -1
    outward = side * x
    top = np.interp(
        outward,
        [2.8, 4.7, 5.45, 6.38, 6.85, 7.45, 8.45, 9.35, 10.18, 10.28, 11.6],
        [20.3, 19.65, 20.15, 20.85, 20.82, 20.16, 19.15, 17.94, 16.5, 12, 12],
    )
    curve = np.column_stack((x, top))
    cover = Polygon([*map(tuple, curve), (x[-1], 24), (x[0], 24)]).simplify(0.04)
    ridge = shape.intersection(cover)
    membrane = shape.difference(cover)
    above = y[:, None] >= top
    all_depths = []
    for area in (~above, above):
        pair = []
        for field in (low, high):
            selected = np.where(area, field, np.inf)
            z = profile(x, selected)
            pair.append(z)
        mid = (pair[0] + pair[1]) / 2
        half = np.maximum((pair[1] - pair[0]) / 2, 0.115)
        all_depths.extend([mid - half, mid + half])
    depths = np.array(all_depths)
    depths[2] = np.minimum(depths[2], depths[0] - 0.055)
    depths[3] = np.maximum(depths[3], depths[1] + 0.055)
    first, last = [np.abs(x - v).argmin() for v in (shape.bounds[0], shape.bounds[2])]
    # Discard a grazing single-sided sample at the extreme end of the wing.
    depths[:, : first + 2] = depths[:, [first + 2]]
    depths[:, last - 1 :] = depths[:, [last - 2]]
    stations = {first, last}

    def split(a, b):
        if b - a <= 8:
            return
        fit = depths[:, a, None] + (
            depths[:, b, None] - depths[:, a, None]
        ) * np.linspace(0, 1, b - a + 1)
        error = abs(depths[:, a : b + 1] - fit).max(0)
        k = 4 + error[4:-4].argmax()
        if error[k] > 0.19:
            stations.add(a + k)
            split(a, a + k)
            split(a + k, b)

    split(first, last)
    ids = sorted(stations)
    knots = x[ids].copy()
    knots[[0, -1]] = shape.bounds[0], shape.bounds[2]
    skins = depths[:, ids]
    up = np.array([0.0, 1.0, 0.0])

    def source_interval(points):
        col = np.clip(
            np.rint((points[..., 0] - x[0]) / step).astype(int), 0, len(x) - 1
        )
        row = np.clip(
            np.rint((points[..., 1] - y[0]) / step).astype(int), 0, len(y) - 1
        )
        return np.array([low[row, col], high[row, col]])

    for i, (xa, xb) in enumerate(zip(knots, knots[1:])):
        strip = box(xa, shape.bounds[1] - 1, xb, shape.bounds[3] + 1)
        for part, offset in [(membrane, 0), (ridge, 2)]:
            region = part.intersection(strip)
            if region.area < 1.0e-6:
                continue
            _, ymin, _, ymax = region.bounds
            for j, sign in [(0, -1), (1, 1)]:
                za, zb = skins[j + offset, i : i + 2]
                direction = np.array([xb - xa, 0.0, zb - za])
                length = np.linalg.norm(direction)
                center = np.array([(xa + xb) / 2, (ymin + ymax) / 2, (za + zb) / 2])
                surface.panel(
                    center,
                    sign * direction / length,
                    up,
                    length,
                    ymax - ymin,
                    lambda world: contains_xy(
                        part.buffer(0.008), world[..., 0], world[..., 1]
                    ),
                )
        # Split the same outline at the exact skin folds for a continuous edge wall.
        for part, offset in [(membrane, 0), (ridge, 2)]:
            for poly in get_parts(part):
                if poly.geom_type != "Polygon":
                    continue
                contour = orient(poly, sign=1).exterior
                for a, b in zip(contour.coords, list(contour.coords)[1:]):
                    a, b = np.array(a), np.array(b)
                    clipped = clip_span(a, b, xa, xb, i == len(knots) - 2)
                    if clipped is None:
                        continue
                    a, b = clipped
                    shared = shape.boundary.distance(Point((a + b) / 2)) > 0.001
                    if shared and offset == 0:
                        continue
                    pairs = [(2, 0), (1, 3)] if shared else [(offset, offset + 1)]
                    seam = keep.boundary.distance(Point((a + b) / 2)) < 0.001
                    for near, far in pairs:
                        edge_wall(
                            surface,
                            a,
                            b,
                            knots,
                            skins[[near, far]],
                            source_interval if seam else None,
                            step,
                        )
    return surface.faces
