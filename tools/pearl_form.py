"""Build Pearl Dragon on the three orthographic drawings.

Coordinates are front x, height from the top of the drawing, and side x.
Sections are solid; the drawings supply fixed UVs on individual fabric,
hair, horn and membrane faces. Neither the geometry nor its UVs face the camera.
"""
import math
import numpy as np
from pearl_cut import panel

S = 17.15
CX, GROUND, SIDE = 207, 596, 129
VIEWS = {'front': (420,604), 'side': (294,604), 'back': (407,604)}

def world(p):
    x,y,z=p
    return np.array([(x-CX)/S,(GROUND-y)/S,(SIDE-z)/S])

def drawing(p,view):
    x,y,z=p
    w,h=VIEWS[view]
    return np.array([{'front':x, 'side':z, 'back':205+CX-x}[view]/w,y/h])

def construct(tiles):
    bones=[]
    def bone(name,parent=None,pivot=None):
        b={'name':name,'pivot':list(pivot or [0,0,0])}
        if parent:b['parent']=parent['name']
        bones.append(b)
        return b

    def facet(b,name,points,normal,mat,view=None,uv=None,paintbox=None):
        shape=points
        if name=='fringe':
            # A continuous plan-view arc around the skull. The same corner
            # radius at every height leaves the temple locks vertical in profile.
            shape=[(x,y,z+61*np.clip((abs(x-CX)-34)/46,0,1)**2*np.clip((160-z)/118,0,1))
                   for x,y,z in points]
        ring=np.array([world(p) for p in shape])
        across=ring[1]-ring[0]
        n=np.cross(across,ring[-1]-ring[0])
        if np.dot(n,normal)<0:n=-n
        a=np.linalg.norm(n)
        if a<1e-7:return
        panel(b,name,ring,across,n/a,tiles[mat],False)
        q=b['cubes'][-1]
        if view:
            st=np.array([drawing(p,view) for p in points])
            if paintbox:
                xl,yt,xr,yb=paintbox
                st=np.clip(st,np.array([xl,yt])/VIEWS[view],np.array([xr,yb])/VIEWS[view])
            # Pull the sampled edge inside its ink outline. Adjacent faces share geometry.
            mid=np.mean(st,axis=0)
            q['_texcoords']=(st*.963+mid*.037).tolist()
            q['_drawing']=view
        elif uv is not None:q['_texcoords']=uv
        return q

    def section(row,bevel):
        x0,x1,y,z0,z1=row
        ax=min((x1-x0)*.19,bevel)
        az=min((z1-z0)*.19,bevel)
        return [(x0+ax,y,z0),(x1-ax,y,z0),(x1,y,z0+az),(x1,y,z1-az),
                (x1-ax,y,z1),(x0+ax,y,z1),(x0,y,z1-az),(x0,y,z0+az)]

    def shell(b,name,rows,mat='pleat',views=('front','side','back'),bevel=2,boxes=None):
        rings=[section(r,bevel) for r in rows]
        for a,z in zip(rings,rings[1:]):
            center=np.mean([world(p) for p in a+z],axis=0)
            for i in range(8):
                j=(i+1)%8
                pts=[a[i],a[j],z[j],z[i]]
                direction=np.mean([world(p) for p in pts],axis=0)-center
                zone=0 if i in (0,1,7) else 2 if i in (3,4,5) else 1
                facet(b,name,pts,direction,mat,views[zone],paintbox=(boxes or {}).get(zone))
        for points,n in [(rings[0],(0,1,0)),(rings[-1],(0,-1,0))]:
            facet(b,name,points,n,mat)

    def sym(row,sign):
        a,b,y,z0,z1=row
        return (a,b,y,z0,z1) if sign==1 else (2*CX-b,2*CX-a,y,z0,z1)
    def pair(b,name,rows,sgn,**kw):
        shell(b,name,[sym(r,sgn) for r in rows],**kw)

    root=bone('Root');body=bone('AllBody',root,(0,13,0))
    torso=bone('UpperBody',body,(0,14,0))
    head=bone('Head',torso,(0,22.4,0))

    # The skin turns around the cheeks. The centre of the face below the mouth
    # has one unbroken side profile. Only its bottom edge dips at the chin.
    def cheek(b,mat,offset):
        rows=[(111,61,54),(155,67,50),(179,68,48.2),(195,65,47.6),
              (206,61,47.6),(216,56,47.6),(225,49,47.6)]
        stations=(-1,-.87,-.67,-.39,0,.39,.67,.87,1)
        def point(row,t):
            y,r,z=row
            lift=max(0,(y-198)/27)*6.0*abs(t)**1.8
            return (CX+t*r,y-lift,z+20*abs(t)**3.2+offset)
        for hi,lo in zip(rows,rows[1:]):
            for u,v in zip(stations,stations[1:]):
                seg=[(hi,u),(hi,v),(lo,v),(lo,u)]
                facet(b,'expression' if offset else 'head',[point(r,t) for r,t in seg],
                      (0,0,1),mat,uv=[((point(r,t)[0]-139)/136,(point(r,t)[1]-111)/115) for r,t in seg])
        if not offset:
            for sign in (-1,1):
                for hi,lo in zip(rows,rows[1:]):
                    p0,p1=point(hi,sign),point(lo,sign)
                    facet(b,'cheek return',[p0,(p0[0],p0[1],154),(p1[0],p1[1],154),p1],
                          (sign,0,0),'cheek',uv=[(0,(p0[1]-111)/115),(1,(p0[1]-111)/115),
                                                   (1,(p1[1]-111)/115),(0,(p1[1]-111)/115)])
        if not offset:
            for u,v in zip(stations,stations[1:]):
                a,c=point(rows[-1],u),point(rows[-1],v)
                facet(b,'underside',[a,c,(c[0],c[1],151),(a[0],a[1],151)],(0,-1,0),'skin')
    cheek(head,'face',0)
    for name,mat in [('Blink','blink'),('CuriousEyes','curious'),('IntentEyes','focus'),('WideEyes','startle')]:
        cheek(bone(name,head,(0,25.66,-3.09)),mat,.85)
    shell(head,'skin core',[(151,263,125,77,178),(158,256,215,77,171)],'skin',(None,None,None),4)

    # The short cap meets a stepped bob cut to the *side* drawing. The ear
    # interrupts the outer layer. Behind it a thin underlock falls to the wing.
    # Extra stations across the forehead are important: a lone corner-to-
    # corner face would pull the whole forehead back at the pin's chamfer.
    crown=[]
    for y,w,front,back in [(84,68,61,205),(99,75,54,211),(118,79,48,215),(137,74,49,209)]:
        curve=[(0,0),(.56,0),(.81,.035),(.94,.14),(1,.36),(1,.82),(.95,.96),(.72,1),(0,1)]
        ring=curve+[(-x,z) for x,z in reversed(curve[1:-1])]
        crown.append([(CX+x*w,y,front+z*(back-front)) for x,z in ring])
    for a,b in zip(crown,crown[1:]):
        for k in range(len(a)):
            j=(k+1)%len(a);pts=[a[k],a[j],b[j],b[k]]
            n=np.mean([world(p) for p in pts],axis=0)-world((CX,pts[0][1],137))
            n[1]=0
            facet(head,'crown',pts,n,'bob pearl' if abs(n[0])<abs(n[2]) else 'bob moon')
    # Split the broad caps down the middle to keep the native face polygons convex.
    for ring,n in [(crown[0],(0,1,0)),(crown[-1],(0,-1,0))]:
        facet(head,'crown',ring[:9],n,'bob pearl')
        facet(head,'crown',[ring[0],*ring[:7:-1]],n,'bob pearl')
    for x0,x1,y0,y1,zf in [(146,180,102,169,40),(175,193,102,151,44),
                              (187,226,103,180,36),(222,241,104,152,44),(236,266,101,169,40)]:
        shell(head,'fringe',[(x0+1,x1-1,y0,zf+5,82),(x0,x1,y0+13,zf,83),
                            (x0,x1,y1,zf,82)],'snow',('front',None,None),1.25)

    def lockform(owner,name,sgn,rows,mat):
        # Each section follows the skull round from the face toward the ear.
        # The convex outside is one broad face; the back edge has its own return.
        rings=[]
        for y,near,far,fore,aft,thick in rows:
            dz=far-near
            steps=[(0,thick*.77),(.07,thick),(.93,thick),(1,thick*.76),
                   (1,thick*.17),(.91,0),(.09,0),(0,thick*.15)]
            rings.append([(CX+sgn*(fore+t*(aft-fore)-d-CX),y,near+t*dz) for t,d in steps])
        low,high=rows[0][0],rows[-1][0]
        for a,c in zip(rings,rings[1:]):
            center=np.mean([world(p) for p in a+c],axis=0)
            for i in range(8):
                j=(i+1)%8
                pts=[a[i],a[j],c[j],c[i]]
                n=np.mean([world(p) for p in pts],axis=0)-center
                m=mat if i in (5,7) else 'bob moon' if i in (4,6) else 'bob shade'
                y0=(a[i][1]-low)/(high-low);y1=(c[i][1]-low)/(high-low)
                facet(owner,name,pts,n,m,uv=[(.04,y0),(.96,y0),(.96,y1),(.04,y1)])
        facet(owner,name,rings[0],(0,1,0),mat)
        facet(owner,name,rings[-1],(0,-1,0),'hairshade')

    for sign,side in [(-1,'Right'),(1,'Left')]:
        lockform(head,'temple',sign,[(121,62,84,277,281,19),(139,62,83,278,282,20),
                                     (204,62,80,278,282,20)],'bob pearl')
        lockform(head,'temple',sign,[(107,72,108,276,287,16),(126,68,108,279,290,17),
                                     (201,69,99,279,288,18)],'bob pearl')
        lockform(head,'temple',sign,[(118,96,132,284,292,15),(141,94,130,286,293,16),
                                     (223,95,128,285,291,16)],'bob moon')
        lockform(head,'temple',sign,[(116,128,173,282,289,15),(145,127,174,284,292,17),
                                     (219,128,167,283,291,17)],'bob shade')
        lockform(head,'temple',sign,[(115,157,202,283,285,19),(134,156,205,288,287,19),
                                     (211,159,205,289,284,19)],'bob moon')
        pair(head,'ear',[(288,308,169,127,159),(287,308,189,127,159)],sign,mat='skin',views=('front','side','back'),bevel=1)
        lock=bone(side+'Lock',head,(sign*3.55,22.9,-1.25))
        lockform(lock,'shoulder lock',sign,[(202,83,103,280,279,21),(224,86,106,280,280,22),
                  (245,93,107,275,271,19),(281,95,108,276,270,20)],'bob pearl')
        lockform(lock,'nape ribbon',sign,[(205,149,184,277,278,17),(238,149,177,279,280,18),
                  (251,153,176,277,280,16),(345,153,170,274,277,15)],'bob moon')
        # Square horn segments have distinct ledges and a turn in profile.
        for lower,upper in zip([(242,279,104,109,150),(242,271,83,111,147),(243,267,64,117,151),
                                (242,263,48,124,153),(245,265,30,132,161)],
                               [(245,275,80,114,150),(241,267,62,120,153),(241,263,46,126,156),
                                (242,265,27,133,160),(253,270,10,139,167)]):
            pair(head,'horn',[upper,lower],sign,mat='horn',views=('front',None,'back'),bevel=1.7)
        pair(head,'inner bob',[(227,260,205,73,122),(228,257,246,76,124)],
             sign,mat='fold',views=('front',None,None),bevel=1)
    # The back has a blunt fan cut: centre and second course overlap on two
    # depth planes, with clear dark undersides instead of strands painted on a dome.
    shell(head,'back cap',[(130,285,103,130,207),(122,291,122,130,224),
                          (124,289,211,131,226)],'bob shade',(None,None,'back'),2)
    for i,(l,r,base,zend) in enumerate([(123,150,218,216),(142,169,272,211),(159,187,216,228),
            (181,221,226,231),(220,249,281,219),(245,273,218,225),(270,293,216,210)]):
        shell(head,'back fringe',[(l,r,123,182,zend-4),(l,r,145,181,zend),(l,r,base,177,zend)],'bob shade',(None,None,'back'),1)
    for i,(l,r,y1,z1) in enumerate([(132,156,368,188),(153,177,403,170),(165,192,357,199),
             (185,221,381,205),(222,247,368,197),(247,270,402,168),(264,286,331,189)]):
        shell(head,'back fall',[(l,r,196,150,z1),(l,r,282,150,z1+1),(l,r,y1,148,z1)],'hairshade',
              (None,'side','back'),1.1)

    shell(torso,'neck',[(193,222,216,91,131),(190,225,248,92,134)],'skin',(None,None,None))
    shell(torso,'collar',[(185,231,228,85,136),(182,234,244,83,138)],'ice',('front',None,None))
    shell(torso,'fitted bodice',[(179,236,236,86,142),(169,245,266,65,144),(172,241,299,73,143),
                                (176,237,338,79,142),(174,240,348,78,145)],'lilac',('front',None,None),4.2)
    shell(body,'sash',[(170,244,341,75,147),(170,244,366,74,149)],'belt',('front',None,None),2.3)

    skirt=bone('Skirt',body,(0,14.5,0))
    # Full rear shell and a darker interior form the depth seen in profile.
    shell(skirt,'rear train',[(165,249,358,129,148),(133,280,448,129,168),
          (92,320,545,126,190),(65,348,593,124,201)],'lin',(None,'side','back'),4)
    for sign,side in [(-1,'Right'),(1,'Left')]:
        arm=bone(side+'Arm',torso,(sign*2.56,20.98,0))
        fore=bone(side+'ForeArm',arm,(sign*3.3,18.06,0))
        pair(arm,'bare shoulder',[(242,272,245,91,134),(244,276,283,90,135),(246,275,298,91,133)],sign,mat='skin',views=('front','side',None),bevel=2)
        pair(fore,'bell sleeve',[(252,286,278,87,134),(247,290,296,84,137),(267,318,349,79,147),
                                 (274,331,374,74,152),(275,329,386,75,152)],sign,mat='lilac',bevel=3)
        pair(fore,'hand',[(284,316,380,88,140),(298,327,399,93,137),(297,319,406,94,137)],sign,mat='skin',views=(None,None,None),bevel=2)
        bone(side+'HandLocator',fore,(sign*5.8,11.7,-.55))
        leg=bone(side+'Leg',body,(sign*1.43,13.8,0));shin=bone(side+'LowerLeg',leg,(sign*1.43,6.6,0))
        pair(leg,'leg',[(218,251,361,96,129),(216,252,472,96,130)],sign,mat='skin',views=(None,None,None),bevel=2)
        pair(shin,'shin',[(217,251,470,96,131),(216,249,558,96,131)],sign,mat='skin',views=(None,None,None),bevel=2)
        for name,rows,mat in [('strap',[(215,251,537,94,132),(216,250,551,94,132)],'hem'),
                 ('shoe',[(216,250,556,91,132),(213,252,573,78,136),(211,252,594,77,136)],'shoe'),
                 ('sole',[(211,252,585,77,136),(211,252,596,76,136)],'fold')]:
            pair(shin,name,rows,sign,mat=mat,views=(None,None,None),bevel=1)
        layer=bone(side+'Skirt',skirt,(sign*1.8,14.3,-1.3))
        pair(layer,'under pleat',[(237,256,366,94,148),(269,297,452,88,168),
                  (290,326,534,77,179),(306,351,594,66,198)],sign,mat='fold',bevel=3)
        # Two broad side tiers hang in front of the train and step out at the tips.
        for rows in [[(244,267,371,84,149),(263,294,422,74,158),(265,319,465,63,171)],
                     [(257,278,448,84,154),(267,308,486,73,167),(272,338,524,63,173)]]:
            pair(layer,'side tier',rows,sign,mat='pleat',bevel=2.5)
        # Asymmetric front opening outlines one stocking and shoe.
        lapel=([(192,239,360,70,102),(196,247,453,53,93),(201,267,592,24,80)]
               if sign==1 else [(159,183,360,71,98),(138,173,453,54,89),(107,153,592,25,78)])
        shell(layer,'front lapel',lapel,'lapel',('front','side',None),2.5)
        pair(body,'pendant ribbon',[(238,251,362,69,79),(239,253,385,63,74),
                (239,259,421,53,69)],sign,mat='ice',views=('front','side',None),bevel=2)
    def medal(b,x,y,z,w,h):
        # Five-lobed rim, with a textured raised face over the violet backing.
        for i in range(5):
            a=i*2*math.pi/5-.3
            mx=x+math.sin(a)*w*.255;my=y+math.cos(a)*h*.255
            rw=w*.215;rh=h*.20
            shell(b,'clasp rim',[(mx-rw*.75,mx+rw*.75,my-rh,z+1,z+6),
                   (mx-rw,mx+rw,my,z,z+7),(mx-rw*.72,mx+rw*.72,my+rh,z+1,z+6)],
                  'rib',(None,None,None),1.7)
        pts=[(x-w/2,y-h/2,z-.9),(x+w/2,y-h/2,z-.9),(x+w/2,y+h/2,z-.9),(x-w/2,y+h/2,z-.9)]
        facet(b,'knot',pts,(0,0,1),'knot',uv=[[0,0],[1,0],[1,1],[0,1]])
    pin=bone('TempleClasp',head,(world((296,126,92))*np.array([1,1,-1])).tolist())
    pin['rotation']=[0,-44,0]
    medal(pin,296,126,92,47,44)
    for sig in (-1,1):medal(body,CX+sig*35.5,352,65,42,43)

    # The wing is a ribbed relief. The gores follow the drawing's straight
    # flights and square notches, with real fingers and narrow tip thickness.
    for sign,side in [(-1,'Right'),(1,'Left')]:
        wing=bone(side+'Wing',torso,(sign*2.65,20.6,2.2))
        def P(x,y,z):return (x if sign==1 else 2*CX-x,y,z)
        # A shared section on each side of a notch avoids overlapping fans.
        # The centre row bows behind the leading edge like a stretched membrane.
        stations=[(280,237,312,154),(294,225,312,163),(301,221,312,169),
                  (301,221,328,169),(311,214,328,175),(311,214,322,175),
                  (319,212,322,182),(327,215,322,185),(327,215,343,185),
                  (342,225,343,192),(342,225,329,192),(355,238,329,201),
                  (355,238,344,201),(374,258,344,217),(374,258,352,217),
                  (389,274,352,233),(389,274,366,233),(403,287,366,250)]
        def rows(st,back):
            x,t,v,z=st
            width=(x-280)/123
            return [P(x,t,z+back),P(x,t*.43+v*.57,z+back+8-3*width),
                    P(x,v,z+back+5)]
        for a,c in zip(stations,stations[1:]):
            if a[0]==c[0]:
                pa,pc=rows(a,0)[-1],rows(c,0)[-1]
                qa,qc=rows(a,5)[-1],rows(c,5)[-1]
                facet(wing,'wing edge',[pa,pc,qc,qa],(sign*(1 if c[2]<a[2] else -1),0,0),'rib')
                continue
            for back in (0,5):
                left,right=rows(a,back),rows(c,back)
                for j in (0,1):
                    pts=[left[j],right[j],right[j+1],left[j+1]]
                    facet(wing,'wing web',pts,(0,0,-1 if back else 1),'gore','back' if back else 'front')
            for j,n in [(0,(0,1,0)),(-1,(0,-1,0))]:
                facet(wing,'wing edge',[rows(a,0)[j],rows(c,0)[j],rows(c,5)[j],rows(a,5)[j]],n,'rib')
        for idx in (0,-1):
            p0,p1=rows(stations[idx],0),rows(stations[idx],5)
            for j in (0,1):
                facet(wing,'wing edge',[p0[j],p1[j],p1[j+1],p0[j+1]],
                      (sign*(1 if idx==-1 else -1),0,0),'rib')
        for x,top,width,bottom,z,zb in [(319,210,18,226,182,182),(397,287,14,367,250,253)]:
            pair(wing,'finger',[(x-width/2,x+width/2,top,z-2,z+7),
                    (x-width/2+1,x+width/2+1,bottom,zb-2,zb+7)],sign,mat='rib',views=('front',None,'back'),bevel=1)
    # Rear and side projections locate the same tail centreline. Each segment
    # meets its neighbour at an octagonal section perpendicular to the curve.
    rear=[(201,371,151,61),(199,396,166,69),(202,422,187,66),(214,449,208,61),
          (231,477,224,56),(239,505,231,51),(234,530,226,47),(219,547,213,42),
          (197,558,195,35),(169,564,174,26),(151,566,155,17)]
    parent=body
    centers=[world((CX+205-u,y,z)) for u,y,z,w in rear]
    def back_to_pixels(x):return (CX+x[0]*S,GROUND-x[1]*S,SIDE-x[2]*S)
    sections=[]; frames=[]
    for i,center in enumerate(centers):
        axis=centers[min(i+1,len(centers)-1)]-centers[max(0,i-1)]
        axis/=np.linalg.norm(axis)
        tangent=np.cross(axis,np.array([0.,0.,1.]));tangent/=np.linalg.norm(tangent)
        radial=np.cross(axis,tangent);r=rear[i][3]/(2*S)
        frames.append((tangent,radial,r))
        sections.append([center+.90*r*(tangent*math.cos((k+.5)*math.pi/4)+radial*math.sin((k+.5)*math.pi/4)) for k in range(8)])
    for i,(a,c) in enumerate(zip(centers,centers[1:])):
        b=bone('Tail'+str(i),parent,(a*np.array([1,1,-1])).tolist());parent=b
        axis=c-a;axis/=np.linalg.norm(axis)
        rings=sections[i:i+2]
        for k in range(8):
            j=(k+1)%8;pts=[rings[0][k],rings[0][j],rings[1][j],rings[1][k]]
            n=np.mean(pts,axis=0)-(a+c)/2
            facet(b,'tail core',[back_to_pixels(p) for p in pts],n,'tail')
        # A lower row emerges from under the lip of the preceding row.
        # The skin tube is continuous under the independent, articulated scales.
        count=6 if i<6 else 5 if i<8 else 4
        ta,ra,r0=frames[i];tb,rb,r1=frames[i+1]
        def surface(t,phi,relief):
            v=(1-t)*(ta*math.cos(phi)+ra*math.sin(phi))+t*(tb*math.cos(phi)+rb*math.sin(phi))
            return a+(c-a)*t+v/np.linalg.norm(v)*((1-t)*r0+t*r1)*relief
        for k in range(count):
            angle=2*math.pi*(k+.23*(i%2))/count
            arc=2*math.pi/count
            end=1.0 if i==len(centers)-2 else 1.11
            boundary=[(-.32,-.13,.90),(.31,-.13,.90),(.49,.06,.91),(.49,.74,1.00),
                      (.31,end,1.037),(-.29,end+.015,1.038),(-.49,.82,1.003),(-.49,.06,.91)]
            outer=[surface(t,angle+s*arc,h) for s,t,h in boundary]
            top=[surface(t,angle+s*arc,h) for s,t,h in
                 [(-.31,.19,1.099),(.30,.19,1.099),(.32,.78,1.063),(-.30,.82,1.066)]]
            n=np.mean(top,axis=0)-(a+c)/2
            lit=n/np.linalg.norm(n)
            family=(2 if (i+k)%3 else 1) if lit[2]<-.25 else (1 if (i+2*k)%4 else 0)
            if lit[2]<-.58 and (i+k)%3!=0:family=3
            tone=((i*3+k*5)%7)*.018
            def paint(pts,base=tone,swatch=family):
                left,right=(swatch+.1)/4,(swatch+.9)/4
                uv=[(left,.08+base),(right,.08+base),(right,.65+base),(left,.65+base)]
                facet(b,'plate',list(map(back_to_pixels,pts)),n,'scute',uv=uv[:len(pts)])
            paint(top)
            # Each shield has one broad table and four turned edges. The lip
            # is thickest at its free end; it overlaps the following shield.
            for j,(l,r) in enumerate([(0,1),(2,3),(4,5),(6,7)]):
                t=(j+1)%4
                paint([outer[l],outer[r],top[t],top[j]],0 if j==0 else min(tone+.08,.44),
                      min(family+1,3) if j==0 else family)
                paint([outer[r],outer[(r+1)%8],top[t]])
            for j in (2,3,4,5,6):
                nxt=(j+1)%8
                s0,t0,h0=boundary[j];s1,t1,h1=boundary[nxt]
                pts=[outer[j],surface(t0,angle+s0*arc,h0-.09),surface(t1,angle+s1*arc,h1-.09),outer[nxt]]
                facet(b,'scale lip',list(map(back_to_pixels,pts)),np.mean(pts,axis=0)-np.mean(top,axis=0),'tail')
        # Endcaps stay inside the joint as the curved tail sways.
        for ring,n in [(rings[0],-axis),(rings[1],axis)]:
            facet(b,'tail cap',[back_to_pixels(p) for p in ring],n,'tail')
    return bones
