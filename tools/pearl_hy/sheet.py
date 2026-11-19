"""Pair the drawing with same-height runtime captures, without rescaling individual parts."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
frames = root / "test-results/pearl-hy"
out = root / "docs/media/pearl-hy"
out.mkdir(parents=True, exist_ok=True)
board = Image.new("RGB", (1600, 680), "#f6f4f7")
pen = ImageDraw.Draw(board)


def font(n):
    return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", n)


pen.text((30, 19), "霜珠  /  白龙娘", font=font(30), fill="#372d41")
pen.text(
    (1570, 32), "六野    /    YSM 角色实渲", anchor="ra", font=font(18), fill="#675772"
)
pen.line((30, 73, 1570, 73), fill="#d7cfdb")


def place(pic, cx, label, height=482):
    w = round(pic.width * height / pic.height)
    pic = pic.resize((w, height), Image.Resampling.LANCZOS)
    board.paste(pic, (cx - w // 2, 100 + (500 - height) // 2))
    pen.text((cx, 623), label, anchor="mt", font=font(19), fill="#52445c")


place(
    Image.open(root / "art/models/pearl-target-front.png").crop((0, 3, 267, 383)),
    177,
    "设定图",
)
for name, cx, label, box in [
    ("front", 525, "正面", (50, 58, 472, 657)),
    ("side", 804, "左侧", (119, 58, 400, 657)),
    ("back", 1097, "背面", (50, 58, 472, 657)),
]:
    place(Image.open(frames / (name + ".png")).crop(box), cx, label)
place(Image.open(frames / "face.png").crop((53, 75, 467, 542)), 1430, "面部近景", 330)
board.save(out / "model-sheet.webp", quality=94)
# The source and the shipped geometry share one camera, rest pose and lighting.
# Keep identical crop rectangles for both rows, including the exposed shoe.
reference = frames / "final-compare"
proof = Image.new("RGB", (1720, 1112), "#faf9fc")
drawer = ImageDraw.Draw(proof)
drawer.text(
    (32, 17), "白龙娘    /    混元原模与 YSM 实渲", font=font(30), fill="#30273c"
)
drawer.text((32, 69), "同姿态、同尺度、同光照", font=font(17), fill="#675970")
for j, (angle, title) in enumerate(
    [
        ("front", "正面"),
        ("three-quarter", "四分之三"),
        ("side", "侧面"),
        ("back", "背面"),
    ]
):
    x = 108 + j * 399
    drawer.text((x + 189, 89), title, anchor="mt", font=font(18), fill="#463b50")
    for i, kind in enumerate(["hy", "ysm"]):
        im = Image.open(reference / f"{kind}-{angle}.png").convert("RGB")
        im = im.crop((0, 46, 520, 674)).resize((385, 465), Image.Resampling.LANCZOS)
        proof.paste(im, (x, 126 + i * 480))
for i, label in enumerate(["混元", "YSM"]):
    drawer.text((13, 334 + i * 480), label, font=font(23), fill="#5e4971")
proof.save(out / "hy-native.webp", quality=95)
