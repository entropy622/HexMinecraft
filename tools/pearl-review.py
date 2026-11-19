"""Make a visual comparison from same-camera studio captures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
media = root / 'docs/media/field-models'
results = root / 'test-results'
paper = '#e8e3ec'
ink = '#44364e'


def font(px):
    return ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', px)


def sheet(size, heading):
    image = Image.new('RGB', size, paper)
    draw = ImageDraw.Draw(image)
    draw.text((26,17),heading,font=font(30),fill=ink)
    draw.line((26,74,size[0]-26,74),fill='#c7c0cf')
    return image, draw


def place(board, im, box):
    im = im.convert('RGB')
    x,y,w,h = box
    im.thumbnail((w,h),Image.Resampling.LANCZOS)
    board.paste(im, (x+(w-im.width)//2,y+(h-im.height)//2))


target=Image.open(root/'art/models/pearl-target-front.png')
current=Image.open(media/'front.png').crop((112,53,675,869))
board,draw=sheet((1392,754),'白龙娘   /   设定与游戏模型')
for i,(im,label) in enumerate([(target,'设定图 · 正面'),(current,'游戏模型 · 正面')]):
    box=(18+i*376,96,362,595)
    fit=im.convert('RGB')
    scale=min(box[2]/fit.width,521/fit.height)
    fit=fit.resize((round(fit.width*scale),round(fit.height*scale)),Image.Resampling.LANCZOS)
    board.paste(fit,(box[0]+(box[2]-fit.width)//2,box[1]+(box[3]-fit.height)//2))
    draw.text((198+i*376,702),label,font=font(22),anchor='mt',fill=ink)
for i,(state,label) in enumerate([('calm','平静'),('curious','好奇'),('focus','专注'),('surprise','惊讶')]):
    im=Image.open(results/'dragon-expressions'/(state+'.png'))
    crop=im.crop((76,175,704,679))
    x=775+(i%2)*299;y=104+(i//2)*305
    place(board,crop,(x,y,295,245))
    draw.text((x+148,y+255),label,font=font(19),anchor='mt',fill=ink)
board.save(media/'pearl-review.webp',quality=94)
# Three matching orthographic views: top row is the drawing, bottom row is the
# live pack. Use a single height per row so shoulder and hem widths can be read.
board,draw=sheet((1120,1050),'三视图   /   设定与模型')
for i,(source,game,label) in enumerate([('front','front','正面'),('side','profile','侧面'),('back','back','背面')]):
    x=36+i*351
    for j,im in enumerate([Image.open(root/'art/models'/('pearl-target-'+source+'.png')).convert('RGB'),
                           Image.open(media/(game+'.png')).convert('RGB').crop((113,52,674,868))]):
        h=381 if not j else 399
        scale=h/im.height
        im=im.resize((round(im.width*scale),h), Image.Resampling.LANCZOS)
        y=120 if not j else 572
        board.paste(im,(x+(350-im.width)//2,y))
        draw.text((x+175,y+h+15),label+(' · 设定' if not j else ' · 实渲'),font=font(18),anchor='mt',fill=ink)
board.save(media/'pearl-ortho.webp',quality=94)
# Review the actual surfaces at portrait distance, including the side profile
# that is hidden behind the cheek locks in the front view.
board,draw=sheet((1120,795),'白龙娘   /   面部、侧发与尾鳞')
for i,(ref,screen,view_size,refbox,screenbox,label) in enumerate([
    ('front','front',(420,604),(108,105,310,238),(253,203,525,383),'脸形与腮红'),
    ('side','profile',(294,604),(30,77,236,288),(251,163,525,445),'耳侧发束'),
    ('back','back',(407,604),(132,362,287,586),(294,532,502,836),'尾鳞')]):
    cx=214+354*i
    draw.text((cx,98),label,font=font(23),anchor='mt',fill=ink)
    target=Image.open(root/'art/models'/('pearl-target-'+ref+'.png')).resize(view_size,Image.Resampling.LANCZOS).crop(refbox)
    actual=Image.open(media/(screen+'.png')).crop(screenbox)
    for j,im in enumerate((target,actual)):
        h=264
        scale=min(329/im.width,h/im.height)
        im=im.resize((round(scale*im.width),round(scale*im.height)),Image.Resampling.LANCZOS)
        y=144+318*j
        board.paste(im,(cx-im.width//2,y+(h-im.height)//2))
        draw.text((cx,y+h+12),('设定' if not j else '游戏实渲'),font=font(18),anchor='mt',fill=ink)
board.save(media/'pearl-details.webp',quality=95)
board,draw=sheet((1200,660),'网格对照   /   素模')
for i,(key,label) in enumerate([('previous','旧版 · 正侧面'),('current','新版 · 正侧面'),('current-back','新版 · 背侧面')]):
    im=Image.open(results/'pearl-clay'/(key+'.png'))
    place(board,im.crop((45,25,605,770)),(i*400,85,400,500))
    draw.text((i*400+200,602),label,font=font(20),anchor='mt',fill=ink)
board.save(media/'pearl-clay.webp',quality=92)
