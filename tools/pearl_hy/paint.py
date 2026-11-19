"""Paint a native Bedrock UV atlas. Scan sampling stays in bind space."""

import math

import numpy as np
from pearl_faces import portraits
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates

PALETTE = {
    "pearl": (231, 224, 235),
    "hair": (214, 209, 220),
    "nape": (180, 161, 194),
    "silk": (234, 224, 236),
    "fold": (193, 173, 209),
    "lining": (165, 140, 184),
    "horn": (205, 184, 217),
    "skin": (252, 223, 208),
    "shoe": (213, 194, 223),
    "wing": (154, 117, 180),
    "rib": (187, 155, 205),
    "scale": (185, 151, 209),
    "snow": (236, 230, 238),
    "shadowhair": (172, 159, 185),
    "plate": (208, 184, 224),
    "plateEdge": (148, 116, 172),
    "stitch": (169, 146, 183),
    "webA": (160, 124, 188),
    "webB": (144, 108, 173),
    "binding": (178, 155, 193),
    "clasp": (218, 192, 232),
    "ribbon": (230, 220, 241),
    "collar": (142, 121, 157),
}


class Painter:
    def __init__(self, scan, art):
        self.scan = scan
        self.faces, _ = portraits(art / "pearl-expression-source.png", 128)
        self.faces = {k: np.asarray(v.convert("RGB")) for k, v in self.faces.items()}
        self.knot = np.asarray(Image.open(art / "pearl-clasp.png").convert("RGBA"))
        self.front = np.asarray(
            Image.open(art / "pearl-target-front.png")
            .convert("RGB")
            .filter(ImageFilter.GaussianBlur(2.7)),
            dtype=float,
        )
        self.back = np.asarray(
            Image.open(art / "pearl-target-back.png")
            .convert("RGB")
            .filter(ImageFilter.GaussianBlur(2.7)),
            dtype=float,
        )
        self.patches = []

    def sample(self, mat, pts, u, v):
        if mat in self.faces:
            return self.faces[mat][
                (v * 128).astype(int).clip(0, 127), (u * 128).astype(int).clip(0, 127)
            ]
        if mat == "knot":
            h, w = self.knot.shape[:2]
            return self.knot[
                (v * h).astype(int).clip(0, h - 1), (u * w).astype(int).clip(0, w - 1)
            ]
        c = np.array(PALETTE[mat])
        x, y, z = pts.transpose(2, 0, 1)
        # Broad square planes of pearl, not isotropic noise or glossy metal.
        step = (
            (np.floor(x * 1.21) + np.floor(y * 0.83) * 3 + np.floor(z * 0.88) * 2) % 7
            - 3
        ) * 0.88
        tex = c + step[..., None]
        # Transfer low-frequency pigment from matching materials. Never stamp the
        # source's rosettes, fingers or eye sockets onto neighbouring cloth/hair.
        if mat in (
            "silk",
            "fold",
            "shoe",
            "hair",
            "nape",
            "horn",
            "scale",
            "wing",
            "rib",
        ):
            src, d = self.scan.pigment(pts)
            lum = src.mean(-1)
            neutral = np.exp(-(((src[..., 0] - src[..., 2] + 8) / 24) ** 2))
            relief = (
                np.clip((lum - c.mean()) * 0.33, -12, 10)
                * np.exp(-((d / 1.1) ** 2))
                * neutral
            )
            tex += relief[..., None]
        if mat in ("hair", "nape", "pearl", "snow", "shadowhair"):
            streak = np.cos((x + 0.47 * z) * 2.65) * 1.7
            sheen = 5 * np.exp(-(((y - 26.8) / 0.94) ** 2))
            tex += (streak + sheen)[..., None]
        if mat in ("silk", "fold", "ribbon", "pearl"):
            theta = np.arctan2(x, z - 0.58)
            pleat = (4 * np.cos(8 * theta) - 3 * np.cos(16 * theta)) * np.clip(
                (14 - y) / 9, 0, 1
            )
            # The lower courses cast a short shadow on the next skirt panel.
            edge = np.exp(-(((y - 7.25) / 0.69) ** 2)) + np.exp(
                -(((y - 4.21) / 0.58) ** 2)
            )
            tex += (pleat - 8 * edge * (abs(x) > 3.7))[..., None]
        # The drawing provides the broad shadow values on the tunic and
        # textile, registered by garment landmarks. Never project its outline,
        # skin, clasp or ground shadow onto another surface.
        if mat in (
            "silk",
            "fold",
            "pearl",
            "hair",
            "nape",
            "snow",
            "wing",
            "webA",
            "webB",
        ):
            row = np.clip(379 - y * 11.02, 1, 377).astype(int)
            col = np.clip(132 + x * 11.18, 1, 265).astype(int)
            front = self.front[row, col]
            rear = self.back[
                np.clip(row, 0, self.back.shape[0] - 1),
                np.clip((128 - x * 10.60).astype(int), 0, self.back.shape[1] - 1),
            ]
            pic = np.where((z >= 0)[..., None], front, rear)
            valid = (
                (pic.min(-1) < 240)
                & (pic.min(-1) > 93)
                & (pic[..., 0] - pic[..., 2] < 9)
            )
            if mat in ("hair", "nape", "snow"):
                valid &= ~((x > 3.0) & (y > 24) & (y < 28) & (z > 0))
                valid &= pic[..., 2] - pic[..., 1] < 33
            if mat in ("silk", "fold", "pearl"):
                valid &= ~((abs(x) > 1.0) & (abs(x) < 3.25) & (y > 12) & (y < 14.9))
                valid &= pic[..., 2] - pic[..., 1] < 40
                valid &= (z > 0.25) | (z < -1)
            value = np.clip(pic.mean(-1) - c.mean(), -36, 18)
            tex += np.where(valid, value * 0.43, 0)[..., None]
        if mat in (
            "hair",
            "snow",
            "nape",
            "shadowhair",
            "horn",
            "pearl",
            "ribbon",
            "fold",
            "silk",
        ):
            # Broad facet, two-pixel bevel and a gently darker turned edge.
            edge = np.minimum(u, 1 - u)
            tex += (
                4 * np.exp(-(((u - 0.18) / 0.13) ** 2))
                - 7 * np.exp(-edge / 0.044)
                - 5 * np.exp(-(1 - v) / 0.08)
            )[..., None]
        if mat in ("webA", "webB", "wing"):
            tex += (11 * (1 - v) - 11 * np.sin(np.pi * u) + 3 * np.cos(2 * np.pi * v))[
                ..., None
            ]
        if mat in ("plate", "plateEdge", "scale"):
            tex += (5 * (1 - v) - 3 * np.sin(np.pi * u) + 2 * np.cos(2 * np.pi * v))[
                ..., None
            ]
        if mat in ("silk", "fold") and np.min(y) < 2.7:
            # Three flat embroideries follow the actual hem UV, including on
            # the sloping flank. A physical brooch here would float off the coat.
            az = np.arctan2(x / 7.25, (z - 0.58) / 5.1)
            for ang in [-0.73, 0.49, 1.19]:
                ku = (az - ang) * 3.8 + 0.5
                kv = (2.41 - y) / 1.61
                h, w = self.knot.shape[:2]
                sample = self.knot[
                    (kv * h).astype(int).clip(0, h - 1),
                    (ku * w).astype(int).clip(0, w - 1),
                ]
                mask = (ku > 0) & (ku < 1) & (kv > 0) & (kv < 1) & (z > 0)
                thread = (
                    mask
                    * sample[..., 3]
                    / 255
                    * np.clip((235 - sample[..., :3].mean(-1)) / 112, 0, 1)
                )
                tex = (
                    tex * (1 - thread[..., None])
                    + np.array([126, 101, 148]) * thread[..., None]
                )
        if mat == "horn":
            tex += (4 * np.cos(2.6 * x) - 5 * (v > 0.83))[..., None]
        return np.clip(tex, 0, 255).astype("uint8")

    def tile(self, uv, pts, mat, u, v, normal, mask=None):
        rgb = self.sample(mat, pts, u, v)
        if rgb.shape[-1] == 3:
            rgb = np.dstack((rgb, np.full(rgb.shape[:2], 255, "uint8")))
        if mask is not None:
            rgb = rgb.copy()
            rgb[..., 3] = np.minimum(rgb[..., 3], mask)
        self.patches.append((uv, rgb, pts.astype("f4"), np.asarray(normal), mat))

    def finish(self):
        # Sample two outward hemispheres in a shell field. Restrict occlusion
        # to local contacts: bang over cheek, belt over robe, scale over scale.
        pitch = 0.20
        origin = np.array([-15, -2, -12])
        bounds = np.array([151, 194, 111])
        occ = np.zeros(tuple(bounds), dtype="f4")
        for _, rgba, xyz, n, mat in self.patches:
            if mat in self.faces and mat != "face":
                continue
            ix = np.rint((xyz[rgba[..., 3] > 128] - origin) / pitch).astype(int)
            if np.any(ix < 0) or np.any(ix >= bounds):
                raise ValueError("Outside local bake volume")
            occ[tuple(ix.T)] = 1
        local = gaussian_filter(occ, 2.0)
        broad = gaussian_filter(occ, 4.8)
        patches = []
        for uv, rgba, xyz, n, mat in self.patches:
            coord = ((xyz - origin) / pitch).transpose(2, 0, 1)
            near = map_coordinates(local, coord + n[:, None, None] * 2.7, order=1)
            far = map_coordinates(broad, coord + n[:, None, None] * 4.5, order=1)
            contact = np.clip((near - 0.092) * 0.68 + (far - 0.065) * 0.46, 0, 0.29)
            rgb = rgba[..., :3].astype(float)
            rgba[..., :3] = np.clip(
                rgb * (1 - contact[..., None] * [1.12, 1.18, 0.90]), 0, 255
            )
            patches.append((uv, Image.fromarray(rgba)))
        patches.sort(key=lambda it: -it[1].height)
        w = 1024
        x = y = line = 0
        places = []
        for field, tile in patches:
            if x + tile.width + 4 > w:
                x = 0
                y += line
                line = 0
            places.append((x, y))
            line = max(line, tile.height + 4)
            x += tile.width + 4
        atlas = Image.new("RGBA", (w, 2 ** math.ceil(math.log2(max(1, y + line)))))
        for (uv, tile), (x, y) in zip(patches, places):
            atlas.paste(
                Image.fromarray(
                    np.pad(np.asarray(tile), ((2, 2), (2, 2), (0, 0)), mode="edge")
                ),
                (x, y),
            )
            uv.update(uv=[x + 2, y + 2], uv_size=list(tile.size))
        return atlas
