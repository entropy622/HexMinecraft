"""Surface and albedo queries against the unedited, +Z-facing HY export."""

import io
import json
import struct
from pathlib import Path

import numpy as np
from embreex.mesh_construction import TriangleMesh
from embreex.rtcore_scene import EmbreeScene
from PIL import Image
from scipy.spatial import cKDTree


class Scan:
    def __init__(self, path):
        raw = Path(path).read_bytes()
        length = struct.unpack_from("<I", raw, 12)[0]
        g = json.loads(raw[20 : 20 + length])
        buf = memoryview(raw)[28 + length :]

        def accessor(idx, dtype, width):
            a = g["accessors"][idx]
            view = g["bufferViews"][a["bufferView"]]
            return np.frombuffer(
                buf,
                dtype,
                a["count"] * width,
                view.get("byteOffset", 0) + a.get("byteOffset", 0),
            ).reshape(-1, width)

        q = g["meshes"][0]["primitives"][0]
        p = accessor(q["attributes"]["POSITION"], "<f4", 3)
        self.p = p * (34 / p[:, 1].max())
        self.uv = accessor(q["attributes"]["TEXCOORD_0"], "<f4", 2)
        self.faces = accessor(q["indices"], "<u4", 1).reshape(-1, 3)
        self.triangles = len(self.faces)
        v = g["bufferViews"][g["images"][0]["bufferView"]]
        start = v.get("byteOffset", 0)
        self.skin = np.array(
            Image.open(io.BytesIO(buf[start : start + v["byteLength"]])).convert("RGB")
        )
        self.tree = cKDTree(self.p)
        self.scene = EmbreeScene()
        self.mesh = TriangleMesh(self.scene, self.p, self.faces.astype("i4"))

    def rays(self, origins, direction):
        d = np.broadcast_to(direction, origins.shape)
        return self.scene.run(
            np.ascontiguousarray(origins, dtype="f4"),
            np.ascontiguousarray(d, dtype="f4"),
            output=True,
        )

    def color(self, xyz, normal):
        # Recover source UVs at the outer skin. A newly exposed joint cap takes
        # its colour from the closest local material instead of projecting through the body.
        pts = xyz.reshape(-1, 3)
        hit = self.rays(pts + 0.15 * normal, -normal)
        good = (hit["primID"] >= 0) & (hit["tfar"] < 0.36)
        f = self.faces[hit["primID"][good]]
        u, v = hit["u"][good, None], hit["v"][good, None]
        st = np.empty((len(pts), 2))
        st[good] = (
            (1 - u - v) * self.uv[f[:, 0]] + u * self.uv[f[:, 1]] + v * self.uv[f[:, 2]]
        )
        if not good.all():
            st[~good] = self.uv[self.tree.query(pts[~good])[1]]
        h, w = self.skin.shape[:2]
        x, y = (st * [w, h] - 0.5).clip([0, 0], [w - 1.001, h - 1.001]).T
        i, j = x.astype(int), y.astype(int)
        x, y = (x - i)[:, None], (y - j)[:, None]
        rgb = (1 - y) * ((1 - x) * self.skin[j, i] + x * self.skin[j, i + 1]) + y * (
            (1 - x) * self.skin[j + 1, i] + x * self.skin[j + 1, i + 1]
        )
        return rgb.reshape(xyz.shape).astype("uint8")
