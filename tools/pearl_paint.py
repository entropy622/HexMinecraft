"""Pack the artist's face & material sheet into per-surface Bedrock UV tiles."""
from PIL import Image, ImageDraw, ImageOps
from pearl_faces import portraits

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

    faces,skin=portraits(path.with_name('pearl-expression-source.png'),SIZE)
    for name,face in faces.items():add(name,face)
    add('skin',skin)

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
    front=Image.open(path.with_name('pearl-target-front.png')).convert('RGBA').resize((420,604),LANCZOS)
    side=Image.open(path.with_name('pearl-target-side.png')).convert('RGBA').resize((294,604),LANCZOS)
    # Sample uninterrupted hair planes, away from any eye, ear or brooch.
    add('bob pearl',front.crop((190,115,221,176)))
    add('bob moon',side.crop((98,151,124,218)))
    add('bob shade',side.crop((178,126,201,202)))
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
    # One quiet enamel plane per scale; relief and the free edge are geometry.
    plate=Image.new('RGBA',(SIZE,SIZE))
    pigment=ImageDraw.Draw(plate)
    for y in range(SIZE):
        t=y/(SIZE-1)
        for col,(light,shadow) in enumerate([((208,184,226),(160,133,181)),((229,204,241),(176,148,198)),
                                              ((243,223,248),(190,160,207)),((255,244,255),(216,187,228))]):
            color=tuple(round(a+(b-a)*t) for a,b in zip(light,shadow))
            pigment.line((col*32,y,col*32+31,y),fill=color+(255,))
    add('scute',plate)
    add('tail',wash(plate.crop((34,58,59,123)),'#ac93bc',.68))
    add('gore',ImageOps.colorize(web.convert("L"),"#4b2c63","#dcb2f3",blackpoint=65,whitepoint=216).convert("RGBA"))
    add("knot",Image.open(path.with_name("pearl-clasp.png")).convert("RGBA"))
    return atlas, tiles
