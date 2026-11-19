"""Unwrap each painted face and bake short-range, pose-local contact shadows.

The light only samples near neighbours, so moving limbs retain their own lighting.
UV edges are extruded for bilinear filtering. Geometry stays native Bedrock cubes.
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Face axes in the renderer's +Z-forward frame (columns and rows of the paint).
BASIS = {
    "north": ((0,0,1),(1,0,0),(0,-1,0)), "south": ((0,0,-1),(-1,0,0),(0,-1,0)),
    "west": ((1,0,0),(0,0,-1),(0,-1,0)), "east": ((-1,0,0),(0,0,1),(0,-1,0)),
    "up": ((0,1,0),(1,0,0),(0,0,1)), "down": ((0,-1,0),(1,0,0),(0,0,-1))
}
FLIP = np.array([1,1,-1])


def rotation(r):
    a,b,c=np.radians(np.asarray(r)*[1,-1,-1])
    x,y,z=np.cos([a,b,c]); u,v,w=np.sin([a,b,c])
    return np.array([[z*y,z*v*u-w*x,z*v*x+w*u],
                     [w*y,w*v*u+z*x,w*v*x-z*u],[-v,y*u,y*x]])


def bind_cubes(bones):
    transforms={}
    pieces=[]
    for bone in bones:
        parent,offset=transforms.get(bone.get("parent"),(np.eye(3),np.zeros(3)))
        p=np.asarray(bone["pivot"])*FLIP
        m=parent@rotation(bone.get("rotation",(0,0,0)))
        delta=offset+(parent-m)@p
        transforms[bone["name"]]=m,delta
        for cube in bone.get("cubes",[]):
            size=np.array(cube["size"])
            center=(np.array(cube["origin"])+size/2)*FLIP
            pivot=np.array(cube.get("pivot",[0,0,0]))*FLIP
            rot=rotation(cube.get("rotation",[0,0,0]))
            pieces.append((cube, m@(pivot+rot@(center-pivot))+delta, m@rot,size))
    return pieces


def bake(bones, source, art):
    pieces=bind_cubes(bones)
    step=.125
    origin=np.floor(np.min([p-abs(r)@d/2 for _,p,r,d in pieces],axis=0))-3
    high=np.ceil(np.max([p+abs(r)@d/2 for _,p,r,d in pieces],axis=0))+3
    occupancy=np.zeros(np.ceil((high-origin)/step).astype(int),np.int16)
    groups={}
    ids=[]
    for i,(cube,center,rot,size) in enumerate(pieces,1):
        group=cube.pop('_occlusion_group',i)
        ids.append(groups.setdefault(group,i))
        cut=cube.get('_cut')
        if cube['_part']=='expression' or (not cut and (len(cube["uv"])<6 or min(size)<.2)):continue
        extent=size.copy()
        if cut:extent[2]=step*1.5
        half=abs(rot)@(extent/2)
        lo=np.floor((center-half-origin)/step).astype(int)
        hi=np.ceil((center+half-origin)/step).astype(int)
        xyz=np.stack(np.meshgrid(*[np.arange(l,h) for l,h in zip(lo,hi)],indexing="ij"),axis=-1)
        pts=(origin+(xyz+.5)*step-center)@rot
        sub=occupancy[tuple(slice(l,h) for l,h in zip(lo,hi))]
        inside=np.all(abs(pts)<=extent/2,axis=-1)
        if cut:
            # A curved tress or sail occludes its neighbours only inside the
            # polygon, never across its rectangular UV bounding box.
            xx=pts[...,0]/size[0]+.5; yy=.5-pts[...,1]/size[1]
            odd=np.zeros_like(inside)
            for (ax,ay),(bx,by) in zip(cut,cut[1:]+cut[:1]):
                if abs(by-ay)>1e-12:
                    odd ^= ((ay>yy)!=(by>yy)) & (xx<(bx-ax)*(yy-ay)/(by-ay)+ax)
            inside &= odd
        sub[inside]=ids[-1]
    rays=[]
    for j in range(16):
        z=math.sqrt((j+.5)/16)
        a=j*2.39996323
        rays.append((math.sqrt(1-z*z)*math.cos(a),math.sqrt(1-z*z)*math.sin(a),z))
    source=np.asarray(source)
    drawings={}
    for view in ('front','side','back'):
        image=Image.open(art/('pearl-target-'+view+'.png')).convert('RGBA')
        data=np.array(image)
        rgb=data[:,:,:3].astype(float)
        valid=(rgb.min(axis=2)<241)|(np.ptp(rgb,axis=2)>12)
        # Extend the colour under the source outline by two texels so filtering
        # never bakes the white paper fringe into a horn or wing tip.
        for _ in range(2):
            neighbours=sum(np.roll(valid.astype(int),(dy,dx),(0,1)) for dy,dx in [(-1,0),(1,0),(0,-1),(0,1)])
            colors=sum(np.roll(rgb*valid[...,None],(dy,dx),(0,1)) for dy,dx in [(-1,0),(1,0),(0,-1),(0,1)])
            expand=(~valid)&(neighbours>0)
            rgb[expand]=colors[expand]/neighbours[expand,None];valid|=expand
        data[:,:,:3]=rgb.astype('uint8');data[:,:,3]=valid*255
        drawings[view]=data
    wing_paint={}
    for view in ('front','back'):
        src=drawings[view]
        im=src.copy(); h,w=im.shape[:2]
        for x in range(w):
            rgb=src[:,x,:3].astype(float)
            candidate=(rgb[:,2]-rgb[:,1]>12)&(rgb[:,1]<208)&(src[:,x,3]>0)
            candidate[:round(h*.329)]=False;candidate[round(h*.615):]=False
            yy=np.flatnonzero(candidate)
            if len(yy)<6:
                im[:,x]=(153,118,176,255)
                continue
            # Sample the nearest interior pigment in this same vertical gore.
            # Do not project the sheet's white paper onto the physical step.
            yy=yy[2:-2]
            at=np.arange(h)
            r=np.searchsorted(yy,at).clip(0,len(yy)-1);l=(r-1).clip(0)
            indices=np.where(abs(yy[r]-at)<abs(yy[l]-at),yy[r],yy[l])
            im[:,x]=src[indices,x];im[:,x,3]=255
        wing_paint[view]=im
    # Vertex normals on the cheek are shared across adjoining panels. Keep edges
    # hard elsewhere: hair, cuffs, horns and ribs should still read as cut shapes.
    normals={}
    for cube,center,rot,size in pieces:
        if cube['_part'] not in ('head','expression') or not cube.get('_cut'):continue
        for (u,v),z in zip(cube['_cut'],cube['_depth']):
            pt=center+rot@np.array([(u-.5)*size[0],(.5-v)*size[1],size[2]/2+z])
            key=tuple(pt.round(3));normals[key]=normals.get(key,np.zeros(3))+rot[:,2]
    topology={}
    patches=[]
    for i,(cube,center,rot,size) in enumerate(pieces,1):
        part=cube.pop('_part');cut=cube.pop('_cut',None);hem=cube.pop('_hem',False);coords=cube.pop('_texcoords',None);depth=cube.pop('_depth',None)
        drawing=cube.pop('_drawing',None)
        for face,uv in cube["uv"].items():
            n,u,v=np.array(BASIS[face],dtype=float)
            width,height=abs(u)@size,abs(v)@size
            px=17 if drawing or part in ('head','expression','knot') else 9
            w,h=np.maximum(4,np.minimum(160,np.ceil([width*px,height*px]))).astype(int)
            fx,fy=np.meshgrid((np.arange(w)+.5)/w,(np.arange(h)+.5)/h)
            rect=np.array(uv['uv']); span=np.array(uv['uv_size'])
            pu,pv=fx.copy(),fy.copy()
            if coords:
                # Reproject continuous UVs through the planar cut. The ink line
                # across an eyelid meets its neighbour even on a curved cheek.
                xy=np.array(cut);st=np.array(coords)
                first=True
                for j in range(1,len(cut)-1):
                    a,b=xy[j]-xy[0],xy[j+1]-xy[0]
                    area=a[0]*b[1]-a[1]*b[0]
                    if abs(area)<1e-9:continue
                    ex=fx-xy[0,0];ey=fy-xy[0,1]
                    l=(ex*b[1]-ey*b[0])/area;m=(ey*a[0]-ex*a[1])/area
                    mask=np.ones_like(l,dtype=bool) if first else (l>=-.03)&(m>=-.03)&(l+m<=1.03)
                    first=False
                    for k,axis in enumerate([pu,pv]):
                        axis[mask]=(st[0,k]+l*(st[j,k]-st[0,k])+m*(st[j+1,k]-st[0,k]))[mask]
                pu=np.clip(pu,0,.9999);pv=np.clip(pv,0,.9999)
            tx=np.clip((rect[0]+pu*span[0]).astype(int),0,source.shape[1]-1)
            ty=np.clip((rect[1]+pv*span[1]).astype(int),0,source.shape[0]-1)
            tex=source[ty,tx].copy()
            if drawing:
                im=drawings[drawing];dw,dh=im.shape[1],im.shape[0]
                sx=pu.copy()
                if part in ("fringe","temple","crown","back cap","back fringe"):
                    if drawing=="front":
                        area=(sx>253/420)&(sx<309/420)&(pv>94/604)&(pv<162/604)
                        sx[area]=414/420-sx[area]
                    elif drawing=="side":
                        area=(sx>87/294)&(sx<148/294)&(pv>96/604)&(pv<155/604)
                        sx[area]=np.minimum(.74,sx[area]+.217)
                sy=pv.copy()
                if drawing=='side' and part in ('temple','back fringe','back fall','back cap'):
                    # The ear is a separate mesh. Continue the underlying lock
                    # through the ear's painted footprint as the head turns.
                    ear=(sx>122/294)&(sx<166/294)&(sy>160/604)&(sy<194/604)
                    sy[ear]=155/604
                photo=im[np.clip((sy*dh).astype(int),0,dh-1),np.clip((sx*dw).astype(int),0,dw-1)]
                if part in ('wing web','finger') and drawing in wing_paint:
                    pigment=wing_paint[drawing]
                    photo=pigment[np.clip((pv*dh).astype(int),0,dh-1),np.clip((sx*dw).astype(int),0,dw-1)]
                tex=np.where(photo[:,:,3:4]>0,photo,tex)
            if cut:
                mask=Image.new('L',(w,h))
                ImageDraw.Draw(mask).polygon([(round(s*w-.5),round(t*h-.5)) for s,t in cut],fill=255)
                tex[:,:,3]=np.minimum(tex[:,:,3],np.asarray(mask.filter(ImageFilter.MaxFilter(3))))
                if hem:
                    # A single selvedge follows the cut, not a stack of stripes.
                    band=(fy>.93) & (fy<.965)
                    tex[band,:3]=tex[band,:3]*[.79,.735,.85]
                    edge=fy>=.965
                    tex[edge,:3]=tex[edge,:3]*.65+np.array([238,224,239])*.35
            positions=(center+((abs(n)@size)*.5*n+(fx[...,None]-.5)*width*u+
                               (fy[...,None]-.5)*height*v)@rot.T)
            n,u,v=rot@n,rot@u,rot@v
            occlusion=np.zeros((h,w))
            for a,b,c in rays:
                direction=u*a+v*b+n*c
                hit=np.zeros((h,w))
                for t,weight in ((.28,1),(.62,.91),(1.12,.76),(1.75,.59),(2.5,.36)):
                    q=np.floor((positions+n*.15+direction*t-origin)/step).astype(int)
                    cell=occupancy[tuple(q.transpose(2,0,1))]
                    hit=np.maximum(hit,((cell!=0)&(cell!=ids[i-1]))*weight)
                occlusion+=hit
            ao=np.asarray(Image.fromarray((occlusion*255/len(rays)).astype('uint8'))
                          .filter(ImageFilter.GaussianBlur(max(.8,px*.09))))/255.
            # Broad violet bounce in the undercuts; a narrow turned edge on wool/silk.
            # Round the value slightly so each cluster remains crisp at game scale.
            tint=np.array([.48,.58,.40])
            if part in ('expression','head'):tint*=.26
            if drawing:tint*=.22
            elif part in ('crown','temple','shoulder lock','nape ribbon'):tint*=.34
            shade=1-ao[...,None]*tint
            shade*= .97 + .035*n[1]
            edge=np.minimum.reduce([fx*width,(1-fx)*width,fy*height,(1-fy)*height])
            if not drawing and part not in ('expression','head','knot','sail','hand','leg','shin','crown','temple','shoulder lock','nape ribbon'):
                shade+=np.maximum(0,1-edge/.13)[...,None]*.046
            tex[:,:,:3]=np.clip(tex[:,:,:3]*shade,0,255).astype('uint8')
            vertices=None
            if cut:
                vertices=[]
                for (su,sv),z in zip(cut,depth):
                    vertex=[round(float(l),6) for l in [su,sv,z]]
                    if part in ('head','expression'):
                        pt=center+rot@np.array([(su-.5)*size[0],(.5-sv)*size[1],size[2]/2+z])
                        smooth=normals[tuple(pt.round(3))]
                        vertex.extend(np.round(rot.T@(smooth/np.linalg.norm(smooth)),6).tolist())
                    vertices.append(vertex)
            patches.append((uv,tex,vertices))
    # Height-sorted shelves with two gutter pixels around every island.
    patches.sort(key=lambda p:-p[1].shape[0]);x=y=line=0;positions=[]
    for _,tile,_vertices in patches:
        h,w=tile.shape[:2]
        if x+w+4>1024:x=0;y+=line;line=0
        positions.append((x,y));x+=w+4;line=max(line,h+4)
    out=Image.new("RGBA",(1024,2**math.ceil(math.log2(y+line))))
    for ((uv,tile,vertices),(x,y)) in zip(patches,positions):
        out.paste(Image.fromarray(np.pad(tile,((2,2),(2,2),(0,0)),mode='edge')),(x,y))
        uv.update(uv=[x+2,y+2],uv_size=[tile.shape[1],tile.shape[0]])
        if vertices:topology[f"{x+2},{y+2}"]=vertices
    return out,topology
