"""Pack the artist's face & material sheet into per-surface Bedrock UV tiles."""
from PIL import Image, ImageDraw, ImageOps

SIZE = 128
LANCZOS = Image.Resampling.LANCZOS


def paint_atlas(path):
    source = Image.open(path).convert("RGB")
    atlas = Image.new("RGBA", (8 * SIZE, 4 * SIZE))
    tiles = {}

    def source_tile(col, row):
        w, h = source.size
        box = (round(col*w/4)+2, round(row*h/3)+2,
               round((col+1)*w/4)-2, round((row+1)*h/3)-2)
        return source.crop(box).resize((SIZE, SIZE), LANCZOS).convert("RGBA")

    def add(name, im):
        assert len(tiles) < 32
        i = len(tiles)
        tiles[name] = ((i % 8) * SIZE, (i // 8) * SIZE)
        atlas.paste(im.resize((SIZE, SIZE), LANCZOS), tiles[name])

    def wash(im, color, t):
        return Image.blend(im, Image.new("RGBA", im.size, color), t)

    # Use the approved turnaround's painted iris and lash. Each performance
    # changes the opening, eye line and mouth on the same cheek surface.
    eye = Image.open(path.with_name("pearl-eye.png")).convert("RGBA")
    base = Image.new("RGBA", (SIZE, SIZE))
    skin = base.load()
    for y in range(SIZE):
        for x in range(SIZE):
            edge = abs((x - 63.5) / 64)
            blush = max(0, 1 - abs(edge-.62)/.29) * max(0, 1 - abs(y-92)/9)
            shadow = max(0, (edge-.64)/.36)*.2 + max(0, (39-y)/39)*.13
            skin[x,y] = (int(255-29*shadow-5*blush), int(232-57*shadow-22*blush),
                         int(221-23*shadow-11*blush), 255)
    for name, w, h, y, skew in [("face",32,37,64,0),("curious",32,39,62,2),
                               ("focus",32,29,68,-1),("startle",32,43,59,0),("blink",32,0,0,0)]:
        f=base.copy(); d=ImageDraw.Draw(f)
        for j,x in enumerate([14,82]):
            offset = skew if j else -skew
            if h:
                patch=eye.resize((w,h), LANCZOS)
                if j: patch=ImageOps.mirror(patch)
                f.alpha_composite(patch,(x,y+offset))
                brow=[(x+5,y-9+offset),(x+15,y-11+offset),(x+28,y-10+offset)]
                if name=="focus":brow=[(x+3,y-12),(x+16,y-10),(x+29,y-6)] if not j else [(x+3,y-6),(x+16,y-10),(x+29,y-12)]
                d.line(brow,fill="#997979",width=2)
            else:
                d.line([(x+2,78),(x+8,81),(x+18,82),(x+29,77)],fill="#624455",width=3)
        if name in ("startle","curious"):
            d.rounded_rectangle((60,105,67,112 if name=="startle" else 109),radius=2,fill="#a66979")
            d.line((61,108,66,108),fill="#ecabb0")
        else:
            d.line([(58,106),(61,107),(66,107),(69,105 if name!="focus" else 107)], fill="#bb7a80",width=2)
        add(name,f)
    add("skin",base.crop((54,49,72,67)))

    hair, shade, bodice, drape = [source_tile(i,1) for i in range(4)]
    scales, web, keratin, knot = [source_tile(i,2) for i in range(4)]
    hair=ImageOps.colorize(hair.convert("L"),"#988ca4","#fffaf6",blackpoint=141,whitepoint=251).convert("RGBA")
    hair=hair.crop((19,2,88,126)).resize((128,128),LANCZOS)
    shade=ImageOps.colorize(shade.convert("L"),"#857495","#e7dcea",blackpoint=92,whitepoint=202).convert("RGBA")
    # A handful of broad steps in value keeps the locks readable at game scale.
    hair=wash(hair.resize((5,8),Image.Resampling.BOX).resize((128,128),Image.Resampling.NEAREST),"#e6dfeb",.68)
    shade=wash(shade,"#a89bb7",.74)
    add("snow",wash(hair,"#f3ecf4",.29)); add("hair",hair)
    add("hairshade",Image.blend(shade,hair,.48))
    shirt = wash(bodice,"#eee7ef",.89)
    stitch = ImageDraw.Draw(shirt)
    stitch.line((62,0,62,128),fill="#c9bbd2",width=2)
    for y in (20,60,101):
        stitch.line([(56,y+2),(60,y),(64,y),(70,y-2)],fill="#bfb0cc",width=2)
    add("bodice",shirt)
    # Separate motif size and nap direction from the shape of the cuboid.
    drape=ImageOps.colorize(drape.convert("L"),"#9285a5","#fff9f6",blackpoint=141,whitepoint=248).convert("RGBA")
    plain=drape.crop((12,8,81,92))
    for name,texture,col,t in [
        ("lapel",drape.crop((13,2,87,93)),"#f9eef4",.27),
        ("pleat",plain,"#eee1f1",.22),("lin",plain,"#8e799f",.38),
        ("ice",plain,"#fff3ee",.52),("lilac",plain,"#cfb9d9",.28),
        ("fold",plain,"#947caa",.47),("hem",drape.crop((39,101,91,126)),"#cfb8da",.23),
        ("shoe",plain,"#fff1ef",.55),("belt",keratin.crop((0,78,110,117)),"#ac88b6",.43),
        ("pearl",keratin.crop((32,0,103,42)),"#fff6ff",.42),
        ("horn",keratin.crop((14,24,97,57)),"#e1d3df",.23),
        ("tip",keratin.crop((8,67,105,96)),"#b598cb",.30),
        ("rib",keratin.crop((15,40,110,120)),"#9573a5",.52),
    ]:
        if name in ("horn","tip","rib","belt","pearl"):
            texture=ImageOps.colorize(texture.convert("L"),"#9785aa","#f3edf7").convert("RGBA")
        if name in ("horn","tip","rib"):
            dark,light = {"horn":("#897999","#dfd4e8"),"tip":("#917aa5","#cbbed8"),
                          "rib":("#68517c","#bea4d1")}[name]
            texture=ImageOps.colorize(ImageOps.autocontrast(texture.convert("L")),dark,light).convert("RGBA")
            col=light;t=.14
        add(name,wash(texture,col,t))
    add("tail",wash(scales.crop((24,32,59,69)),"#ccbad6",.45))
    add("scute",wash(scales.crop((36,46,76,84)),"#ded1e6",.57))
    add('gore',ImageOps.colorize(web.convert("L"),"#4b2c63","#dcb2f3",blackpoint=65,whitepoint=216).convert("RGBA"))
    add("knot",Image.open(path.with_name("pearl-clasp.png")).convert("RGBA"))
    return atlas, tiles
