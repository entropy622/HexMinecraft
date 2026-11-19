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
