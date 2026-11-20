"""Native waist fittings and the coverage boundaries of the opaque cloth."""

import numpy as np
from scipy.ndimage import distance_transform_edt, map_coordinates
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation

from hem import FLIP, native_rotation, sheet


CUT = 115  # The original skin uses alpha as geometric coverage.
FRONT = np.array([0.0, 0.0, 1.0])


def face_frame(cube):
    axes = Rotation.from_euler(
        "xyz", np.asarray(cube["rotation"]) * [1, -1, -1], degrees=True
    ).as_matrix()
    span = np.asarray(cube["size"])
    pivot = np.asarray(cube["pivot"]) * FLIP
    center = (np.asarray(cube["origin"]) + span / 2) * FLIP
    loc = pivot + axes @ (center - pivot + [0, 0, span[2] / 2])
    return loc, axes, span[:2]


def face_grid(loc, axes, size, shape):
    h, w = shape
    row, col = np.indices(shape)
    xy = np.stack(((col + 0.5) / w - 0.5, 0.5 - (row + 0.5) / h), axis=-1) * size
    return loc + xy @ axes[:, :2].T


def tight_face(cube, tile, loc, axes, size):
    """Place hard straight island edges on the sides of an oriented native quad."""
    h, w = tile.shape[:2]
    alpha = np.pad(tile[..., 3].astype(float), 1)
    filled = alpha >= CUT
    intersections = []
    for axis in (0, 1):
        a, b = (alpha[:-1], alpha[1:]) if axis == 0 else (alpha[:, :-1], alpha[:, 1:])
        row, col = np.nonzero((a >= CUT) != (b >= CUT))
        if len(row):
            v = (CUT - a[row, col]) / (b[row, col] - a[row, col])
            intersections.extend(
                np.column_stack(
                    (
                        col - 0.5 + (v if axis == 1 else 0),
                        row - 0.5 + (v if axis == 0 else 0),
                    )
                )
            )
    if len(intersections) < 3:
        return cube, tile
    points = np.clip(intersections, [0, 0], [w, h])
    xy = (points / [w, h] - 0.5) * size * [1, -1]
    hull = xy[ConvexHull(xy).vertices]
    delta = np.roll(hull, -1, axis=0) - hull
    angles = np.r_[0, np.arctan2(delta[:, 1], delta[:, 0]) % (np.pi / 2)]
    cs, sn = np.cos(angles), np.sin(angles)
    bases = np.stack((np.stack((cs, -sn), axis=1), np.stack((sn, cs), axis=1)), axis=1)
    proj = xy @ bases
    dims = np.ptp(proj, axis=1)
    k = np.argmin(dims.prod(axis=1))
    basis = bases[k]
    extent = dims[k]
    if extent.min() < 0.008:
        return cube, tile
    mid = (proj[k].min(0) + proj[k].max(0)) / 2
    center = loc + axes[:, :2] @ (basis @ mid)
    frame = np.column_stack((axes[:, :2] @ basis, axes[:, 2]))
    density = max(36, min(60, max([w, h] / size)))
    nw, nh = np.maximum(2, np.ceil(extent * density).astype(int))
    iy, ix = np.indices((nh, nw))
    local = np.stack(((ix + 0.5) / nw - 0.5, 0.5 - (iy + 0.5) / nh), axis=-1) * extent
    orig = (local + mid) @ basis.T / size
    coord = np.stack(((0.5 - orig[..., 1]) * h - 0.5, (orig[..., 0] + 0.5) * w - 0.5))
    coverage = map_coordinates(alpha, coord + 1, order=1, mode="constant") >= CUT
    if not coverage.any():
        return cube, tile
    # A nearly rectangular island can end directly on all four geometry edges.
    if (
        coverage.mean() > 0.97
        and distance_transform_edt(~coverage).max() / density < 0.085
    ):
        coverage[:] = True
    # Keep the original pigment (including the pixels at the very outer edge).
    rgb = tile[..., :3]
    empty = ~filled[1:-1, 1:-1]
    if empty.any():
        near = distance_transform_edt(
            empty, return_distances=False, return_indices=True
        )
        rgb = rgb[tuple(near)]
    colors = np.stack(
        [
            map_coordinates(c, coord, order=0, mode="nearest")
            for c in rgb.transpose(2, 0, 1)
        ],
        -1,
    )
    tex = np.dstack((colors, coverage.astype("u1") * 255))
    thick = np.r_[extent, 0.02]
    pivot = (center - 0.01 * frame[:, 2]) * FLIP
    return (
        dict(
            origin=(pivot - thick / 2).round(6).tolist(),
            size=thick.round(6).tolist(),
            pivot=pivot.round(6).tolist(),
            rotation=native_rotation(frame),
            uv={"north": {}},
        ),
        tex,
    )


