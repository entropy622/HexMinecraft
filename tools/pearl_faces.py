"""Register the four performances to the same facial landmarks and skin surface."""
import numpy as np
from PIL import Image, ImageDraw

# Source coordinates within the four close-ups. The cut follows exposed skin,
# including the eyebrow notches, so no hair is painted onto the moving face.
# The four landmarks are the outer lashes and the two lower jaw corners.
CUTS = [
    ((0,5), [(57,76),(107,73),(107,20),(138,19),(143,99),(236,97),(238,20),(267,19),(269,69),(327,69),(326,211),(62,223)],
     [(58,75),(326,69),(62,222),(326,212)]),
    ((145,0),[(58,94),(103,85),(103,34),(132,32),(145,113),(235,101),(231,27),(259,22),(265,72),(322,69),(330,218),(73,238)],
     [(58,94),(322,69),(73,238),(330,218)]),
    ((296,5),[(57,97),(105,91),(107,33),(139,36),(143,109),(238,106),(240,31),(269,25),(270,86),(331,87),(330,213),(61,222)],
     [(57,97),(331,87),(61,222),(330,213)]),
    ((442,0),[(61,93),(110,84),(110,32),(137,31),(146,110),(240,104),(239,27),(267,22),(272,72),(330,69),(339,222),(75,243)],
     [(61,93),(330,69),(75,243),(339,222)]),
]

def portraits(path, size):
    source=Image.open(path).convert('RGB')
    v,u=np.mgrid[:size,:size]
    fx=139+(u+.5)/size*136
    fy=111+(v+.5)/size*115
    # Pink is concentrated directly below the outer lashes. The light from
    # the source is retained across the nose bridge, lower cheek and chin.
    blush=np.exp(-((abs(fx-207)-46)/16)**4-((fy-207)/12)**4)
    edge=np.clip((abs(fx-207)-42)/26,0,1)
    hairshadow=np.clip((184-fy)/32,0,1)
    base=np.array([255.,239.,231.])-blush[...,None]*[2,33,25]-edge[...,None]*[5,10,9]-hairshadow[...,None]*[7,19,21]
    out={}
    for name,(origin,poly,anchors) in zip(('face','curious','focus','startle'),CUTS):
        def coords(p):return np.array(origin)+np.array(p)/4
        mask=Image.new('L',source.size)
        ImageDraw.Draw(mask).polygon([tuple(coords(p)) for p in poly],fill=255)
        left,right,chin_l,chin_r=[coords(p) for p in anchors]
        x=np.clip((fx-155)/104,.008,.992)[...,None]
        y=np.clip((fy-169)/53,-.55,.996)[...,None]
        xy=((1-x)*left+x*right)*(1-y)+((1-x)*chin_l+x*chin_r)*y
        # Bilinear ink and alpha coverage in the original drawing's pixel grid.
        xx,yy=xy[:,:,0],xy[:,:,1]
        ix=np.floor(xx).astype(int);iy=np.floor(yy).astype(int)
        rgb=np.asarray(source,dtype=float);a=np.asarray(mask,dtype=float)/255
        paint=np.zeros_like(base);alpha=np.zeros_like(xx)
        for dx,dy in [(0,0),(1,0),(0,1),(1,1)]:
            weight=(1-abs(xx-ix-dx))*(1-abs(yy-iy-dy))*a[iy+dy,ix+dx]
            paint+=rgb[iy+dy,ix+dx]*weight[...,None];alpha+=weight
        # Stretch skin beyond the visible jaw, never stretch an outer eyelash.
        margin=np.clip((54-abs(fx-207))/2,0,1)
        result=base*(1-(alpha*margin)[...,None])+paint*margin[...,None]
        out[name]=Image.fromarray(np.uint8(np.clip(result,0,255))).convert('RGBA')
    blink=np.array(out['face'])
    for x0,x1 in [(11,51),(77,117)]:
        # Replace just the iris. Leave the original pink pixels below the lash.
        blink[63:101,x0:x1,:3]=base[63:101,x0:x1].clip(0,255).astype('uint8')
    closed=Image.fromarray(blink)
    ink=ImageDraw.Draw(closed)
    for d in [-1,1]:
        ink.line([(64+d*x,y) for x,y in [(47,77),(44,80),(33,82),(23,81),(19,78)]],
                 fill='#674454',width=3)
    out['blink']=closed
    # Carry the blush partway around the cheek. Uncovered arms sample the
    # unrouged lower jaw so the hand and face still belong to the same palette.
    neutral=np.array(out['face'])[:,:,:3]
    jaw=np.median(neutral[114:123,48:79].reshape(-1,3),axis=0)
    skin=Image.new('RGBA',(size,size),tuple(np.uint8(jaw*[.995,.965,.955]))+(255,))
    near=(base[:,0,:]+base[:,-1,:])*.5
    wrap=near[:,None,:]*(1-u[...,None]/(size-1)) + np.array(skin)[0,0,:3]*u[...,None]/(size-1)
    out['cheek']=Image.fromarray(np.uint8(np.clip(wrap,0,255))).convert('RGBA')
    return out,skin
