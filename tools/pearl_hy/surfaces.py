"""Sample the original painted geometry and write oriented native YSM faces."""

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from shapely import box, union_all

from hem import FLIP, native_rotation, samples
from waist import CUT, face_grid


def crossings(patches, grid, axis):
    """Return painted-surface hits for parallel rays along one model axis."""
    i, j = (axis + 1) % 3, (axis + 2) % 3
    for patch in patches:
        normal = patch.normal
        if abs(normal[axis]) < 1e-6:
            continue
        extent = abs(patch.basis[:, :2]) @ (patch.span / 2)
        ii, jj = [
            np.flatnonzero(abs(grid[d] - patch.center[d]) <= extent[d]) for d in (i, j)
        ]
        if not len(ii) or not len(jj):
            continue
        ii, jj = np.meshgrid(ii, jj, indexing="ij")
        delta = np.zeros((*ii.shape, 3))
        delta[..., i] = grid[i][ii] - patch.center[i]
        delta[..., j] = grid[j][jj] - patch.center[j]
        delta[..., axis] = -(delta @ normal) / normal[axis]
        uv = (delta @ patch.basis[:, :2] / patch.span) * [1, -1] + 0.5
        h, w = patch.tile.shape[:2]
        col, row = np.clip((uv * [w, h]).astype(int), 0, [w - 1, h - 1]).transpose(
            2, 0, 1
        )
        hit = np.all((uv >= 0) & (uv <= 1), axis=-1) & (patch.tile[row, col, 3] >= CUT)
        yield ii[hit], jj[hit], patch.center[axis] + delta[..., axis][hit], normal[axis]


def outline(inside, origin, step):
    """Vectorize horizontal runs on a common model-space grid, preserving holes."""
    rows, starts = np.nonzero(np.diff(inside.astype(int), prepend=0, axis=1) == 1)
    _, ends = np.nonzero(np.diff(inside.astype(int), append=0, axis=1) == -1)
    x, y = origin
    return union_all(
        box(
            (x + starts) * step,
            (y + rows) * step,
            (x + ends + 1) * step,
            (y + rows + 1) * step,
        )
    )


class PaintedSurface:
    def __init__(self, patches):
        points, colors, normals = [], [], []
        for patch in patches:
            xyz, rgb = samples(patch)
            points.append(xyz)
            colors.append(rgb)
            normals.append(np.broadcast_to(patch.normal, xyz.shape))
        self.xyz = np.vstack(points)
        self.colors = np.vstack(colors)
        self.tree = cKDTree(np.column_stack([self.xyz, np.vstack(normals) * 0.28]))
        self.faces = []

    def panel(
        self, center, u, v, width, height, coverage=None, density=6, edge_density=36
    ):
        normal = np.cross(u, v)
        basis = np.column_stack([u, v, normal])
        span = np.array([width, height])

        def grid(d):
            shape = np.maximum(2, np.ceil(span * d).astype(int))
            return face_grid(center, basis, span, shape[::-1])

        # Skin colour and cutout precision are independent. A fully covered face
        # needs only the physical pigment grid and ends at its native cube edges.
        pos = grid(density)
        q = np.concatenate([pos, np.broadcast_to(normal * 0.28, pos.shape)], axis=-1)
        _, near = self.tree.query(q, k=5)
        pigment = np.median(self.colors[near], axis=-2).astype("u1")
        alpha = np.full(pos.shape[:2], 255, "u1")
        if coverage is not None:
            mask = coverage(grid(edge_density))
            if not mask.any():
                return
            if not mask.all():
                alpha = mask.astype("u1") * 255
                pigment = np.asarray(
                    Image.fromarray(pigment).resize(
                        mask.shape[::-1], Image.Resampling.NEAREST
                    )
                )
        pivot = (center - normal * 0.01) * FLIP
        size = np.r_[span, 0.02]
        cube = dict(
            pivot=pivot.round(6).tolist(),
            origin=(pivot - size / 2).round(6).tolist(),
            size=size.round(6).tolist(),
            rotation=native_rotation(basis),
            uv={"north": {}},
        )
        self.faces.append((cube, np.dstack([pigment, alpha])))