def clasp_center(side):
    return -2.17 if side < 0 else 2.03


def cloth_depth(x, y, side):
    return 3.53 - 0.32 * side * (x - clasp_center(side)) - 0.19 * (y - 13.77)


def pendant_x(y, side):
    return side * ((2.78 if side < 0 else 2.65) - 0.15 * (y - 9.85))


def clip_fittings(xyz):
    x, y, z = xyz.transpose(2, 0, 1)
    remove = np.zeros(x.shape, bool)
    for side in (-1, 1):
        r = np.hypot((x - clasp_center(side)) / 1.02, y - 13.77)
        clasp = (r < 1.58) & (z > cloth_depth(x, y, side))
        u = x - pendant_x(y, side)
        backing = 4.28 - 0.22 * (y - 9.85) - side * 0.30 * u
        pendant = (abs(u) < 0.73) & (y > 9.44) & (y < 12.75) & (z > backing)
        remove |= clasp | pendant
    return remove


def add_sheet(output, vertices, normal, pigment, density=44, seam=0.0):
    cube, tile = sheet(vertices, normal, pigment, density, seam)
    tile[..., 3] = np.where(tile[..., 3] >= CUT, 255, 0)
    # A native rectangular face has no need for a high-resolution constant tile.
    if (tile[..., 3] == 255).all() and not callable(pigment):
        tile = np.tile(np.uint8([*pigment, 255]), (2, 2, 1))
    output.append((cube, tile))


def pendant(side):
    faces = []
    axis = np.array([-0.15 * side, 1, -0.22])
    axis /= np.linalg.norm(axis)
    across = np.array([1.0, 0, 0])
    across -= axis * (axis @ across)
    across /= np.linalg.norm(across)
    depth = np.cross(across, axis)
    outline = np.array(
        [
            [-0.67, 1],
            [0.67, 1],
            [1, 0.64],
            [1, -0.64],
            [0.67, -1],
            [-0.67, -1],
            [-1, -0.64],
            [-1, 0.64],
        ]
    )

    def ring(y, w, d):
        pos = np.array([pendant_x(y, side), y, 4.82 - 0.22 * (y - 9.85)])
        return pos + outline[:, :1] * w * across + outline[:, 1:] * d * depth

    levels = [
        (9.77, 0.49, 0.36),
        (9.84, 0.54, 0.41),
        (12.10, 0.54, 0.41),
        (12.18, 0.49, 0.36),
        (12.22, 0.31, 0.25),
        (12.55, 0.31, 0.25),
        (12.66, 0.24, 0.20),
    ]
    shades = [
        [222, 202, 226],
        [212, 190, 219],
        [194, 169, 207],
        [181, 153, 196],
        [177, 150, 192],
        [186, 158, 199],
        [200, 174, 211],
        [214, 189, 220],
    ]
    for j, (a, b) in enumerate(zip(levels, levels[1:])):
        lo, hi = ring(*a), ring(*b)
        for i in range(8):
            k = (i + 1) % 8
            n = lo[i] + lo[k] - 2 * lo.mean(0)
            pigment = np.array(shades[i]) + (-12 if j in [0, 3, 5] else 0)
            add_sheet(faces, [lo[i], lo[k], hi[k], hi[i]], n, pigment.tolist())
    add_sheet(faces, ring(*levels[0]), -axis, [175, 150, 190])
    add_sheet(faces, ring(*levels[-1]), axis, [207, 183, 216])
    return faces


def finish(name, cube, tile, replaced, belt_cut):
    loc, axes, size = face_frame(cube)
    x, y, z = loc
    cloth = name in ("UpperBody", "RightSkirt", "LeftSkirt")
    if cloth and z + size.max() / 2 > 2 and y - size.max() / 2 < 18:
        coords = face_grid(loc, axes, size, tile.shape[:2])
        mask = clip_fittings(coords) | belt_cut(coords)
        if name.endswith("Skirt"):
            mask |= replaced(coords)
        tile[..., 3][mask] = 0
    if not np.any(tile[..., 3] >= CUT):
        return None
    if (
        cloth
        and z > 1.5
        and ((8.8 < y < 18 and abs(x) < 4.5) or (y < 13 and -3.7 < x < 1.25))
    ):
        cube, tile = tight_face(cube, tile, loc, axes, size)
    tile[..., 3] = np.where(tile[..., 3] >= CUT, 255, 0)
    return cube, tile
