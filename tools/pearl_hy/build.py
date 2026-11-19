"""Build: python tools/pearl_hy/build.py path/to/textured-hunyuan.glb"""

import argparse
import io
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from model import Model, construct
from motion import main
from paint import Painter
from scan import Scan

ROOT = Path(__file__).resolve().parents[2]


def geo(name, bones, atlas):
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [
            {
                "description": {
                    "identifier": "geometry.pearl_hy." + name,
                    "texture_width": atlas.width,
                    "texture_height": atlas.height,
                    "visible_bounds_width": 3,
                    "visible_bounds_height": 3,
                    "visible_bounds_offset": [0, 1, 0],
                },
                "bones": bones,
            }
        ],
    }


def build(src, out):
    scan = Scan(src)
    paint = Painter(scan, ROOT / "art/models")
    bones = construct(Model(paint))
    atlas = paint.finish()
    arms = []
    for bone in bones:
        if bone["name"].endswith(("Arm", "HandLocator")):
            b = dict(bone)
            if b.get("parent") == "UpperBody":
                b.pop("parent")
            arms.append(b)
    main_anim = main()
    first = json.loads(
        Path(__file__)
        .with_name("cc0-arm.animation.json")
        .read_text(encoding="utf-8-sig")
    )
    # The CC0 standard item poses reference only the arm, forearm and grip.
    names = {b["name"] for b in arms}
    for clip in first["animations"].values():
        if "bones" in clip:
            clip["bones"] = {k: v for k, v in clip["bones"].items() if k in names}
    manifest = {
        "spec": 2,
        "metadata": {
            "name": "六野 · 白龙娘",
            "tips": "霜珠 / Pearl Dragon",
            "authors": [
                {"name": "Hexwild", "role": "模型、材质与角色动作"},
                {"name": "ZipZipPipe", "role": "角色设定参考"},
            ],
        },
        "properties": {
            "height_scale": 0.88,
            "width_scale": 0.88,
            "preview_animation": "gui",
            "default_texture": "pearl",
        },
        "files": {
            "player": {
                "model": {"main": "models/main.json", "arm": "models/arm.json"},
                "animation": {
                    "main": "animations/main.animation.json",
                    "arm": "animations/arm.animation.json",
                },
                "texture": ["textures/pearl.png"],
            }
        },
    }
    files = {
        "ysm.json": manifest,
        "models/main.json": geo("main", bones, atlas),
        "models/arm.json": geo("arm", arms, atlas),
        "animations/main.animation.json": main_anim,
        "animations/arm.animation.json": first,
    }

    def tidy(x):
        if isinstance(x, float):
            return round(x, 5)
        if isinstance(x, list):
            return [tidy(k) for k in x]
        if isinstance(x, dict):
            return {k: tidy(v) for k, v in x.items()}
        return x

    sources = {
        k: json.dumps(
            tidy(v), ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode()
        for k, v in files.items()
    }
    png = io.BytesIO()
    atlas.save(png, "PNG")
    sources["textures/pearl.png"] = png.getvalue()
    with ZipFile(out, "w") as z:
        for name, data in sources.items():
            info = ZipInfo(name)
            info.compress_type = ZIP_DEFLATED
            z.writestr(info, data)
    faces = sum(len(c["uv"]) for b in bones for c in b.get("cubes", []))
    print(
        scan.triangles,
        "source triangles ->",
        faces * 2,
        "native triangles;",
        len(bones),
        "bones;",
        atlas.size,
        "atlas;",
        out,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mesh", type=Path)
    parser.add_argument(
        "--out", type=Path, default=ROOT / "public/models/pearl-dragon-hy.zip"
    )
    a = parser.parse_args()
    build(a.mesh, a.out)
