"""Working coordinates: +X is the avatar's left, +Y up, +Z forward."""

import itertools
import math

import numpy as np
from pearl_bake import BASIS, rotation
from pearl_cut import panel
from PIL import Image, ImageDraw, ImageFilter

F = np.array([1, 1, -1])


def vec(x):
    return np.asarray(x, dtype=float)


def grid(w, h, density):
    a, b = np.maximum(3, np.ceil(np.array([w, h]) * density)).astype(int)
    return np.meshgrid((np.arange(a) + 0.5) / a, (np.arange(b) + 0.5) / b)


class Model:
    def __init__(self, paint):
        self.bones = {}
        self.paint = paint

    def bone(self, name, parent=None, p=(0, 0, 0)):
        self.bones[name] = {"name": name, "pivot": list(vec(p) * F)}
        if parent:
            self.bones[name]["parent"] = parent
        return name

    def box(self, b, center, size, mat, rot=(0, 0, 0), faces=None):
        # Rotation values are native Bedrock degrees.
        center, size = vec(center), vec(size)
        r = rotation(rot)
        cube = {"origin": list(center * F - size / 2), "size": list(size), "uv": {}}
        if any(rot):
            cube.update(pivot=list(center * F), rotation=list(rot))
        self.bones[b].setdefault("cubes", []).append(cube)
        for side, (n, du, dv) in BASIS.items():
            m = (faces or {}).get(side, mat)
            if not m:
                continue
            n, du, dv = vec(n), vec(du), vec(dv)
            w, h = abs(du) @ size, abs(dv) @ size
            u, v = grid(w, h, 16 if m in self.paint.faces or m == "knot" else 5.5)
            local = (
                n * (abs(n) @ size) / 2
                + (u - 0.5)[..., None] * du * w
                + (v - 0.5)[..., None] * dv * h
            )
            field = cube["uv"][side] = {}
            self.paint.tile(field, center + local @ r.T, m, u, v, r @ n)
        return cube

    def poly(self, b, ring, normal, mat, paintuv=None):
        pts = vec(ring)
        across = pts[1] - pts[0]
        n = np.cross(across, pts[-1] - pts[0])
        if np.linalg.norm(n) < 1e-6:
            return
        n /= np.linalg.norm(n)
        if n @ vec(normal) < 0:
            n = -n
        if len(pts) == 4 and abs((pts[2] - pts[0]) @ n) > 0.065:
            for inds in [[0, 1, 2], [0, 2, 3]]:
                self.poly(
                    b,
                    pts[inds],
                    normal,
                    mat,
                    np.asarray(paintuv)[inds] if paintuv is not None else None,
                )
            return
        panel(self.bones[b], mat, pts, across, n, (0, 0), False)
        c = self.bones[b]["cubes"][-1]
        cut = np.asarray(c.pop("_cut"))
        for k in ("_part", "_depth", "_hem"):
            c.pop(k)
        r = rotation(c["rotation"])
        size = vec(c["size"])
        center = (vec(c["origin"]) + size / 2) * F
        u, v = grid(*size[:2], 17 if mat in self.paint.faces or mat == "knot" else 13)
        wp = (
            center
            + ((u - 0.5) * size[0])[..., None] * r[:, 0]
            + ((0.5 - v) * size[1])[..., None] * r[:, 1]
            + 0.01 * r[:, 2]
        )
        mask = Image.new("L", (u.shape[1] * 3, u.shape[0] * 3))
        ImageDraw.Draw(mask).polygon(
            [tuple(q * [mask.width, mask.height]) for q in cut], fill=255
        )
        a = np.asarray(
            mask.filter(ImageFilter.MaxFilter(5)).resize(
                (u.shape[1], u.shape[0]), Image.Resampling.BOX
            )
        )
        if paintuv is not None:
            M = np.linalg.lstsq(np.c_[cut, np.ones(len(cut))], paintuv, rcond=None)[0]
            u, v = (np.stack([u, v, np.ones_like(u)], -1) @ M).transpose(2, 0, 1)
        self.paint.tile(c["uv"]["north"], wp, mat, u, v, n, a)

    def loft(self, b, rings, mat, cap=None):
        rings = vec(rings)
        center = rings.mean((0, 1))
        for a, c in itertools.pairwise(rings):
            for i in range(len(a)):
                j = (i + 1) % len(a)
                f = vec([a[i], a[j], c[j], c[i]])
                self.poly(b, f, f.mean(0) - center, mat)
        for a in [rings[0], rings[-1]]:
            self.poly(b, a, a.mean(0) - center, cap or mat)

    def taper(self, b, rows, mat, cap=None):
        rings = []
        for x, y, z, w, d in rows:
            rings.append(
                [
                    (x + i * w / 2, y, z + j * d / 2)
                    for i, j in [(-1, 1), (1, 1), (1, -1), (-1, -1)]
                ]
            )
        self.loft(b, rings, mat, cap)


