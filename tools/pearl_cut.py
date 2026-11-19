"""Represent a sculpted polygon as a rotated Bedrock surface and a mesh contour."""
import numpy as np
from math import atan2, asin, degrees

FLIP = np.array((1., 1., -1.))


def panel(bone, name, ring, across, normal, uv, hem):
    u = across / np.linalg.norm(across)
    n = normal / np.linalg.norm(normal)
    v = np.cross(n,u)
    basis=np.column_stack((u,v,n))
    coords=ring@basis
    lo,hi=coords.min(0),coords.max(0)
    w,h=(hi-lo)[:2]
    center=(basis@((lo+hi)/2)-n*.01)*FLIP
    ry=asin(np.clip(-basis[2,0],-1,1))
    if abs(basis[2,0]) < .999999:
        rx=atan2(basis[2,1],basis[2,2]); rz=atan2(basis[1,0],basis[0,0])
    else:
        rx=0.;rz=atan2(-basis[0,1],basis[1,1])
    boundary=[[(p[0]-lo[0])/w,(hi[1]-p[1])/h] for p in coords]
    size=np.array([w,h,.02])
    bone.setdefault('cubes',[]).append(dict(
        origin=(center-size/2).tolist(),size=size.tolist(),pivot=center.tolist(),
        rotation=[degrees(rx),-degrees(ry),-degrees(rz)],
        uv={'north':{'uv':list(uv),'uv_size':[128,128]}},
        _part=name,_cut=boundary,_depth=(coords[:,2]-(lo[2]+hi[2])/2).tolist(),_hem=hem))
