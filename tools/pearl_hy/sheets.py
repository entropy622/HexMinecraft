"""Merge neighbouring, nearly coplanar triangles into native per-face UV patches."""

from collections import defaultdict

import numpy as np


def sheets(tris):
    _, idx = np.unique(tris.reshape(-1, 3), axis=0, return_inverse=True)
    idx = idx.reshape(-1, 3)
    cross = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    areas = np.linalg.norm(cross, axis=1)
    normal = cross / np.maximum(areas[:, None], 1.0e-15)
    edges = defaultdict(list)
    for i, (a, b, c) in enumerate(idx):
        for j, k in [(a, b), (b, c), (c, a)]:
            edges[min(j, k), max(j, k)].append(i)
    adj = [set() for _ in tris]
    for group in edges.values():
        if len(group) == 2:
            a, b = group
            adj[a].add(b)
            adj[b].add(a)
    used = np.zeros(len(tris), bool)
    for i in np.argsort(-areas):
        if used[i] or areas[i] < 1.0e-7:
            continue
        cluster = [i]
        used[i] = True
        seed = tris[i].mean(0)
        n = normal[i]
        todo = list(adj[i])
        while todo:
            j = todo.pop()
            if used[j] or normal[j] @ n < 0.92:
                continue
            if np.max(np.abs((tris[j] - seed) @ n)) > 0.065:
                continue
            cluster.append(j)
            used[j] = True
            todo.extend(adj[j])
        f = tris[cluster]
        # Area-weighted plane keeps the broad face of a block flat; the skin
        # supplies the small bevel and embroidery that would waste geometry.
        n = cross[cluster].sum(0)
        n /= np.linalg.norm(n)
        center = np.average(f.mean(1), axis=0, weights=areas[cluster])
        # Prefer the world axes on upright garments to keep the baked pixels aligned.
        ref = np.eye(3)[np.argmin(abs(n) + [0, 0.002, 0.001])]
        u = ref - n * (ref @ n)
        u /= np.linalg.norm(u)
        v = np.cross(n, u)
        xy = np.stack([(f - center) @ u, (f - center) @ v], axis=-1)
        yield center, n, u, v, xy
