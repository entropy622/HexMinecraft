"""Continuous front facings over the slit, retaining the embroidery below the knee."""

import numpy as np
from scipy.spatial import cKDTree

from hem import samples
from waist import FRONT, add_sheet


def bounds(panel, y):
    left = -2.89 + 0.134 * y
    middle = 0.165 - 0.083 * y
    right = 3.18 - 0.17 * y
    if panel == "left_edge":
        return left - 0.20, left
    if panel == "left_cloth":
        return left - 2.12, left - 0.20
    if panel == "center_edge":
        return middle, middle + 0.19
    if panel == "center":
        return middle + 0.19, right
    return right, right + 1.96


def depth(panel, x, y):
    if panel.startswith("left"):
        edge = -2.89 + 0.134 * y
        return np.interp(
            y, [0.14, 3.2, 7.0, 9.5, 12.3, 13.12], [6.15, 5.65, 5.06, 4.65, 4.12, 3.94]
        ) + 0.16 * (x - edge)
    front = np.interp(
        y, [0.14, 3.2, 7.0, 9.5, 12.3, 13.12], [6.55, 6.04, 5.34, 4.84, 4.19, 4.01]
    )
    if panel == "right_cloth":
        front = front - 0.28 - 0.21 * (x - (3.18 - 0.17 * y))
    return front


# Patches low enough to contain the original embossed hem only receive narrow facings.
PANELS = {
    "left_edge": ("RightSkirt", 0.16, 13.12),
    "center_edge": ("LeftSkirt", 0.16, 13.12),
    "center": ("LeftSkirt", 3.22, 13.12),
    "left_cloth": ("RightSkirt", 9.42, 13.12),
    "right_cloth": ("LeftSkirt", 9.42, 13.12),
}


def replaced(xyz):
    x, y, z = xyz.transpose(2, 0, 1)
    inside = np.zeros(x.shape, bool)
    for panel, (_, low, high) in PANELS.items():
        lo, hi = bounds(panel, y)
        inside |= (
            (y >= low)
            & (y <= high)
            & (x >= lo - 0.025)
            & (x <= hi + 0.025)
            & (z > depth(panel, x, y) - 0.83)
        )
    return inside


def surfaces(patches):
    parts = {"RightSkirt": [], "LeftSkirt": []}
    pigments = {
        "center": [225, 211, 226],
        "center_edge": [220, 201, 224],
        "left_edge": [202, 177, 210],
        "left_cloth": [197, 168, 207],
        "right_cloth": [203, 177, 211],
    }
    pts = []
    colors = []
    for bone in ("RightSkirt", "LeftSkirt"):
        for p in patches[bone]:
            if p.cap or p.normal[2] < 0.55:
                continue
            q, c = samples(p)
            keep = (q[:, 2] > 2) & (abs(q[:, 0]) < 5) & (c[:, 2] > c[:, 1])
            pts.extend(q[keep])
            colors.extend(c[keep])
    pts = np.asarray(pts)
    colors = np.asarray(colors)
    for panel, (bone, lo, hi) in PANELS.items():
        lx, rx = bounds(panel, pts[:, 1])
        suitable = (
            (pts[:, 0] >= lx - 0.15)
            & (pts[:, 0] <= rx + 0.15)
            & (abs(pts[:, 2] - depth(panel, pts[:, 0], pts[:, 1])) < 0.17)
        )
        tree = cKDTree(pts[suitable, :2])
        source = colors[suitable].astype(float)
        base = np.array(pigments[panel])

        def pigment(xyz, n):
            uv = np.round(xyz[..., :2] * 7) / 7
            _, near = tree.query(uv, k=4)
            return np.clip(
                np.round(np.median(source[near], axis=-2) / 3) * 3, base - 14, base + 14
            )

        levels = sorted(
            {lo, hi, *[y for y in (3.2, 3.22, 7.0, 9.42, 9.5, 12.3) if lo < y < hi]}
        )
        # All adjacent faces use the same knots along their long seam.
        for a, b in zip(levels, levels[1:]):
            lx, rx = bounds(panel, np.array([a, b]))
            y = np.array([a, b])
            left = np.column_stack((lx, y, depth(panel, lx, y)))
            right = np.column_stack((rx, y, depth(panel, rx, y)))
            add_sheet(
                parts[bone],
                [left[0], left[1], right[1], right[0]],
                FRONT,
                pigment,
                54,
                seam=0.014,
            )
            walls = []
            if panel == "left_edge":
                walls.append((right, 1, 0.40))
            if panel == "center_edge":
                walls.append((left, -1, 0.40))
            if panel == "center":
                walls.append((right, 1, 0.34))
            if panel == "left_cloth":
                walls.append((left, -1, 0.55))
            if panel == "right_cloth":
                walls.append((right, 1, 0.55))
            for edge, sign, width in walls:
                back = edge - [0, 0, width]
                add_sheet(
                    parts[bone],
                    [edge[0], edge[1], back[1], back[0]],
                    np.array([sign, 0, 0]),
                    [174, 145, 189],
                    52,
                    seam=0.012,
                )
            if a == lo:
                drop = np.array([0, 0, 0.67])
                add_sheet(
                    parts[bone],
                    [left[0], right[0], right[0] - drop, left[0] - drop],
                    np.array([0, -1, 0]),
                    [186, 159, 197],
                    52,
                    seam=0.012,
                )
    return parts


