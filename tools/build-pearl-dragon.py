"""Build the native YSM pack. Coordinates are Bedrock units; front faces point north."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json, math
from io import BytesIO
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
S = 64
atlas = Image.new('RGBA', (512,256))
tiles = {}
def tile(name, base):
    global draw
    idx = len(tiles)
    tiles[name] = ((idx%8)*S,(idx//8)*S)
    im = Image.new('RGBA',(S,S),base)
    draw = ImageDraw.Draw(im)
    return im
def done(name,im):
    atlas.paste(im,tiles[name])
def rect(box,c): draw.rectangle(box,fill=c)
def poly(pts,c): draw.polygon(pts,fill=c)
def swatch(name,base,sh,hi,mode):
    im=tile(name,base)
    if mode=='silk':
        poly([(0,0),(10,0),(7,28),(4,37),(4,63),(0,63)],sh)
        poly([(46,0),(56,0),(53,22),(50,29),(47,63),(42,63),(46,31)],hi)
        rect((0,59,63,60),sh); rect((0,61,63,62),hi)
    if mode=='hair':
        poly([(0,0),(10,0),(12,33),(8,52),(8,63),(0,63)],sh)
        poly([(13,19),(37,19),(37,17),(57,17),(55,23),(34,23),(34,25),(13,25)],hi)
        rect((49,36,51,60),hi)
    if mode=='horn':
        rect((0,49,63,62),sh); rect((0,2,63,6),hi)
        poly([(7,7),(18,7),(15,45),(9,47)],hi)
    if mode=='wing':
        poly([(0,0),(19,0),(10,40),(7,63),(0,63)],sh)
        poly([(36,0),(52,0),(42,36),(31,60)],hi)
    if mode=='scales':
        for j in range(-1,5):
            for i in range(-1,5):
                x=i*22+(j%2)*11;y=j*19
                poly([(x,y),(x+11,y+8),(x+22,y),(x+18,y+10),(x+11,y+15),(x+4,y+10)],sh)
                draw.line([(x+2,y+2),(x+11,y+10),(x+18,y+5)],fill=hi,width=2)
    done(name,im)
for args in [
 ('hair','#e6e0eb','#c9bfd3','#f8f4fa','hair'),('hairshade','#c4b6d0','#a99ab9','#ddd4e8','hair'),
 ('ice','#f4edf6','#d4c4e0','#fffaff','silk'),('lilac','#d9c8df','#b4a0c3','#eee4f2','silk'),
 ('fold','#b7a4c4','#917ea2','#d4c5de','silk'),('hem','#d7c3e4','#9a7dab','#eee5f6','silk'),
 ('horn','#e2d5eb','#baa6c9','#fcf3ff','horn'),('tip','#b7a5c7','#9684ad','#daccdf','horn'),
 ('rib','#ac8abc','#806591','#cdb2d8','horn'),('membrane','#a183ba','#77598d','#ba9ac9','wing'),
 ('memlight','#b89bc7','#9073a6','#c9acd5','wing'),('tail','#cdb6df','#a68cba','#e9d9f3','scales'),
 ('skin','#ffe2d3','#eac0b4','#ffe8d8','none'),('shoe','#dccee4','#a991bc','#f8f0f9','silk'),
 ('belt','#a58bb3','#856e94','#d9c3e5','horn'),('pearl','#fff6fd','#c5aecf','#ffffff','none')]:swatch(*args)
def face(name,blink):
    im=tile(name,'#ffe3d2')
    for y in range(S):
        for x in range(S):
            shade=.12*(abs(x-32)/32)**2+.07*(1-y/64)
            im.putpixel((x,y),(round(255-43*shade),round(229-79*shade),round(213-30*shade),255))
    poly([(0,0),(63,0),(63,22),(56,21),(51,17),(45,17),(40,14),(23,14),(18,18),(5,23),(0,30)],'#eed0c7')
    for mirror in [False,True]:
        def box(x,y,u,v,c):
            rect((63-u if mirror else x,y,63-x if mirror else u,v),c)
        box(8,26,21,26,'#a77b78')
        box(9,25,17,25,'#a77b78')
        box(4,44,16,45,'#ffc6c1');box(9,46,12,46,'#f9c0bc')
        if blink:
            box(7,38,23,39,'#624453');box(5,36,8,37,'#624453');continue
        box(7,33,23,42,'#fffbfa');box(10,31,21,42,'#4d344f');box(10,35,21,42,'#875491')
        box(11,38,20,42,'#b575b8');box(12,40,20,42,'#d996d4');box(14,33,17,38,'#6c427c')
        box(6,30,22,32,'#4e3849');box(4,29,8,31,'#4e3849');box(9,29,19,29,'#604454')
        box(15,40,18,42,'#efa6e4');box(21,34,22,36,'#fff6f7');box(10,32,13,34,'#fff9fc');box(18,39,19,40,'#ffe3f7');box(7,43,20,43,'#e2b3b4')
    rect((6,46,7,47),'#f1acb0');rect((9,46,10,47),'#f1acb0');rect((54,46,55,47),'#f1acb0');rect((57,46,58,46),'#f1acb0');rect((30,44,32,44),'#f6c4b6');rect((28,51,29,51),'#c88f93');rect((30,52,33,52),'#c88f93');rect((34,51,35,51),'#c88f93')
    done(name,im)
face('face',False);face('blink',True)
im=tile('knot',(0,0,0,0))
# Six interwoven square-ended silk loops, with a dark woven edge and pearl highlights.
for col,width,off in [('#785e8a',8,1),('#cfb7df',6,0),('#fff4ff',3,-1)]:
    for k in range(6):
        a=math.pi*k/3
        points=[]
        for x,y in [(0,-7),(8,-12),(9,-19),(5,-24),(-2,-25),(-7,-21),(-7,-16),(0,-9)]:
            points.append((round(32+x*math.cos(a)-y*math.sin(a)),round(32+x*math.sin(a)+y*math.cos(a))+off))
        draw.line(points,fill=col,width=width)
done('knot',im)
im=tile('bodice','#eadde9')
poly([(0,0),(14,0),(9,20),(8,37),(13,63),(0,63)],'#c9b6d1')
poly([(63,0),(55,0),(54,31),(52,63),(63,63)],'#dac9df')
rect((30,0,31,63),'#c5b2cb');rect((32,0,33,63),'#f7eff7')
for y in (10,27,45):
    rect((24,y,39,y+1),'#af96b9');rect((27,y-1,36,y),'#faf2f8');rect((31,y-2,33,y+2),'#d3bddb')
done('bodice',im)
# Paint the broad cloth planes and bat membrane in local pixels so the silhouette
# stays sharp at playing distance without modelling a stack of thin slivers.
def mix(c,d,t):
    return tuple(round(int(c[i:i+2],16)*(1-t)+int(d[i:i+2],16)*t) for i in (1,3,5))
for name,base,shade,light,mode in [
    ('lapel','#f3eaf2','#bba6c8','#fffcff','robe'),('pleat','#dfcfe7','#aa92bb','#f8edf8','robe'),
    ('lin','#c5b3d2','#9a83ad','#e6d6ed','robe'),('snow','#e8e1eb','#bbafc9','#faf8fc','lock')]:
    im=tile(name,base)
    for y in range(S):
        for x in range(S):
            q=(x+.13*y)/64
            if mode=='robe':
                v=.12+.52*(1-x/63)**3+.12*(1+math.sin(q*10))+.12*y/64
                col=mix(base,shade,round(v*11)/11)
                if .59<q<.77:col=mix(base,light,.58*(1-abs(.68-q)/.09))
            else:
                v=.02+.42*(1-x/64)**2+.11*y/64
                col=mix(base,shade,round(v*10)/10)
                if 13+x//9<=y<=20+x//9 and 7<x<51:col=mix(base,light,.64)
            im.putpixel((x,y),(*col,255))
    if mode=='robe':
        rect((0,60,63,60),'#a991ba');rect((0,62,63,63),'#fdf3fa')
    done(name,im)
for idx in range(3):
    name='web'+str(idx);im=tile(name,(0,0,0,0))
    # Tip, two curved lower scallops, then the inward leading edge.
    top=[(0,32),(21,22),(42,10),(63,0)] if idx==0 else [(0,0),(12,3),(30,9),(46,17),(63,26 if idx==1 else 32)]
    outline=top+[(63,63),(57,58),(48,53),(39,50),(30,49),(22,51),(15,55),(8,60),(0,63)]
    poly(outline,'#a783b7')
    for y in range(S):
        for x in range(S):
            if not im.getpixel((x,y))[3]:continue
            v=.45*(1-y/64)+.25*(1-x/64)+.17*abs(math.sin((x-y*.35)*.052))
            col=mix('#d7b6e3','#795885',round(v*15)/15)
            im.putpixel((x,y),(*col,255))
    done(name,im)
bones=[]
def bone(n,p=None,at=(0,0,0)):
    b={'name':n,'pivot':list(at)}
    if p:b['parent']=p
    bones.append(b);return b
def cube(b,name,center,size,mat,rot=None,pivot=None,faces=None):
    def uv(t): return {'uv':list(tiles[t]),'uv_size':[S,S]}
    c={'origin':[round(x-d/2,4) for x,d in zip(center,size)],'size':list(size),
       'uv':{f:uv((faces or {}).get(f,mat)) for f in ('north','south','east','west','up','down')}}
    if rot:c.update(rotation=[-rot[0],rot[1],-rot[2]],pivot=list(pivot or center))
    b.setdefault('cubes',[]).append(c)
def piece(b,a,z,width,depth,mat):
    dx,dy=z[0]-a[0],z[1]-a[1]
    cube(b,'link',[(x+y)/2 for x,y in zip(a,z)],(width,math.hypot(dx,dy)+.12,depth),mat,(0,0,math.degrees(math.atan2(-dx,dy))))
def emblem(b,at,size):
    x,y,z=at
    # Only the front of the decal is present; no opaque side faces.
    cube(b,'knot',(x,y,z),(size,size,.03),'knot')
root=bone('Root'); body=bone('AllBody','Root',(0,13,0)); upper=bone('UpperBody','AllBody',(0,14,0))
head=bone('Head','UpperBody',(0,22.4,0))
cube(head,'head',(0,25.66,-.05),(7.55,6.65,6.15),'skin',faces={'north':'face'})
eyes=bone('Blink','Head',(0,25.66,-3.14))
cube(eyes,'closed',(0,25.66,-3.09),(7.55,6.65,.012),'blink')
cube(head,'cap',(0,28.21,.02),(8.17,2.54,6.82),'snow')
cube(head,'crown',(0,29.46,.19),(7.44,.75,6.35),'snow')
cube(head,'part',(-.15,29.81,.36),(5.73,.39,5.19),'snow')
cube(head,'nape',(0,25.38,2.92),(7.94,5.28,1.25),'hairshade')
for k,(x,w,y,h) in enumerate([(-2.88,1.56,27.42,3.83),(-1.46,1.24,27.94,3.22),(.05,1.83,27.25,4.07),(1.63,1.24,28.12,2.95),(2.93,1.42,27.62,3.5)]):
    cube(head,'fringe',(x,y,-3.34-(k%3)*.13),(w,h,.89),'snow',(0,0,[-5,-3,2,4,6][k]))
for s,side in [(-1,'Right'),(1,'Left')]:
    cube(head,'ear',(s*4,24.65,-.08),(1.02,1.12,1.34),'skin')
    for x,y,z,w,h,d in [(3.57,26.23,-2.22,1.24,5.3,2.16),(3.71,24.52,-2.58,1.02,3.8,1.27)]:
        cube(head,'temple',(s*x,y,z),(w,h,d),'hair',(0,0,-s*4))
    lock=bone(side+'Lock','Head',(s*3.7,24,-1.6))
    cube(lock,'cheeklock',(s*3.57,21.77,-2.13),(1.13,4.6,1.1),'hair',(4,0,-s*4))
    cube(lock,'locktip',(s*3.45,19.5,-2.29),(.85,1.15,.89),'hairshade')
    for x,y,z,w,h in [(3.65,25.8,.94,1.13,5.3),(3.32,23.63,2.14,1.6,5.5),(2.83,21.91,3.06,1.2,5.22)]:
        cube(head,'side hair',(s*x,y,z),(w,h,1.63),'hair',(4,0,-s*2))
    # Bowed horns with an inward turn at the last joint.
    for i,(x,y,z,w,h,tilt) in enumerate([(2.98,29.85,.63,1.55,1.72,-17),(3.42,31.12,.77,1.34,1.46,-9),(3.43,32.3,.88,1.1,1.25,8),(3.21,33.29,1,.78,1.06,17),(3.02,34.03,1.13,.49,.72,19)]):
        cube(head,'horn',(s*x,y,z),(w,h,w*.94),'horn' if i<4 else 'tip',(8,0,s*tilt))
for x,y,w,h in [(-2.82,23.79,1.55,7.4),(-1.28,23.1,1.75,8.9),(.22,22.35,1.6,10.2),(1.62,23.1,1.33,8.85),(2.97,24,1.46,7.26)]:
    cube(head,'back lock',(x,y,3.45+(1-abs(x)/4)*.6),(w,h,1.18),'hair' if x!=-1.28 else 'hairshade',(-5,0,-x*.9))
emblem(head,(3.47,27.91,-3.93),2.24)
cube(upper,'neck',(0,22.15,0),(2.22,2.02,2.1),'skin')
cube(upper,'collar',(0,21.66,0),(2.77,1.07,2.5),'ice')
cube(upper,'bodice',(0,18.84,0),(4.71,5.33,3.34),'lilac',faces={'north':'bodice'})
cube(upper,'waist',(0,15.79,.02),(4.2,1.36,3.12),'ice',faces={'north':'bodice'})
cube(body,'sash',(0,14.96,-.04),(5.22,.77,3.7),'belt')
skirt=bone('Skirt','AllBody',(0,14.7,.05))
for s,side in [(-1,'Right'),(1,'Left')]:
    arm=bone(side+'Arm','UpperBody',(s*2.56,20.98,0))
    fore=bone(side+'ForeArm',arm['name'],(s*3.21,18.22,0))
    cube(arm,'bare shoulder',(s*2.92,19.86,0),(1.58,2.68,1.83),'skin',(0,0,s*12))
    for x,y,w,h,d,mat in [(3.32,18.48,1.91,1.04,2.01,'ice'),(3.67,16.96,1.9,2.52,2.08,'lilac'),(4.03,15.12,2.32,1.85,2.43,'ice'),(4.23,14.21,2.42,.51,2.51,'hem')]:
        cube(fore,'sleeve',(s*x,y,-.03),(w,h,d),mat,(0,0,s*11))
    cube(fore,'hand',(s*4.35,13.53,-.07),(1.49,1.47,1.62),'skin',(0,0,s*11))
    bone(side+'HandLocator',fore['name'],(s*4.36,13.25,-.14))
    leg=bone(side+'Leg','AllBody',(s*1.31,14,0))
    shin=bone(side+'LowerLeg',leg['name'],(s*1.31,6.9,.04))
    cube(leg,'leg',(s*1.31,10.45,.06),(1.69,7.22,1.84),'skin')
    cube(shin,'shin',(s*1.31,4.15,.06),(1.48,5.65,1.62),'skin')
    for y,h,w,z,d,mat in [(1.63,1.46,1.64,0,1.82,'ice'),(.64,1.24,1.91,-.39,2.56,'shoe'),(.21,.35,1.94,-.39,2.59,'fold')]:
        cube(shin,'shoe',(s*1.31,y,z),(w,h,d),mat)
    # Split robe: independent swinging panels, layered over a darker back lining.
    panel=bone(side+'Skirt','Skirt',(s*1.75,14.6,-1.35))
    # Long inner overlap falls toward one shoe; the opening leaves a single stocking visible.
    offset=-.56 if s==1 else .08
    cube(panel,'front lapel',(s*(1.98+offset),7.57,-1.97),(2.67,14.07,1.13),'lapel',(1,0,s*5))
    for i,(x,y,w,h,z,d) in enumerate([(2.79,12.34,1.68,4.44,-1.37,1.39),(3.45,8.05,2.03,4.55,-1.47,1.5),(4.15,3.63,2.4,4.95,-1.56,1.59)]):
        cube(panel,'overlap',(s*x,y,z),(w,h,d),'pleat',(0,0,s*9))
    for x,y,w,h,z,d in [(2.97,12.24,1.63,4.8,.16,3.12),(3.7,8.04,1.99,4.46,.23,3.61),(4.54,3.43,2.31,5.46,.33,4.02)]:
        cube(panel,'side pleat',(s*x,y,z),(w,h,d),'lin',(0,0,s*10))
    emblem(panel,(s*(2.38+offset),1.9,-2.65),1.53)
    emblem(body,(s*2.03,14.92,-2.72),1.89)
    cube(body,'tassel',(s*2.23,13.48,-2.67),(.52,1.82,.56),'ice',(0,0,-s*8))
for y,w,h,z,d in [(12.27,5.01,5.11,1.34,1.41),(8.01,6.02,3.95,1.68,1.59),(3.66,7.12,5.09,2.04,1.68),(.84,7.73,.84,2.22,1.75)]:
    cube(skirt,'train',(0,y,z),(w,h,d),'lilac')
for s,side in [(-1,'Right'),(1,'Left')]:
    wing=bone(side+'Wing','UpperBody',(s*2.2,20.09,1.75))
    wing['rotation']=[0,-s*22,0]
    # Each web ends on a different stair, leaving an air gap below the spar.
    def web(x,y,w,h,z,mat):
        cube(wing,'sail',(s*x,y,z),(w,h,.085),mat)
        # North and south UVs face in opposite directions.
        c=wing['cubes'][-1]
        for face in ['north','south']:
            if (face=='north')==(s==-1):
                x0,y0=tiles[mat];c['uv'][face]={'uv':[x0+S,y0],'uv_size':[-S,S]}
        c['uv']={f:c['uv'][f] for f in ['north','south']}
    web(3.65,19.69,3.18,4.71,2.66,'web0')
    web(6.69,19.3,3.71,5.9,2.78,'web1')
    web(9.85,17.14,3.83,5.9,3.32,'web2')
    def spar(a,b,w,d,mat='rib'):
        piece(wing,(s*a[0],a[1],a[2]),(s*b[0],b[1],b[2]),w,d,mat)
    spar((2.1,19.73,2.1),(5.05,22.27,2.52),.85,.87)
    spar((5.05,22.27,2.55),(8.57,19.88,3.07),.66,.77)
    spar((8.57,19.88,3.03),(11.3,17.21,3.55),.53,.71)
    spar((11.3,17.21,3.57),(11.69,14.1,3.71),.4,.61)
    spar((5.21,21.87,2.34),(5.5,16.79,2.56),.35,.35)
    spar((5.36,21.87,2.45),(7.94,16.21,2.84),.34,.39)
    cube(wing,'claw',(s*5.06,22.31,2.59),(.83,.76,.95),'tip',(0,0,-s*21))
points=[(0,13.3,2.4),(.45,12.65,3.57),(1.48,11.49,4.48),(2.84,10.24,4.87),(3.85,8.75,5.02),(4.21,7.02,5.06),(4.02,5.51,5.02),(3.16,4.29,4.76),(2,3.57,4.18),(.8,3.32,3.58)]
parent='AllBody'
for i,(a,z) in enumerate(zip(points,points[1:])):
    b=bone('Tail'+str(i),parent,a);parent=b['name']
    dx,dy,dz=[v-u for u,v in zip(a,z)]; length=math.sqrt(dx*dx+dy*dy+dz*dz)
    width=2.86-i*.247
    cube(b,'scale',[(x+y)/2 for x,y in zip(a,z)],(width,length+.48,width*.95),'tail',(math.degrees(math.asin(-dz/length)),0,math.degrees(math.atan2(dx,-dy))))
def wave(axis,amp,period,phase=0):
    return {str(round(i*period/4,3)):[round((amp*math.sin(phase+i*math.pi/2)) if j==axis else 0,3) for j in range(3)] for i in range(5)}
idle={'Blink':{'position':{'0':[0,0,0],'3.79':[0,0,0],'3.80':[0,0,-.09],'3.93':[0,0,-.09],'3.94':[0,0,0],'4':[0,0,0]}}}
for i in range(9):idle['Tail'+str(i)]={'rotation':wave(1,2.7,4,-i*.39)}
for s,side in [(-1,'Right'),(1,'Left')]:
    idle[side+'Wing']={'rotation':wave(1,s*4,4)}
    idle[side+'Lock']={'rotation':wave(0,1.6,4,s*.2)}
def clip(duration,bs,loop=True):return dict(animation_length=duration,loop=loop,bones=bs)
walk={}
for s,side in [(-1,'Right'),(1,'Left')]:
    for part,amp in [('Leg',22),('Arm',-18),('Skirt',8),('ForeArm',-7)]:
        walk[side+part]={'rotation':wave(0,s*amp,.8)}
attack={'RightArm':{'rotation':{'0':[0,0,0],'.12':[-96,-8,8],'.25':[-48,9,-4],'.42':[0,0,0]}},'RightForeArm':{'rotation':{'0':[0,0,0],'.12':[-22,0,0],'.42':[0,0,0]}}}
crouch={'AllBody':{'position':[0,-2,0]},'UpperBody':{'rotation':[13,0,0]}}
animations={'format_version':'1.8.0','animations':{'idle':clip(4,idle),'gui':clip(4,idle),'walk':clip(.8,walk),'run':clip(.8,walk),'swing_hand':clip(.42,attack,False),'sneak':clip(1,crouch),'sneaking':clip(.8,dict(walk,**crouch))}}
def geo(id,parts):
    return {'format_version':'1.12.0','minecraft:geometry':[{'description':{'identifier':'geometry.pearl_dragon.'+id,'texture_width':atlas.width,'texture_height':atlas.height,'visible_bounds_width':3,'visible_bounds_height':3,'visible_bounds_offset':[0,1,0]},'bones':parts}]}
arms=[{k:v for k,v in b.items() if not(k=='parent' and b['name'].endswith('Arm') and not b['name'].endswith('ForeArm'))} for b in bones if b['name'].endswith(('Arm','HandLocator'))]
player={'model':{'main':'models/main.json','arm':'models/arm.json'},'animation':{'main':'animations/main.json','arm':'animations/arm.json'},'texture':['textures/pearl.png']}
manifest={'spec':2,'metadata':{'name':'六野 · 白龙娘','tips':'Pearl Dragon / Hexwild','authors':[{'name':'Hexwild','role':'模型与贴图'},{'name':'ZipZipPipe','role':'角色设定参考'}]},'properties':{'height_scale':.88,'width_scale':.88,'preview_animation':'gui','default_texture':'pearl'},'files':{'player':player}}
files={'ysm.json':manifest,player['model']['main']:geo('main',bones),player['model']['arm']:geo('arm',arms),player['animation']['main']:animations,player['animation']['arm']:{'format_version':'1.8.0','animations':{'swing':clip(.42,attack,False)}}}
files={k:json.dumps(v,ensure_ascii=False,separators=(',',':')).encode() for k,v in files.items()}
png=BytesIO();atlas.save(png,'PNG');files[player['texture'][0]]=png.getvalue()
out=ROOT/'public/models/pearl-dragon.zip';out.parent.mkdir(exist_ok=True)
with ZipFile(out,'w') as pack:
    for name,data in files.items():
        info=ZipInfo(name);info.compress_type=ZIP_DEFLATED;pack.writestr(info,data)
print(out.name,len(bones),'bones',sum(len(b.get('cubes',[])) for b in bones),'cubes')
