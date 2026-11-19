"""Read the supplied textured HY GLB in its +Z-facing bind pose, in Bedrock units."""

import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree


class Scan:
    def __init__(self, path):
        raw = Path(path).read_bytes()
        length = struct.unpack_from("<I", raw, 12)[0]
        g = json.loads(raw[20 : 20 + length])
        buf = memoryview(raw)[28 + length :]

        def read(idx, width):
            a = g["accessors"][idx]
            view = g["bufferViews"][a["bufferView"]]
            return np.frombuffer(
                buf,
                "<f4",
                a["count"] * width,
                view.get("byteOffset", 0) + a.get("byteOffset", 0),
            ).reshape(-1, width)

        q = g["meshes"][0]["primitives"][0]
        self.p = p = read(q["attributes"]["POSITION"], 3)
        self.p = p * (34 / p[:, 1].max())
        uv = read(q["attributes"]["TEXCOORD_0"], 2)
        view = g["bufferViews"][g["images"][0]["bufferView"]]
        start = view.get("byteOffset", 0)
        image = np.asarray(
            Image.open(io.BytesIO(buf[start : start + view["byteLength"]])).convert(
                "RGB"
            )
        )
        iy, ix = image.shape[:2]
        self.rgb = image[
            (uv[:, 1] * iy).astype(int).clip(0, iy - 1),
            (uv[:, 0] * ix).astype(int).clip(0, ix - 1),
        ]
        self.tree = cKDTree(self.p)
        self.triangles = g["accessors"][q["indices"]]["count"] // 3

    def pigment(self, xyz):
        d, i = self.tree.query(xyz, k=3)
        w = 1 / np.maximum(d, 0.012) ** 2
        return (self.rgb[i] * w[..., None]).sum(-2) / w.sum(-1)[..., None], d[..., 0]

    def wing(self):
        # Outline of the actual near membrane in frontal projection. Fold both sides
        # onto the same half-space; the two wings then coincide exactly in profile.
        x, y, z = self.p.T
        mask = (abs(x) > 5.6) & (y > 12.4) & (y < 22.7) & (z < -1.8)
        x, y, z = abs(x[mask]), y[mask], z[mask]
        stations = []
        for u in [5.85, 6.7, 7.5, 8.25, 8.9, 9.65, 10.35, 10.95, 11.18]:
            band = abs(x - u) < 0.10
            stations.append((u, *np.percentile(y[band], [97, 3]), np.median(z[band])))
        return np.array(stations)
