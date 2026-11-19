"""Build the native YSM pack. Coordinates are Bedrock units; front faces point north."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json, math
from io import BytesIO
from pearl_form import construct
from pearl_bake import bake
from pearl_paint import paint_atlas, SIZE as S

ROOT = Path(__file__).resolve().parents[1]
atlas, tiles = paint_atlas(ROOT / "art/models/pearl-paint.png")
bones=construct(tiles)
def wave(axis,amp,period,phase=0):
    return {str(round(i*period/4,3)):[round((amp*math.sin(phase+i*math.pi/2)) if j==axis else 0,3) for j in range(3)] for i in range(5)}
idle={'Blink':{'position':{'0':[0,0,0],'3.79':[0,0,0],'3.80':[0,0,-.18],'3.93':[0,0,-.18],'3.94':[0,0,0],'4':[0,0,0]}}}
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
curious={'CuriousEyes':{'position':[0,0,-.10]},'Head':{'rotation':[1.4,-4.5,-4]}}
attack.update({'IntentEyes':{'position':[0,0,-.13]},'Head':{'rotation':[-2,2,1.6]}})
startled={'WideEyes':{'position':[0,0,-.22]},'Head':{'rotation':[-5,0,2]}}
for s,side in [(-1,'Right'),(1,'Left')]:
    startled[side+'Wing']={'rotation':[0,s*10,-s*3]}
idle['Head']={'rotation':wave(2,1.35,4)}
animations={'format_version':'1.8.0','animations':{'idle':clip(4,idle),'gui':clip(4,{**idle,**curious}),'attacked':clip(.55,startled,False),'walk':clip(.8,walk),'run':clip(.8,walk),'swing_hand':clip(.42,attack,False),'sneak':clip(1,crouch),'sneaking':clip(.8,dict(walk,**crouch))}}
atlas,topology=bake(bones,atlas,ROOT / "art/models")

def geo(id,parts):
    return {'format_version':'1.12.0','minecraft:geometry':[{'description':{'identifier':'geometry.pearl_dragon.'+id,'texture_width':atlas.width,'texture_height':atlas.height,'visible_bounds_width':3,'visible_bounds_height':3,'visible_bounds_offset':[0,1,0]},'bones':parts}]}
arms=[{k:v for k,v in b.items() if not(k=='parent' and b['name'].endswith('Arm') and not b['name'].endswith('ForeArm'))} for b in bones if b['name'].endswith(('Arm','HandLocator'))]
player={'model':{'main':'models/main.json','arm':'models/arm.json'},'animation':{'main':'animations/main.json','arm':'animations/arm.json'},'texture':['textures/pearl.png']}
manifest={'spec':2,'metadata':{'name':'六野 · 白龙娘','tips':'Pearl Dragon / Hexwild','authors':[{'name':'Hexwild','role':'模型与贴图'},{'name':'ZipZipPipe','role':'角色设定参考'}]},'properties':{'height_scale':.88,'width_scale':.88,'preview_animation':'gui','default_texture':'pearl'},'files':{'player':player}}
manifest['hexwild']={'surface_cuts':'hexwild/surface-cuts.json'}
files={'ysm.json':manifest,'hexwild/surface-cuts.json':topology,player['model']['main']:geo('main',bones),player['model']['arm']:geo('arm',arms),player['animation']['main']:animations,player['animation']['arm']:{'format_version':'1.8.0','animations':{'swing':clip(.42,attack,False)}}}
files={k:json.dumps(v,ensure_ascii=False,separators=(',',':')).encode() for k,v in files.items()}
png=BytesIO();atlas.save(png,'PNG');files[player['texture'][0]]=png.getvalue()
out=ROOT/'public/models/pearl-dragon.zip';out.parent.mkdir(exist_ok=True)
with ZipFile(out,'w') as pack:
    for name,data in files.items():
        info=ZipInfo(name);info.compress_type=ZIP_DEFLATED;pack.writestr(info,data)
print(out.name,len(bones),'bones',sum(len(b.get('cubes',[])) for b in bones),'cubes')
