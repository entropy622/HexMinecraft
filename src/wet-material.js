// Puddle material response adapted from Photon 6e67b36 rain_puddles.glsl.
// Host world-space noise/rain rings replace noisetex. See PHOTON-NOTICE.md.
export const wetCoverageGLSL = /* glsl */ `
float wetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wetNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(wetHash(i),wetHash(i+vec2(1,0)),f.x),mix(wetHash(i+vec2(0,1)),wetHash(i+vec2(1,1)),f.x),f.y);
}
float wetPuddle(vec3 world,float upward,float exposure,float wetness){
  float basin=wetNoise(world.xz*0.28)*0.7+wetNoise(world.xz*0.81)*0.3;
  return smoothstep(0.4,0.63,basin)*clamp(wetness,0.0,1.0)*exposure*step(0.99,upward);
}
float wetCoverage(vec3 world,float upward,float exposure,float porosity,float wetness){
  return wetPuddle(world,upward,exposure,wetness)*(1.0-clamp(porosity,0.0,1.0));
}
vec3 wetRippleNormal(vec2 world,float rain,float time){
  vec2 slope=vec2(0.0),p=world*0.9,base=floor(p);
  if(rain>0.001)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 cell=base+vec2(float(x),float(y));
    float h=wetHash(cell);
    vec2 center=cell+vec2(wetHash(cell+19.0),wetHash(cell+53.0));
    vec2 d=p-center;float distance=length(d),age=fract(time*0.8+h),ring=distance-age*0.7;
    float wave=cos(ring*42.0)*exp(-abs(ring)*22.0)*(1.0-age)*(1.0-age);
    slope+=d/max(distance,0.01)*wave*0.018;
  }
  return normalize(vec3(slope.x,1.0,slope.y));
}
`;

export const wetMaterialGLSL = /* glsl */ `
void photonPuddleOptics(inout PhotonSurfaceOptics optical,float coverage){
  optical.f0=max(optical.f0,mix(optical.f0,0.02,coverage));
  optical.roughness=0.002;
  optical.ssr=max(optical.ssr,coverage);
}
float photonPuddleMaterial(float puddle,float porosity,inout vec3 albedo,inout PhotonSurfaceOptics optical){
  if(puddle<0.000001)return 0.0;
  porosity=clamp(porosity,0.0,1.0);
  albedo*=1.0-0.67*porosity*puddle;
  float coverage=puddle*(1.0-porosity);
  albedo*=1.0-0.33*coverage;
  photonPuddleOptics(optical,coverage);
  return coverage;
}
vec3 photonPuddleNormal(vec3 normal,vec3 flatNormal,vec3 ripple,float coverage,float rain,vec3 view){
  ripple.xz*=smoothstep(0.0,0.1,abs(dot(flatNormal,view)));
  normal=mix(normal,flatNormal,coverage);
  return normalize(mix(normal,normalize(ripple),coverage*rain));
}
`;
