// Adapted from SixthSurge's Photon at 6e67b36 and Eric Bruneton's mapping.
// Redistribution notices: public/licenses/photon.txt and bruneton.txt.
import { Data3DTexture, HalfFloatType, LinearFilter } from 'three';
import tableUrl from './assets/photon-scattering.dat?url&inline';
import { unpackPhotonScattering } from './photon-scattering-data.js';

// Inline the pinned binary in both Vite dev and production. Creating an
// atmosphere never waits on a second fetch or publishes a placeholder table.
const table = unpackPhotonScattering(
  Uint8Array.from(atob(tableUrl.slice(tableUrl.indexOf(',') + 1)), (c) =>
    c.charCodeAt(0),
  ),
);
export function createPhotonScattering() {
  const texture = new Data3DTexture(table, 32, 64, 32);
  texture.name = 'PhotonMultipleScattering';
  texture.type = HalfFloatType;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export const photonSkyGLSL = /* glsl */ `
uniform highp sampler3D skyMultipleScatteringMap;
float photonTexel(float x, float size) { return (0.5+x*(size-1.0))/size; }
vec3 photonScatteringUv(float nu, float mu, float mus) {
  float range=sqrt(max(0.0,(1.0-mu*mu)*(1.0-mus*mus)));
  float lo=mu*mus-range, hi=mu*mus+range;
  float un=photonTexel(lo==hi ? lo : (nu-lo)/(hi-lo),16.0);
  if(mu>0.0)mu*=sqrt(sqrt(mu));
  // Same geometry as Photon, in km and using difference-of-squares products
  // to retain precision around the ground/horizon in WebGL float32.
  const float r=6371.0, inner=6370.0, outer=6481.0;
  float H=sqrt((outer-inner)*(outer+inner));
  float rho=sqrt((r-inner)*(r+inner));
  float rm=r*mu, discriminant=rm*rm-rho*rho, um;
  if(mu<0.0 && discriminant>=0.0) {
    float d=-rm-sqrt(max(0.0,discriminant));
    um=0.5-0.5*photonTexel((d-(r-inner))/(rho-(r-inner)),32.0);
  } else {
    float d=-rm+sqrt(max(0.0,rm*rm+(outer-r)*(outer+r)));
    um=0.5+0.5*photonTexel((d-(outer-r))/(rho+H-(outer-r)),32.0);
  }
  float d=-inner*mus+sqrt(inner*inner*mus*mus+H*H);
  float D=inner*0.35+sqrt(inner*inner*0.35*0.35+H*H);
  float a=(d-(outer-inner))/(H-(outer-inner));
  float A=(D-(outer-inner))/(H-(outer-inner));
  float us=photonTexel(max(0.0,1.0-a/A)/(1.0+a),32.0);
  return vec3(un,um,us);
}
float photonAreaPhase(float nu,float g,float radius) {
  float cr=cos(radius), sr=sin(radius);
  float mu=nu>cr ? 1.0 : nu*cr+sqrt(max(0.0,1.0-nu*nu))*sr;
  float gg=g*g;
  return (1.0-gg)*(1.0+mu*mu)/
    (4.0*SKY_PI*pow(max(1e-6,1.0+gg-2.0*g*mu),1.5)*(1.0+(1.0+2.0*gg)/3.0));
}
vec3 photonScattering(vec3 direction,vec3 light,bool moon) {
  float nu=clamp(dot(direction,light),-1.0,1.0);
  vec3 uv=photonScatteringUv(nu,clamp(direction.y,-1.0,1.0),clamp(light.y,-1.0,1.0));
  uv.x*=0.5;
  vec3 rayleighMultiple=textureLod(skyMultipleScatteringMap,uv,0.0).rgb;
  uv.x+=0.5;
  vec3 mie=textureLod(skyMultipleScatteringMap,uv,0.0).rgb;
  vec3 phase;
  if(moon) {
    float t=skyMoonPhase/4.0;
    t=t>1.0 ? 2.0-t : t;
    t=(1.0-t)*(1.0-t)*0.04+0.96;
    phase=1.02*vec3(photonAreaPhase(nu,0.895*t,6.0*SKY_PI/180.0),
      photonAreaPhase(nu,0.90*t,6.0*SKY_PI/180.0),photonAreaPhase(nu,0.905*t,6.0*SKY_PI/180.0));
  } else {
    phase=0.2*vec3(photonAreaPhase(nu,0.85,2.0*SKY_PI/180.0),
      photonAreaPhase(nu,0.86,2.0*SKY_PI/180.0),photonAreaPhase(nu,0.87,2.0*SKY_PI/180.0));
  }
  return rayleighMultiple+mie*phase;
}
vec3 photonSkyRadiance(vec3 direction) {
  vec3 rgb=photonScattering(direction,skySunDirection,false)*photonSunColor()+
    photonScattering(direction,-skySunDirection,true)*photonMoonColor();
  return photonTo709(photonAtmospherePost(rgb));
}
`;
