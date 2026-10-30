// Photon 6e67b36 program/final.fsh, adapted from AMD FidelityFX CAS.
// Keep Photon's shaping, intensity mapping and pre-division clamp order.
// Notices: public/licenses/PHOTON-NOTICE.md and fidelityfx-cas.txt.
export const photonCasGLSL = /* glsl */ `
vec3 photonCas(vec3 t[9],float intensity){
  vec3 lo=min(t[3],min(t[4],min(t[5],min(t[1],t[7]))));
  lo+=min(lo,min(t[0],min(t[2],min(t[6],t[8]))));
  vec3 hi=max(t[3],max(t[4],max(t[5],max(t[1],t[7]))));
  hi+=max(hi,max(t[0],max(t[2],max(t[6],t[8]))));
  // A black channel has no signal to sharpen. Avoid the source's undefined
  // 0/0 there, without changing the denominator of any positive channel.
  vec3 denominator=mix(vec3(1.0),hi,greaterThan(hi,vec3(0.0)));
  vec3 w=clamp(min(lo,2.0-hi)/denominator,0.0,1.0);
  w=1.0-(1.0-w)*(1.0-w);
  w*=-1.0/mix(8.0,5.0,intensity*2.0-1.0);
  return clamp((t[1]+t[3]+t[5]+t[7])*w+t[4],0.0,1.0)/(1.0+4.0*w);
}
`;
