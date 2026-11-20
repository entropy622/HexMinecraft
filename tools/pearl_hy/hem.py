"""Repair the closed scan beneath the skirt, using its actual hem and shoe paint."""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial import cKDTree
from math import asin, atan2, degrees


SKIRTS = {"Skirt", "LeftSkirt", "RightSkirt"}
LEGS = {"RightLeg", "RightLowerLeg", "LeftLeg", "LeftLowerLeg"}
FLIP = np.array([1, 1, -1])


def native_rotation(basis):
    y = asin(np.clip(-basis[2, 0], -1, 1))
    if abs(np.cos(y)) > 1e-7:
        x, z = atan2(basis[2, 1], basis[2, 2]), atan2(basis[1, 0], basis[0, 0])
    else:
        x, z = 0, atan2(-basis[0, 1], basis[1, 1])
    return [round(degrees(a), 6) for a in (x, -y, -z)]


def samples(patch):
    row, col = np.nonzero(patch.tile[..., 3] >= 128)
    h, w = patch.tile.shape[:2]
    xy = np.column_stack(((col + 0.5) / w - 0.5, 0.5 - (row + 0.5) / h)) * patch.span
    return patch.center + xy @ patch.basis[:, :2].T, patch.tile[row, col, :3]


def outer_skirt(p, lining_radius):
    if p.cap and np.array_equal(p.tile[p.tile[..., 3] > 24, :3][0], [194, 164, 200]):
        # The original segmentation closed every split with this exact pigment.
        return False
    if p.normal[1] < -0.26 and p.center[1] < 0.83 and p.edge[:, 1].max() < 1.15:
        return False
    if p.normal[1] < -0.08 or p.normal[[0, 2]] @ (p.center[[0, 2]] - [0, 0.65]) < 1:
        h, w = p.tile.shape[:2]
        row, col = np.indices((h, w))
        xy = np.stack(((col + 0.5) / w - 0.5, 0.5 - (row + 0.5) / h), axis=-1) * p.span
        xyz = p.center + xy @ p.basis[:, :2].T
        radial = xyz[..., [0, 2]] - [0, 0.65]
        angle = np.degrees(np.arctan2(radial[..., 0], radial[..., 1])) % 360
        cutoff = lining_radius(angle, xyz[..., 1])
        # Only discarded scan material inside the new lining is masked. Faces at
        # the open lapels and the exterior faces of the embroidered hem survive.
        inside = (
            (np.linalg.norm(radial, axis=2) < cutoff + 0.12)
            & (angle >= 2)
            & (angle <= 332)
            & (xyz[..., 1] < 12.8)
        )
        p.tile[inside, 3] = 0
        if not np.any(p.tile[..., 3] > 24):
            return False
    return True


def sheet(vertices, normal, paint, density=10, seam=0):
    pts = np.asarray(vertices)
    u = pts[1] - pts[0]
    u /= np.linalg.norm(u)
    n = np.cross(pts[1] - pts[0], pts[-1] - pts[0])
    n /= np.linalg.norm(n)
    if n @ normal < 0:
        n = -n
    v = np.cross(n, u)
    basis = np.column_stack((u, v, n))
    xy = pts @ basis[:, :2]
    lo, hi = xy.min(0) - seam, xy.max(0) + seam
    span = hi - lo
    w, h = np.maximum(2, np.ceil(span * density).astype(int))
    corners = (xy - lo) / span * [w, h]
    corners[:, 1] = h - corners[:, 1]
    mask = Image.new("L", (w * 4, h * 4))
    ImageDraw.Draw(mask).polygon([tuple(point * 4) for point in corners], fill=255)
    if seam:
        mask = mask.filter(ImageFilter.MaxFilter(5))
    alpha = np.array(mask.resize((w, h), Image.Resampling.BOX))
    row, col = np.indices((h, w), dtype=float)
    plane = np.dot(pts.mean(0), n)
    xyz = (
        (lo[0] + (col[..., None] + 0.5) * span[0] / w) * u
        + (hi[1] - (row[..., None] + 0.5) * span[1] / h) * v
        + plane * n
    )
    rgb = paint(xyz, n) if callable(paint) else np.broadcast_to(paint, (h, w, 3))
    tile = np.dstack((rgb, alpha)).astype("u1")
    center = (basis @ [*(0.5 * (lo + hi)), plane - 0.01]) * FLIP
    size = np.r_[span, 0.02]
    cube = dict(
        origin=(center - size / 2).round(6).tolist(),
        size=size.round(6).tolist(),
        pivot=center.round(6).tolist(),
        rotation=native_rotation(basis),
        uv={"north": {}},
    )
    return cube, tile