def belt_cut(xyz):
    x, y, z = xyz.transpose(2, 0, 1)
    band = (abs(x) < 2.29) & (y >= 12.88) & (y < 13.89) & (z > 3.14 - 0.04 * x * x)
    blouse = (abs(x) < 1.16) & (y >= 13.77) & (y <= 17.95) & (z > 3.12)
    return band | blouse


def belt():
    out = []
    widths = np.array([-2.29, -1.32, 0, 1.32, 2.29])
    levels = [
        (12.89, 3.55),
        (12.89, 4.12),
        (12.97, 4.23),
        (13.09, 4.23),
        (13.15, 4.19),
        (13.70, 4.04),
        (13.82, 3.99),
        (13.88, 3.72),
        (13.88, 3.34),
    ]
    colors = [
        [177, 150, 188],
        [196, 166, 205],
        [218, 193, 220],
        [193, 164, 203],
        [222, 202, 223],
        [212, 187, 218],
        [216, 196, 220],
        [205, 180, 211],
    ]

    def row(y, z):
        return np.column_stack((widths, np.full(len(widths), y), z - 0.055 * widths**2))

    for (a, b), c in zip(zip(levels, levels[1:]), colors):
        lo, hi = row(*a), row(*b)
        for j in range(len(widths) - 1):
            pts = [lo[j], lo[j + 1], hi[j + 1], hi[j]]
            n = np.cross(pts[1] - pts[0], pts[3] - pts[0])
            add_sheet(out, pts, n, c)
    return out


def bodice():
    # The shaded front panel continues behind the waist band. The small closures
    # stand in front of the placket rather than sharing depth with its fabric.
    y = np.array([13.77, 14.55, 15.62, 16.65, 17.55, 17.95])
    z = np.array([3.70, 3.64, 3.36, 3.37, 3.57, 3.59])
    out = []
    widths = [-1.16, -0.045, 0.035, 1.16]
    for j in range(len(y) - 1):
        for k, c in enumerate([[226, 210, 228], [183, 149, 200], [229, 214, 231]]):
            a, b = widths[k : k + 2]
            pts = np.array(
                [
                    [a, y[j], z[j]],
                    [a, y[j + 1], z[j + 1]],
                    [b, y[j + 1], z[j + 1]],
                    [b, y[j], z[j]],
                ]
            )
            add_sheet(out, pts, FRONT, c, 48, seam=0.009)
        for a, sign in [(widths[0], -1), (widths[-1], 1)]:
            lo = np.array([a, y[j], z[j]])
            hi = np.array([a, y[j + 1], z[j + 1]])
            d = np.array([0, 0, 0.25])
            add_sheet(
                out, [lo, hi, hi - d, lo - d], np.array([sign, 0, 0]), [213, 193, 218]
            )
    for h, w in [(14.87, 0.43), (15.80, 0.49), (17.43, 0.54)]:
        center = np.array([-0.035, h, np.interp(h, y, z) + 0.064])
        half = np.array([w / 2, 0.042, 0.064])
        for axis in range(3):
            a, b = (axis + 1) % 3, (axis + 2) % 3
            for sign in [-1, 1]:
                n = np.eye(3)[axis] * sign
                pts = []
                for sa, sb in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
                    point = center + half * n
                    point[a] += sa * half[a]
                    point[b] += sb * half[b]
                    pts.append(point)
                add_sheet(
                    out, pts, n, [160, 107, 183] if axis == 2 else [174, 130, 190]
                )
    return out
