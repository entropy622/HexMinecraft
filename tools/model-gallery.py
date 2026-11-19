"""Assemble the actual studio captures into the two reader-facing sheets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

MEDIA = Path(__file__).resolve().parents[1] / "docs/media/field-models"


def sheet(name, title, items, cols, width, height):
    rows = (len(items) + cols - 1) // cols
    canvas = Image.new("RGB", (width * cols, 96 + rows * (height + 48)), "#e8e3ec")
    draw = ImageDraw.Draw(canvas)
    font = "C:/Windows/Fonts/msyh.ttc"
    draw.text((26, 19), title, font=ImageFont.truetype(font, 32), fill="#433751")
    draw.line((28, 77, canvas.width - 28, 77), fill="#c6bdcf")
    for i, (file, label) in enumerate(items):
        image = Image.open(MEDIA / (file + ".png")).convert("RGB")
        image.thumbnail((width, height), Image.Resampling.LANCZOS)
        x, y = i % cols * width, 88 + i // cols * (height + 48)
        canvas.paste(image, (x + (width - image.width) // 2, y + (height - image.height) // 2))
        draw.text((x + width / 2, y + height + 7), label,
                  font=ImageFont.truetype(font, 20), anchor="mt", fill="#5a4d67")
    canvas.save(MEDIA / (name + ".webp"), quality=92)


sheet("turnaround", "六野   /   白龙娘",
      [("front", "正面"), ("profile", "侧面"), ("back", "背面")], 3, 450, 610)
sheet("residents", "六野   /   牧场与村庄",
      [("cow", "牛"), ("pig", "猪"), ("sheep", "绵羊"), ("chicken", "鸡"),
       ("farmer", "农夫"), ("smith", "铁匠"), ("merchant", "商人"), ("fisher", "渔夫")],
      4, 260, 265)
