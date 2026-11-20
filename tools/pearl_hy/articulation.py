"""Articulated solid arms, collar and jaw in the native YSM rigs."""

from math import atan2, degrees, hypot

import numpy as np
from waist import face_frame, face_grid


def face_pixels(face, width, height, material):
    # Keep the cloth band and the hand shading on a common model-space pixel grid.
    w, h = max(2, round(width * 3)), max(2, round(height * 3))
    y, x = np.indices((h, w))
    color = {
        "skin": (246, 202, 190),
        "chin": (250, 216, 207),
        "sleeve": (206, 178, 215),
        "fold": (217, 192, 223),
        "cuff": (195, 165, 207),
        "binding": (181, 150, 195),
    }[material]
    rgb = np.broadcast_to(color, (h, w, 3)).copy()
    if face == "down":
        rgb -= [12, 13, 10]
    elif face == "up":
        rgb += [4, 4, 4]
    else:
        rgb[x == 0] -= [5, 6, 5]
        if material in ("skin", "chin"):
            rgb[(y >= h - 2) & (x >= w - 2)] -= [3, 8, 5]
        else:
            rgb[(x >= w - max(1, w // 4)) & (y < h - 1)] += [5, 5, 4]
            rgb[y == h - 1] -= [6, 7, 5]
    return np.dstack((rgb, np.full((h, w), 255))).astype("u1")


def solid(bone, tiles, pivot, angle, bottom, top, width, depth, material):
    x, y, z = pivot
    size = [width, round(top - bottom, 5), depth]
    cube = {
        "origin": [
            round(x - width / 2, 5),
            round(y + bottom, 5),
            round(z - depth / 2, 5),
        ],
        "size": size,
        "pivot": list(pivot),
        "rotation": [0, 0, round(angle, 5)],
        "uv": {},
    }
    for face, span in (
        ("north", (width, size[1])),
        ("south", (width, size[1])),
        ("west", (depth, size[1])),
        ("east", (depth, size[1])),
        ("up", (width, depth)),
        ("down", (width, depth)),
    ):
        uv = cube["uv"][face] = {}
        tiles.append((uv, face_pixels(face, *span, material)))
    bone["cubes"].append(cube)


def fit_arms(bones, tiles, first_person=False):
    named = {b["name"]: b for b in bones}
    for side, sign in (("Right", -1), ("Left", 1)):
        arm = named[side + "Arm"]
        forearm = named[side + "ForeArm"]
        grip = named[side + "HandLocator"]
        if first_person:
            # YSM's first-person camera works in its own arm space. Center the
            # wrist on the grip, with the shoulder and elbow on the camera rig.
            # Use the Taisho Maid's shoulder-to-elbow and elbow-to-grip ratios,
            # scaled about the grip to our first-person hand length.
            grip["pivot"] = [sign * 1.875, 18.325, 0.025]

            def from_grip(dx, dy, dz):
                return [
                    round(p + 0.90 * d, 5)
                    for p, d in zip(grip["pivot"], [sign * dx, dy, dz])
                ]

            arm["pivot"] = from_grip(-0.275, 12.825, -0.05)
            forearm["pivot"] = from_grip(-0.17175, 7.31239, -0.10)
        shoulder = arm["pivot"]
        elbow = forearm["pivot"]
        hand = grip["pivot"]
        upper_dx, upper_dy = shoulder[0] - elbow[0], shoulder[1] - elbow[1]
        lower_dx, lower_dy = elbow[0] - hand[0], elbow[1] - hand[1]
        upper = hypot(upper_dx, upper_dy)
        lower = hypot(lower_dx, lower_dy)
        upper_angle = degrees(atan2(upper_dx, upper_dy))
        lower_angle = degrees(atan2(lower_dx, lower_dy))
        arm["cubes"], forearm["cubes"] = [], []
        wrist = {
            "name": side + "Hand",
            "parent": forearm["name"],
            "pivot": hand,
            "cubes": [],
        }
        grip["parent"] = wrist["name"]
        bones.insert(bones.index(grip), wrist)
        # Distinct cross-sections overlap inside each other at both articulated
        # joints. Every exposed end has its own opaque cap.
        for bottom, top, w, d, fabric in (
            (-upper + 0.08, 0.17, 2.38, 2.70, "skin"),
            (-upper - 0.12, -upper * 0.48, 2.93, 3.36, "sleeve"),
            (-upper * 0.66, -upper * 0.44, 3.05, 3.49, "fold"),
        ):
            solid(arm, tiles, shoulder, upper_angle, bottom, top, w, d, fabric)
        for bottom, top, w, d, fabric in (
            (-lower * 0.72, 0.48, 2.46, 2.77, "skin"),
            (-lower * 0.51, 0.17, 3.13, 3.55, "sleeve"),
            (-lower * 0.74, -lower * 0.42, 3.63, 3.99, "fold"),
            (-lower * 0.86, -lower * 0.66, 3.96, 4.30, "cuff"),
            (-lower * 0.91, -lower * 0.84, 3.99, 4.34, "binding"),
        ):
            solid(forearm, tiles, elbow, lower_angle, bottom, top, w, d, fabric)
        solid(
            wrist,
            tiles,
            elbow,
            lower_angle,
            -lower - (1.40 if first_person else 0.65),
            -lower * 0.61,
            2.49,
            2.80,
            "skin",
        )


def trim_chin(name, cube, tile):
    if name != "Head":
        return
    loc, axes, size = face_frame(cube)
    if abs(loc[1] - 21.0) > 0.6 + np.linalg.norm(size) / 2:
        return
    x, y, z = face_grid(loc, axes, size, tile.shape[:2]).transpose(2, 0, 1)
    # The central lip is closed by the lower jaw block. Keep the original cheek
    # profile at its sides and the painted mouth above it.
    lower_lip = (abs(x + 0.1) < 2.37) & (z > 2.25) & (y < 21.30)
    neck_stub = (abs(x + 0.12) < 1.1) & (abs(z - 1.2) < 1.12) & (y < 21.20)
    tile[..., 3][lower_lip | neck_stub] = 0


def fit_head_pitch(bones, clips, tiles):
    # Like the Taisho Maid, anchor a solid neck to AllHead. Apply the pitch
    # correction inside YSM's tracked Head so it follows the player's local yaw.
    head = next(b for b in bones if b["name"] == "Head")
    anchor = [-0.12, 21.34, -1.20]
    neck = {
        "name": "AllHead",
        "parent": head["parent"],
        "pivot": [-0.12, 19.60, -1.04],
        "cubes": [],
    }
    head["pivot"] = anchor
    head["parent"] = "AllHead"
    visual = {
        "name": "MHead",
        "parent": "Head",
        "pivot": anchor,
        "cubes": head.pop("cubes"),
    }
    for b in bones:
        if b.get("parent") == "Head":
            b["parent"] = visual["name"]
    index = bones.index(head)
    bones[index : index + 1] = [neck, head, visual]
    solid(neck, tiles, neck["pivot"], 0, -0.08, 2.54, 2.42, 2.14, "skin")
    solid(visual, tiles, [-0.10, 21.19, -1.64], 0, 0, 1.75, 5.52, 5.08, "chin")
    solid(visual, tiles, [-0.10, 20.96, -1.68], 0, 0, 0.68, 4.76, 5.22, "chin")
    pitch = "math.clamp(ysm.head_pitch,-30,38)"
    tracks = {"MHead": {"rotation": [f"ysm.head_pitch-({pitch})", 0, 0]}}
    # Separate the pitch response from the existing idle and locomotion tracks
    # on each strand. Each driver uses its strand's original attachment pivot.
    for strand, driver, gain in (
        ("LongHair", "FLongHair", 0.78),
        ("LeftLock", "FLongLeftHair", 0.55),
        ("RightLock", "FLongRightHair", 0.55),
    ):
        b = next(b for b in bones if b["name"] == strand)
        bones.insert(
            bones.index(b),
            {"name": driver, "parent": visual["name"], "pivot": b["pivot"]},
        )
        b["parent"] = driver
        tracks[driver] = {"rotation": [f"{gain}*({pitch})", 0, 0]}
    clips["pre_parallel0"] = {
        "loop": True,
        "bones": tracks,
    }
