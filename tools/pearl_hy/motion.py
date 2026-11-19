"""YSM state names follow the official default and 酒狐 · 汉服 packs."""

import math


def pose(bones, d=1, loop=True):
    return {"loop": loop, "animation_length": d, "bones": bones}


def rot(x=0, y=0, z=0):
    return {"rotation": [x, y, z]}


def wave(a, p, phase=0):
    return {
        "rotation": {
            str(round(i * p / 8, 4)): [
                round(k * math.sin(i * math.pi / 4 + phase), 3) for k in a
            ]
            for i in range(9)
        }
    }


def main():
    idle = {
        "Head": wave([0.55, 0.75, 0.52], 4),
        "LongHair": wave([0.7, 1, 0], 4, 0.24),
        "Blink": {
            "position": {
                "0": [0, 0, 0],
                "3.55": [0, 0, 0],
                "3.57": [0, 0, -0.12],
                "3.69": [0, 0, -0.12],
                "3.71": [0, 0, 0],
                "4": [0, 0, 0],
            }
        },
    }
    for i in range(7):
        idle["Tail" + str(i)] = wave([0.46, 2.6, 1.15], 4, -0.43 * i)
    for s, side in [(-1, "Right"), (1, "Left")]:
        idle[side + "Wing"] = wave([0, s * 3.3, -s * 1.1], 4)
        idle[side + "Lock"] = wave([1.05, 0, s * 0.4], 4, 0.37)
    clips = {
        "idle": pose(idle, 4),
        "gui": pose(
            {
                **idle,
                "Head": rot(2, -4, -3),
                "CuriousEyes": {"position": [0, 0, -0.14]},
            },
            4,
        ),
    }
    for name, period, amp in [
        ("walk", 0.82, 22),
        ("run", 0.59, 32),
        ("sneaking", 1.06, 11),
    ]:
        d = {}
        for s, side in [(-1, "Right"), (1, "Left")]:
            for part, mult in [
                ("Arm", -0.78),
                ("ForeArm", -0.18),
                ("Leg", 0.58),
                ("LowerLeg", 0.12),
                ("Skirt", 0.34),
                ("Lock", -0.10),
            ]:
                d[side + part] = wave(
                    [amp * s * mult, 0, 0], period, 0.11 if part == "Skirt" else 0
                )
        d["AllBody"] = {
            "position": {
                str(round(i * period / 4, 4)): [
                    0,
                    (0.20 if i % 2 else 0) - (1.6 if name == "sneaking" else 0),
                    0,
                ]
                for i in range(5)
            }
        }
        d["Skirt"] = wave([0.8, 1.2, 0.55], period, 0.3)
        clips[name] = pose(d, period)
    clips["sneak"] = pose(
        {"AllBody": {"position": [0, -1.6, 0]}, "UpperBody": rot(13), "Head": rot(-8)}
    )
    for side, state in [("Right", "swing_hand"), ("Left", "swing_offhand")]:
        s = -1 if side == "Right" else 1
        clips[state] = pose(
            {
                side + "Arm": {
                    "rotation": {
                        "0": [-9, 0, 0],
                        ".12": [-101, s * 9, s * 13],
                        ".27": [-52, -s * 8, -s * 4],
                        ".44": [0, 0, 0],
                    }
                },
                side + "ForeArm": {
                    "rotation": {"0": [0, 0, 0], ".12": [-18, 0, 0], ".44": [0, 0, 0]}
                },
                "IntentEyes": {"position": [0, 0, -0.15]},
            },
            0.44,
            False,
        )
        clips["use_" + ("mainhand" if s < 0 else "offhand")] = pose(
            {
                side + "Arm": rot(-59, 0, s * 12),
                side + "ForeArm": rot(-22),
                "IntentEyes": {"position": [0, 0, -0.14]},
            }
        )
    clips["attacked"] = pose(
        {
            "WideEyes": {"position": [0, 0, -0.22]},
            "Head": rot(-5, 0, 2),
            "LeftWing": rot(0, 12, -5),
            "RightWing": rot(0, -12, 5),
        },
        0.52,
        False,
    )
    seated = {
        k + part: rot(a, 0, s * 3)
        for s, k in [(-1, "Right"), (1, "Left")]
        for part, a in [("Leg", -77), ("LowerLeg", 68), ("Skirt", -57), ("Arm", -27)]
    }
    for state in ["sit", "ride", "boat", "ride_pig"]:
        clips[state] = pose(seated)
    clips["jump"] = pose(
        {
            "RightLeg": rot(-15),
            "LeftLeg": rot(12),
            "RightSkirt": rot(-13),
            "LeftSkirt": rot(10),
            "Tail0": rot(8),
        }
    )
    clips["swim"] = pose(
        {
            "UpperBody": rot(9),
            "RightArm": wave([-32, 0, -14], 1),
            "LeftArm": wave([32, 0, 14], 1),
            "Tail0": wave([0, 6, 0], 1),
        },
        1,
    )
    clips["elytra_fly"] = pose(
        {
            "LeftWing": rot(0, -15, -19),
            "RightWing": rot(0, 15, 19),
            "Tail0": rot(21),
            "LongHair": rot(10),
        }
    )
    clips["climb"] = pose(
        {
            "RightArm": wave([27, 0, -6], 1),
            "LeftArm": wave([-27, 0, 6], 1),
            "RightLeg": wave([-20, 0, 0], 1),
            "LeftLeg": wave([20, 0, 0], 1),
        }
    )
    clips["sleep"] = pose(
        {
            "Blink": {"position": [0, 0, -0.12]},
            "RightArm": rot(-14),
            "Head": rot(0, 8, 4),
        }
    )
    return {"format_version": "1.8.0", "animations": clips}