def construct(m):
    bone, box, loft, taper = m.bone, m.box, m.loft, m.taper
    bone("Root")
    bone("AllBody", "Root", (0, 13, 0))
    bone("UpperBody", "AllBody", (0, 13, 0))
    bone("Head", "UpperBody", (0, 20.95, 0))
    # Quiet facial planes with a small jaw undercut. The iris and mouth share a
    # single registered portrait surface; alternative performances rest inside it.
    taper(
        "Head",
        [
            (0, 27.72, -0.13, 8.0, 7.71),
            (0, 22.18, -0.12, 8.0, 7.72),
            (0, 21.0, -0.15, 6.87, 7.61),
        ],
        "skin",
    )

    def portrait(b, paint, offset):
        for ya, yb in [(27.72, 22.13), (22.13, 21.00)]:
            for l, r in zip(
                [-1, -0.78, -0.46, 0.46, 0.78], [-0.78, -0.46, 0.46, 0.78, 1]
            ):
                pts = []
                st = []
                for f, y in [(l, ya), (r, ya), (r, yb), (l, yb)]:
                    x = f * (4.04 if y > 21.5 else 3.46)
                    lift = 0.27 * abs(f) ** 2 if y < 21.5 else 0
                    pts.append([x, y + lift, 4.18 - 0.39 * (abs(f) ** 3) + offset])
                    st.append([0.5 + 0.5 * f, (27.72 - y) / 6.72])
                m.poly(b, pts, [0, 0, 1], paint, st)

    portrait("Head", "face", 0)
    for name, tex in [
        ("Blink", "blink"),
        ("CuriousEyes", "curious"),
        ("IntentEyes", "focus"),
        ("WideEyes", "startle"),
    ]:
        bone(name, "Head", (0, 24.5, 4.10))
        portrait(name, tex, -0.055)
    # Crown, stepped bangs and a bob wrapping around both ears. Hair is made of
    # solid textured cuboids, so a side view never exposes the reverse of a card.
    box("Head", (0, 27.25, -0.08), (9.24, 2.88, 8.95), "hair")
    box("Head", (0, 28.65, -0.14), (8.22, 0.67, 7.92), "pearl")
    for x, w, bottom, front in [
        (-3.47, 1.65, 23.95, 4.45),
        (-2.14, 1.12, 25.04, 4.79),
        (-0.21, 2.76, 24.03, 5.12),
        (1.59, 1.04, 25.10, 4.72),
        (2.99, 1.69, 24.20, 4.5),
    ]:
        top = 28.32 - abs(x) * 0.10
        box(
            "Head",
            (x, (top + bottom) / 2, front - 0.96),
            (w, top - bottom, 1.93),
            "snow" if abs(x) < 0.5 else "hair",
        )
    # Layer the rear locks vertically and laterally. The longest pieces have
    # their own joint; they follow the skull but do not swing through the chest.
    box("Head", (0, 25.5, -3.96), (8.77, 6.08, 2.22), "hair")
    bone("LongHair", "Head", (0, 23, -3.7))
    for j, (x, w, low, z) in enumerate(
        [
            (-3.62, 1.62, 18.4, -4.10),
            (-2.04, 1.88, 16, -4.53),
            (0, 2.3, 15.35, -4.82),
            (2.02, 1.9, 17.25, -4.65),
            (3.61, 1.66, 18.68, -4.04),
        ]
    ):
        mid = [24.05, 22.23, 21.24, 22.55, 24.32][j]
        box(
            "Head",
            (x, (28 + mid) / 2, z - 0.30),
            (w + 0.05, 28 - mid, 1.65),
            "snow" if j in (1, 3) else "hair",
            (0, (j - 2) * 1.1, (j - 2) * 0.65),
        )
        box(
            "LongHair",
            (x, (mid + low) / 2, z),
            (w, mid - low + 0.14, 1.52),
            "hair" if j % 2 == 0 else "nape",
            (0, 0, (j - 2) * 1.25),
        )
        box(
            "LongHair", (x * 0.99, low - 0.46, z + 0.18), (w * 0.82, 1.22, 1.14), "nape"
        )
    for side, s in [("Right", -1), ("Left", 1)]:
        for i, (z, dep, bot) in enumerate(
            [
                (2.58, 2.14, 21.15),
                (0.72, 1.82, 22.15),
                (-1.0, 1.95, 20.35),
                (-2.67, 1.58, 19.4),
            ]
        ):
            box(
                "Head",
                (s * (4.06 + 0.22 * (i == 1)), (27.45 + bot) / 2, z),
                (1.17, 27.45 - bot, dep),
                "hair",
            )
        box("Head", (s * 4.69, 23.95, 0.85), (1.08, 0.97, 1.58), "skin")
        bone(side + "Lock", "Head", (s * 3.52, 22.1, 3.68))
        box(side + "Lock", (s * 3.47, 21.51, 2.91), (1.44, 3.16, 1.3), "shadowhair")
        box(
            side + "Lock",
            (s * 3.57, 20.91, 3.44),
            (1.28, 3.77, 1.48),
            "hair",
            (3, 0, -s * 2),
        )
        # Two distinct horn sockets, each tapering through five ivory segments.
        for x, y, z, w, h, d, tilt in [
            (2.84, 28.88, -0.31, 1.93, 1.70, 2.0, -12),
            (2.91, 30.14, -0.63, 1.67, 1.56, 1.72, -17),
            (2.63, 31.29, -0.97, 1.40, 1.42, 1.45, -12),
            (2.51, 32.40, -1.30, 1.10, 1.29, 1.21, 3),
            (2.71, 33.41, -1.62, 0.77, 1.04, 0.94, 12),
        ]:
            box("Head", (s * x, y, z), (w, h, d), "horn", (13, 0, s * tilt))

    # One asymmetric six-loop pin and two waist knots. A side-set pin turns
    # around the corner, unlike a duplicate flower on the opposite temple.
    def brooch(b, center, d, yaw):
        box(
            b,
            center,
            (d, d, 0.27),
            None,
            (0, yaw, 0),
            {"north": "knot", "south": "knot"},
        )

    brooch("Head", (4.02, 26.45, 4.93), 2.25, -27)
    box("UpperBody", (0, 20.51, 0.64), (2.49, 1.72, 2.40), "skin")
    taper(
        "UpperBody",
        [
            (0, 20.45, 0.6, 4.35, 3.52),
            (0, 19.3, 0.77, 5.18, 4.33),
            (0, 15.3, 0.76, 4.28, 3.95),
            (0, 13.25, 0.65, 4.59, 4.37),
        ],
        "silk",
    )
    box("UpperBody", (0, 20.39, 0.61), (2.9, 0.66, 2.95), "collar")
    taper(
        "UpperBody",
        [
            (0, 19.48, 3.026, 0.17, 0.09),
            (0, 15.44, 2.79, 0.14, 0.09),
            (0, 13.72, 2.77, 0.15, 0.09),
        ],
        "binding",
    )
    for y, z in [(19.0, 3.04), (17.48, 2.97), (15.77, 2.86)]:
        box("UpperBody", (0, y, z), (0.97, 0.12, 0.13), "clasp")
        box(
            "UpperBody",
            (0.07, y + 0.06, z + 0.04),
            (0.23, 0.23, 0.16),
            "ribbon",
            (0, 0, 35),
        )
    box("AllBody", (0, 13.52, 0.71), (4.94, 0.62, 4.6), "pearl")
    train = bone("Skirt", "AllBody", (0, 13.50, -0.35))
    for side, s in [("Right", -1), ("Left", 1)]:
        arm = bone(side + "Arm", "UpperBody", (s * 3.12, 20.12, 1.05))
        fore = bone(side + "ForeArm", arm, (s * 4.33, 16.1, 0.95))
        bone(side + "HandLocator", fore, (s * 5.39, 11.23, 0.97))
        taper(
            arm,
            [(s * 3.17, 20.20, 1.08, 1.84, 2.13), (s * 4.07, 17.06, 1.02, 1.69, 1.91)],
            "skin",
        )
        taper(
            arm,
            [(s * 3.87, 17.89, 1.02, 2.06, 2.22), (s * 4.38, 15.9, 0.99, 2.23, 2.34)],
            "fold",
        )
        taper(
            fore,
            [
                (s * 4.33, 16.34, 1.0, 2.14, 2.27),
                (s * 5.29, 12.65, 0.98, 3.26, 3.09),
                (s * 5.38, 12.23, 0.98, 3.25, 3.13),
            ],
            "silk",
            "lining",
        )
        taper(
            fore,
            [(s * 5.39, 12.63, 0.98, 1.83, 2.05), (s * 5.60, 11.18, 1.02, 1.72, 1.95)],
            "skin",
        )
        leg = bone(side + "Leg", "AllBody", (s * 1.37, 13.00, 0.78))
        shin = bone(side + "LowerLeg", leg, (s * 1.37, 6.94, 0.78))
        box(leg, (s * 1.37, 10.09, 0.78), (2.2, 6.25, 2.52), "skin")
        box(shin, (s * 1.37, 4.15, 0.78), (2.02, 5.70, 2.27), "skin")
        box(shin, (s * 1.37, 1.83, 1.12), (2.24, 0.32, 2.58), "ribbon")
        box(shin, (s * 1.37, 0.82, 1.57), (2.32, 1.40, 2.82), "shoe")
        taper(
            shin,
            [(s * 1.37, 1.19, 2.97, 2.18, 1.72), (s * 1.37, 0.44, 3.06, 2.40, 1.84)],
            "snow",
        )
        box(shin, (s * 1.37, 0.23, 2.06), (2.46, 0.40, 3.88), "lining")
        sk = bone(side + "Skirt", "AllBody", (s * 1.88, 13.45, 0.65))
        # Open front: two coat panels surround independent legs. Four broad
        # circumferential panels per side give a hexagonal train in three-quarter.
        for k, (a, b) in enumerate(
            [(16 if s > 0 else -4, 48), (48, 92), (92, 138), (138, 180)]
        ):

            def ring(y, rx, rz, thick, a=a, b=b, s=s):
                return [
                    (
                        s * (rx - t) * math.sin(math.radians(deg)),
                        y,
                        0.58 + (rz - t) * math.cos(math.radians(deg)),
                    )
                    for deg, t in [(a, 0), (b, 0), (b, thick), (a, thick)]
                ]

            loft(
                train if k >= 2 else sk,
                [ring(13.53, 2.62, 2.76, 0.47), ring(0.26, 7.72, 5.52, 0.60)],
                "silk" if k in (0, 3) else "fold",
                "lining",
            )
        for y1, y0, w1, w0, d1, d0 in [
            (9.60, 4.62, 4.88, 7.80, 4.39, 5.37),
            (13.24, 8.0, 3.03, 6.67, 3.36, 4.90),
        ]:
            for a, b in [(37, 81), (81, 124), (124, 149)]:
                loft(
                    train if a >= 124 else sk,
                    [ring(y1, w1, d1, 0.55, a, b), ring(y0, w0, d0, 0.62, a, b)],
                    "fold" if a == 81 else "pearl",
                    "lining",
                )
        loft(
            train,
            [
                ring(13.15, 2.45, 2.40, 0.45, 69, 160),
                ring(1.22, 6.64, 4.59, 0.42, 69, 160),
            ],
            "lining",
        )
        # A piped cuff and embroidered hem sit on the moving fabric.
        taper(
            fore,
            [(s * 5.29, 12.71, 0.98, 3.28, 3.13), (s * 5.38, 12.26, 0.98, 3.30, 3.16)],
            "binding",
        )
        for a, b in [(16 if s > 0 else -4, 48), (48, 92), (92, 138), (138, 180)]:
            loft(
                train if a >= 92 else sk,
                [
                    ring(0.64, 7.65, 5.47, 0.17, a, b),
                    ring(0.43, 7.73, 5.53, 0.17, a, b),
                ],
                "binding",
            )
        brooch("AllBody", (s * 2.12, 13.48, 3.23), 2.13, -s * 10)
        box(sk, (s * 2.23, 11.78, 3.37), (0.68, 2.21, 0.51), "ribbon", (-8, 0, s * 8))
    # Two continuous, ribbed wing membranes. Their leading and trailing edges
    # are measured from the scan, not interpreted as a second pair of appendages.
    scan = m.paint.scan.wing()
    for side, s in [("Right", -1), ("Left", 1)]:
        wing = bone(side + "Wing", "UpperBody", (s * 2.19, 19.62, -1.62))
        rows = [
            (2.15, 19.72, 17.45, -1.58),
            (4.63, 21.13, 16.35, -2.70),
        ] + scan.tolist()

        def at(x, c, rows=rows):
            return float(np.interp(x, [r[0] for r in rows], [r[c] for r in rows]))

        # Square notches between fingers. The tips drop vertically below the
        # leading edge, giving the membrane an actual end thickness in profile.
        outline = [
            (2.14, 17.1),
            (4.20, 16.7),
            (4.87, 16.7),
            (4.87, 15.8),
            (5.43, 15.8),
            (5.43, 16.51),
            (6.74, 16.2),
            (6.74, 15.02),
            (7.46, 15.02),
            (7.46, 15.94),
            (8.73, 15.62),
            (8.73, 14.48),
            (9.34, 14.48),
            (9.34, 15.02),
            (10.59, 14.50),
            (10.59, 13.08),
            (11.18, 13.08),
        ]

        # Piecewise planar sweep avoids seams between adjacent fans.
        def section(x, lo, s=s):
            hi = at(x, 1)
            z = -1.58 - (x - 2.14) * 0.427
            return vec(
                [
                    (s * x, hi, z + 0.21),
                    (s * x, hi, z - 0.22),
                    (s * x, lo, z - 0.31),
                    (s * x, lo, z + 0.12),
                ]
            )

        for i, ((x, l), (xx, ll)) in enumerate(itertools.pairwise(outline)):
            a, c = section(x, l), section(xx, ll)
            if x == xx:
                if abs(l - ll) > 0.01:
                    m.poly(
                        wing,
                        [a[2], a[3], c[3], c[2]],
                        [s * (1 if l < ll else -1), 0, 0],
                        "rib",
                    )
                continue
            for idx, n, mat in [
                (0, [0, 1, 0], "rib"),
                (1, [0, 0, -1], "webB"),
                (2, [0, -1, 0], "rib"),
                (3, [0, 0, 1], "webA" if i % 4 else "webB"),
            ]:
                j = (idx + 1) % 4
                m.poly(wing, [a[idx], a[j], c[j], c[idx]], n, mat)
            if i == 0:
                m.poly(wing, a, [-s, 0, 0], "rib")
            if i == len(outline) - 2:
                m.poly(wing, c, [s, 0, 0], "rib")

        def strut(p, q, width, depth, wing=wing):
            a, c = vec(p), vec(q)
            axis = c - a
            h = np.cross(axis, [0, 0, 1])
            h /= np.linalg.norm(h)

            def cap(pt):
                return [
                    pt + h * k * width + [0, 0, d * depth]
                    for k, d in [(1, 1), (1, -1), (-1, -1), (-1, 1)]
                ]

            loft(wing, [cap(a), cap(c)], "rib")

        def anchor(x, y, s=s):
            return [s * x, y, -1.58 - (x - 2.14) * 0.427 + 0.21]

        top = [2.15, 4.6, 6.68, 7.45, 8.9, 10.35, 11.17]
        for x, xx in itertools.pairwise(top):
            strut(anchor(x, at(x, 1)), anchor(xx, at(xx, 1)), 0.20, 0.23)
        for x, lo, root in [
            (5.17, 15.77, 6.17),
            (7.08, 15.02, 6.67),
            (9.04, 14.49, 7.5),
            (10.92, 13.10, 9.13),
        ]:
            strut(anchor(root, at(root, 1)), anchor(x, lo), 0.12, 0.12)
    # Tail centres follow the scan's measured backward arch. Bend the tapered
    # tip across the back of the coat as in the rear drawing.
    ctr = vec(
        [
            (0, 13.7, -2.16),
            (-0.30, 12, -3.53),
            (-0.82, 10, -4.82),
            (-1.06, 7.73, -5.71),
            (-0.91, 5.92, -6.21),
            (-0.16, 4.47, -6.30),
            (1.04, 3.50, -6.04),
            (2.27, 3.17, -5.69),
        ]
    )
    rs = [1.50, 1.71, 1.85, 1.78, 1.48, 1.14, 0.78, 0.40]
    rings = []
    for j, (c, r) in enumerate(zip(ctr, rs)):
        axis = ctr[min(j + 1, len(ctr) - 1)] - ctr[max(0, j - 1)]
        axis /= np.linalg.norm(axis)
        v = np.cross([1, 0, 0], axis)
        v /= np.linalg.norm(v)
        u = np.cross(axis, v)
        rings.append(
            [
                c + r * (u * math.cos(t) + v * math.sin(t))
                for t in np.arange(8) * math.pi / 4
            ]
        )
    for j in range(len(ctr) - 1):
        t = bone("Tail" + str(j), "AllBody" if not j else "Tail" + str(j - 1), ctr[j])
        loft(t, rings[j : j + 2], "scale")
        if j < 6:
            a, c = vec(rings[j]), vec(rings[j + 1])
            for k in range(8):
                n = (k + 1) % 8
                mid = (a[k] + a[n] + c[k] + c[n]) / 4
                out = mid - (ctr[j] + ctr[j + 1]) / 2
                out /= np.linalg.norm(out)
                l = a[k] * 0.81 + c[k] * 0.19
                r = a[n] * 0.81 + c[n] * 0.19
                l2 = a[k] * 0.32 + c[k] * 0.68
                r2 = a[n] * 0.32 + c[n] * 0.68
                tip = (c[k] + c[n]) * 0.50
                face = vec([l, r, r2, tip, l2]) + out * 0.19
                m.poly(t, face, out, "plate" if (k + j) % 3 else "clasp")
                for h in (1, 2, 3):
                    q = face[h]
                    nxt = face[(h + 1) % 5]
                    m.poly(
                        t,
                        [q, nxt, nxt - out * 0.20, q - out * 0.20],
                        (q + nxt) * 0.5 - mid,
                        "plateEdge",
                    )
    return list(m.bones.values())