def shoe_reference(bones):
    points, colors = [], []
    for name in ("RightLeg", "RightLowerLeg"):
        for p in bones[name]:
            if p.cap or p.normal[2] < 0.36:
                continue
            xyz, rgb = samples(p)
            keep = xyz[:, 2] > 3.6
            points.extend(xyz[keep, :2])
            colors.extend(rgb[keep])
    return cKDTree(np.array(points)), np.array(colors)


def legs(reference):
    tree, colors = reference
    result = {}
    # A flat toe, clipped corners, a narrow heel and a complete back to each calf.
    profile = np.array(
        [
            [-0.62, 1],
            [0.62, 1],
            [1, 0.68],
            [1, -0.55],
            [0.64, -1],
            [-0.64, -1],
            [-1, -0.55],
            [-1, 0.68],
        ]
    )
    # Height, half width, rear and front depth in the source pose.
    sections = [
        (0.07, 1.39, 1.42, 5.94),
        (0.38, 1.42, 1.40, 5.99),
        (1.02, 1.36, 1.46, 5.96),
        (1.40, 1.27, 1.54, 5.77),
        (1.82, 1.16, 1.64, 5.52),
        (2.54, 1.10, 1.67, 5.40),
        (3.58, 1.17, 1.76, 5.45),
        (3.85, 1.12, 1.78, 5.34),
        (4.06, 1.04, 1.81, 5.12),
        (6.60, 1.03, 1.66, 4.61),
        (9.65, 1.12, 1.25, 3.91),
        (13.03, 1.13, 1.05, 3.16),
    ]
    for side in ("Right", "Left"):
        left = side == "Left"
        cx = 1.44 if left else -1.38
        stagger = -1.22 if left else 0
        thigh, shin = result[side + "Leg"], result[side + "LowerLeg"] = [], []

        def ring(level):
            y, w, back, front = level
            return np.column_stack(
                (
                    cx + profile[:, 0] * w,
                    np.full(8, y),
                    stagger + (front + back) / 2 + profile[:, 1] * (front - back) / 2,
                )
            )

        def paint(xyz, normal):
            x, y, z = xyz.transpose(2, 0, 1)
            pigment = np.zeros(xyz.shape)
            for limit, shade in [
                (20, [247, 203, 191]),
                (4.07, [217, 199, 224]),
                (3.86, [235, 221, 236]),
                (3.30, [209, 184, 218]),
                (2.9, [234, 217, 231]),
                (2.48, [245, 205, 195]),
                (1.98, [208, 178, 215]),
                (1.63, [235, 220, 235]),
                (1.14, [188, 163, 200]),
                (0.57, [160, 135, 174]),
                (0.34, [139, 116, 155]),
            ]:
                pigment[y < limit] = shade
            if normal[1] < -0.88:
                # A mauve leather sole with a small heel and forefoot insert.
                local = z - stagger
                inset = (abs(x - cx) < 1.04) & (local > 1.75) & (local < 5.55)
                pigment[:] = [186, 161, 172]
                pigment[inset & (local < 2.62)] = [165, 138, 155]
                pigment[inset & (local > 3.76)] = [179, 151, 164]
            elif normal[2] > 0.38:
                source_x = -1.38 - (x - cx) if left else x
                dist, idx = tree.query(np.stack((source_x, y), axis=-1))
                use = (dist < 0.16) & (z - stagger > 3.8) & (y > 0.36)
                pigment[use] = colors[idx[use]]
            return pigment

        for a, b in zip(sections, sections[1:]):
            bottom, top = ring(a), ring(b)
            faces = shin if b[0] <= 6.60 else thigh
            for j in range(8):
                k = (j + 1) % 8
                outward = (bottom[j] + bottom[k]) / 2 - [
                    cx,
                    a[0],
                    (a[2] + a[3]) / 2 + stagger,
                ]
                faces.append(
                    sheet([bottom[j], bottom[k], top[k], top[j]], outward, paint, 16)
                )
        for level, faces, sign in [
            (sections[0], shin, -1),
            (sections[-3], shin, 1),
            (sections[-3], thigh, -1),
            (sections[-1], thigh, 1),
        ]:
            faces.append(sheet(ring(level), np.array([0, sign, 0]), paint, 16))
    return result


