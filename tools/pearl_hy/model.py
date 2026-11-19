"""Keep HY's outer skin; introduce closed sections only at articulation planes."""

import manifold3d as md
import numpy as np
from fast_simplification import simplify

FLIP = np.array([1, 1, -1])


def box(x=(-20, 20), y=(-2, 38), z=(-15, 15)):
    lo = np.array([x[0], y[0], z[0]])
    return md.Manifold.cube((x[1] - x[0], y[1] - y[0], z[1] - z[0])).translate(lo)


def cut(obj, n, d):
    return obj.trim_by_plane(n, d / np.linalg.norm(n))


def pieces(scan):
    mesh = md.Mesh(scan.p.copy(), scan.faces.copy())
    mesh.merge()  # Weld UV seams without moving the source vertices.
    raw = md.Manifold(mesh)
    if raw.is_empty():
        raise ValueError("Source GLB must describe a closed surface")
    clean = raw.simplify(0.012).to_mesh()
    v, f = simplify(
        clean.vert_properties.copy(), clean.tri_verts.astype("i4"), target_count=18000
    )
    body = md.Manifold(md.Mesh(v.astype("f4"), f.astype("u4"))).as_original()
    if body.is_empty():
        raise ValueError("Source simplification lost the closed body")
    exterior = body.original_id()
    bones, surfaces = {}, {}

    def joint(name, parent, p):
        bones[name] = {"name": name, "pivot": (np.array(p) * FLIP).tolist()}
        if parent:
            bones[name]["parent"] = parent

    def bind(name, part):
        geo = part.to_mesh()
        faces = geo.tri_verts
        src = np.repeat(geo.run_original_id, np.diff(geo.run_index) // 3)
        tri = geo.vert_properties[:, :3][faces].astype(float)
        surfaces[name] = [(tri[src == exterior], False), (tri[src != exterior], True)]

    def take(mask):
        nonlocal body
        obj, body = body.split(mask)
        return obj

    joint("Root", None, [0, 0, 0])
    joint("AllBody", "Root", [0, 13, 0])
    joint("UpperBody", "AllBody", [0, 13, 0])
    joint("Head", "UpperBody", [0, 21.1, -0.1])
    for s, side in [(-1, "Right"), (1, "Left")]:
        span = (2.9, 16) if s == 1 else (-16, -2.9)

        joint(side + "Wing", "UpperBody", [s * 3.5, 19.7, -2.2])
        wing = cut(box(span, (12.1, 22.55), (-12, -1.52)), [s, 0, 0.67], 1.79)
        bind(side + "Wing", take(wing))
    joint("LongHair", "Head", [0, 22.3, -3.1])
    bind("LongHair", take(box((-4.23, 4.23), (14, 22.3), (-9, -1.13))))
    for s, side in [(-1, "Right"), (1, "Left")]:
        joint(side + "Lock", "Head", [s * 3.6, 22.3, 2.22])
        # The two cheek locks end at the upper sleeve. Their back face clears
        # the bare shoulder when the player raises her arm.
        sx = (2.91, 4.64) if s == 1 else (-4.64, -2.91)
        bind(side + "Lock", take(box(sx, (17.92, 22.3), (1.81, 5.7))))
    bind("Head", take(box(y=(20.97, 36))))
    for name in ["Blink", "CuriousEyes", "IntentEyes", "WideEyes"]:
        joint(name, "Head", [0, 23, 3.94])
    for s, side in [(-1, "Right"), (1, "Left")]:
        joint(side + "Arm", "UpperBody", [s * 2.93, 20.11, 1.17])
        joint(side + "ForeArm", side + "Arm", [s * 4.05, 16.03, 1.22])
        joint(side + "HandLocator", side + "ForeArm", [s * 5.63, 11.26, 1.16])
        # Sleeve narrows towards the bare shoulder; cut inward of its silhouette.
        sleeve = cut(box(y=(10.63, 21.1), z=(-1.65, 4.25)), [s, 0.205, 0], 5.98)
        # Keep the side pleat on the robe alongside the hand below the cuff.
        sleeve -= cut(box(y=(9, 12.1)), [-s, -0.40, 0], -8.83)
        arm = take(sleeve)
        upper, lower = arm.split_by_plane([0, 1, 0], 16.03)
        for joint_name, solid in [(side + "Arm", upper), (side + "ForeArm", lower)]:
            # Detached embroidery belongs to the garment left behind at this cut.
            chunks = sorted(solid.decompose(), key=lambda m: -m.volume())
            bind(joint_name, chunks[0])
            for chip in chunks[1:]:
                if chip.volume() > 1.0e-6:
                    body += chip
    tail = take(
        cut(box((-3.65, 3.4), (1.25, 12.75), (-10, -2.33)), [0, 0.16, -1], 4.30)
    )
    chain = [
        [0, 12.75, -2.7],
        [-0.35, 11, -4.25],
        [-0.6, 9, -5.25],
        [-0.9, 7.25, -5.6],
        [-1.15, 5.45, -5.63],
        [-0.85, 3.9, -5.35],
        [-0.32, 2.7, -4.85],
    ]
    for j, p in enumerate(chain):
        name = "Tail" + str(j)
        joint(name, "Tail" + str(j - 1) if j else "AllBody", p)
        if j + 1 < len(chain):
            segment, tail = tail.split_by_plane([0, 1, 0], chain[j + 1][1])
        else:
            segment = tail
        bind(name, segment)
    bind("UpperBody", take(box(y=(13.1, 25))))
    # The original front opening exposes one whole shoe, left of centre.
    # Follow both lapel edges rather than dividing that shoe between two feet.
    right = cut(
        cut(box(y=(-1, 13.1), z=(1.35, 8)), [1, -0.134, 0], -2.89),
        [-1, -0.079, 0],
        -0.12,
    )
    hidden = box((0.23, 2.43), (-1, 13.1), (0.35, 2.9))
    for s, side, legcut in [(-1, "Right", right), (1, "Left", hidden)]:
        joint(side + "Leg", "AllBody", [s * 1.28, 12.75, 2.3])
        joint(side + "LowerLeg", side + "Leg", [s * 1.28, 6.6, 2.7])
        upper, lower = take(legcut).split_by_plane([0, 1, 0], 6.6)
        bind(side + "Leg", upper)
        bind(side + "LowerLeg", lower)
    for s, side in [(-1, "Right"), (1, "Left")]:
        sx = (0, 15) if s == 1 else (-15, 0)
        joint(side + "Skirt", "AllBody", [s * 2, 13.1, 1])
        bind(side + "Skirt", take(box(sx, (-1, 14), (-1.5, 9))))
    joint("Skirt", "AllBody", [0, 13.1, -0.5])
    bind("Skirt", body)
    return bones, surfaces
