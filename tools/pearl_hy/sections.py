"""Build hanging locks from closed horizontal sections on their original bones."""

import numpy as np
from scipy.ndimage import median_filter
from shapely import contains_xy, get_parts, union_all
from shapely.geometry.polygon import orient

from surfaces import PaintedSurface, crossings, outline


HAIR_LEVELS = {
    # Rest-pose elevations of the strand ends and changes in overlap.
    "LongHair": [14, 14.78, 15.25, 17.5, 18.4, 19.4, 20.8, 22.0, 22.3],
    "LeftLock": [17.92, 19.85, 21.34, 22.0, 22.3],
    "RightLock": [17.92, 19.85, 21.34, 22.0, 22.3],
}


def votes_along_axis(patches, grid, axis):
    # At each sample inspect the nearest painted surface along both directions.
    # An open space between locks has no enclosing crossing on the opposite side.
    i, j = (axis + 1) % 3, (axis + 2) % 3
    shape = (len(grid[i]), len(grid[j]), len(grid[axis]) + 1)
    lowest, highest = np.full(shape, np.inf), np.full(shape, -np.inf)
    low_faces, high_faces = np.zeros(shape, bool), np.zeros(shape, bool)
    for ii, jj, distance, normal in crossings(patches, grid, axis):
        index = ii, jj, np.searchsorted(grid[axis], distance)
        for buf, facing, nearer, outward in [
            (lowest, low_faces, distance < lowest[index], normal > 0),
            (highest, high_faces, distance > highest[index], normal < 0),
        ]:
            at = tuple(v[nearer] for v in index)
            buf[at] = distance[nearer]
            facing[at] = outward
    votes = np.zeros((*shape[:2], shape[2] - 1), dtype="u1")
    for k in range(shape[2] - 1):
        if k:
            high_faces[..., k] = np.where(
                np.isfinite(highest[..., k]), high_faces[..., k], high_faces[..., k - 1]
            )
        votes[..., k] += high_faces[..., k]
    for k in reversed(range(1, shape[2])):
        if k + 1 < shape[2]:
            low_faces[..., k] = np.where(
                np.isfinite(lowest[..., k]), low_faces[..., k], low_faces[..., k + 1]
            )
        votes[..., k - 1] += low_faces[..., k]
    return np.moveaxis(votes, (0, 1, 2), (i, j, axis))


def signed_sections(xyz, patches, levels):
    step = 0.09
    lo = np.floor(xyz[:, [0, 2]].min(0) / step - 2).astype(int)
    hi = np.ceil(xyz[:, [0, 2]].max(0) / step + 2).astype(int)
    xs, zs = [(np.arange(a, b) + 0.5) * step for a, b in zip(lo, hi)]
    ys = (np.array(levels[:-1]) + levels[1:]) / 2
    grid = (xs, ys, zs)
    votes = sum(votes_along_axis(patches, grid, axis) for axis in range(3))
    layers = []
    for raw in votes.transpose(1, 2, 0):
        inside = median_filter((raw >= 4).astype("u1"), size=3) != 0
        # Trace continuous runs of occupied cells. Keep the original gaps between strands.
        islands = []
        for poly in get_parts(outline(inside, lo, step)):
            if poly.area > 0.06:
                islands.append(poly.simplify(0.13))
        layers.append(union_all(islands))
    return layers


def rebuild_hair(name, patches):
    surface = PaintedSurface(patches)
    levels = HAIR_LEVELS[name]
    layers = signed_sections(surface.xyz, patches, levels)
    up = np.array([0.0, 1.0, 0.0])
    for low, high, section in zip(levels, levels[1:], layers):
        for poly in get_parts(section):
            # The counterclockwise x/z contour has its outward normal on the right.
            poly = orient(poly, sign=1)
            for ring in [poly.exterior, *poly.interiors]:
                vertices = np.array(ring.coords)
                for a, b in zip(vertices, vertices[1:]):
                    start = np.array([b[0], low, b[1]])
                    end = np.array([a[0], low, a[1]])
                    axis = end - start
                    length = np.linalg.norm(axis)
                    if length < 1.0e-5:
                        continue
                    axis /= length
                    height = high - low
                    center = (start + end + up * height) / 2
                    surface.panel(center, axis, up, length, height, density=5)

    # Only the exposed difference at each change in section needs a horizontal face.
    # Each cap has one mask for the entire cross-section, including its holes.
    empty = union_all([])
    for y, below, above in zip(levels, [empty, *layers], [*layers, empty]):
        for sign, cap in [(1, below.difference(above)), (-1, above.difference(below))]:
            if cap.area < 1.0e-6:
                continue
            xmin, zmin, xmax, zmax = cap.bounds
            center = np.array([(xmax + xmin) / 2, y, (zmax + zmin) / 2])
            surface.panel(
                center,
                np.array([1.0, 0.0, 0.0]),
                np.array([0.0, 0.0, -sign]),
                xmax - xmin,
                zmax - zmin,
                lambda xyz: contains_xy(cap, xyz[..., 0], xyz[..., 2]),
                edge_density=36,
            )
    return surface.faces