def lining(bones):
    # Trace the lower outside of the garment in its own pose. Leave the front
    # opening between the two lapels and bind each length of lining to its hem.
    pts = []
    for name in SKIRTS:
        for p in bones[name]:
            if p.cap or abs(p.normal[1]) > 0.77 or p.edge[:, 1].min() > 1.6:
                continue
            xyz, _ = samples(p)
            pts.extend(xyz[(xyz[:, 1] < 1.65)])
    pts = np.array(pts)
    center = np.array([0, 0.65])
    delta = pts[:, [0, 2]] - center
    angle = np.degrees(np.arctan2(delta[:, 0], delta[:, 1])) % 360
    radii = np.linalg.norm(delta, axis=1)
    angles = [
        2,
        14,
        29,
        44,
        60,
        77,
        94,
        106,
        112,
        126,
        144,
        161,
        180,
        199,
        216,
        234,
        248,
        254,
        266,
        283,
        300,
        316,
        328,
        332,
    ]
    rings = []
    for a in angles:
        select = abs((angle - a + 180) % 360 - 180) < 3
        radius = np.percentile(radii[select], 93)
        d = np.array([np.sin(np.radians(a)), np.cos(np.radians(a))])
        rows = []
        for y, r in [
            (0.23, radius - 0.28),
            (0.30, radius - 0.57),
            (0.90, radius - 0.73),
            (5.8, radius * 0.69),
            (10.3, radius * 0.49),
            (12.95, radius * 0.37),
        ]:
            x, z = center + d * r
            rows.append(np.array([x, y, z]))
        rings.append(rows)
    result = {name: [] for name in SKIRTS}
    for i, (a, b) in enumerate(zip(rings, rings[1:])):
        mid_angle = (angles[i] + angles[i + 1]) / 2
        name = (
            "Skirt"
            if 109 <= mid_angle <= 251
            else ("LeftSkirt" if mid_angle < 180 else "RightSkirt")
        )
        for j, pigment in enumerate(
            [
                [173, 148, 184],
                [182, 157, 192],
                [197, 174, 204],
                [191, 168, 199],
                [182, 159, 192],
            ]
        ):
            toward = np.array(
                [-np.sin(np.radians(mid_angle)), 0, -np.cos(np.radians(mid_angle))]
            )
            if j == 0:
                toward = np.array([0, -1, 0])
            pts = [a[j], b[j], b[j + 1], a[j + 1]]
            # Changing radius across layers can twist a quad. Keep the shared
            # diagonal when the fourth corner departs from the fitted plane.
            normal = np.cross(pts[1] - pts[0], pts[3] - pts[0])
            if abs(np.dot(pts[2] - pts[0], normal)) / np.linalg.norm(normal) > 0.035:
                for indices in ((0, 1, 2), (0, 2, 3)):
                    result[name].append(
                        sheet([pts[k] for k in indices], toward, pigment, seam=0.055)
                    )
            else:
                result[name].append(sheet(pts, toward, pigment, seam=0.055))
    heights = np.array([row[1] for row in rings[0]])
    radii = np.linalg.norm(np.array(rings)[:, :, [0, 2]] - center, axis=2)

    def interior_radius(angle, y):
        level = np.clip(np.searchsorted(heights, y) - 1, 0, len(heights) - 2)
        distances = np.stack([np.interp(angle, angles, r) for r in radii.T])
        low = np.take_along_axis(distances, level[None], axis=0)[0]
        high = np.take_along_axis(distances, (level + 1)[None], axis=0)[0]
        fraction = np.clip(
            (y - heights[level]) / (heights[level + 1] - heights[level]), 0, 1
        )
        return low + (high - low) * fraction

    return result, interior_radius
