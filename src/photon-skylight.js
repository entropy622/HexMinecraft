// Photon 6e67b36: d4a_generate_sky_sh.csh, random/sampling and SH utilities.
// Adaptation to Three's coefficient order and standard real-SH evaluation.
// See public/licenses/PHOTON-NOTICE.md.
export const photonSkylightGLSL = /* glsl */ `
vec3 photonSkySample(int index){
  const float plastic=1.3247179572;
  const vec2 alpha=1.0/vec2(plastic,plastic*plastic);
  vec2 h=fract(vec2(0.5)+float(index)*alpha);
  float azimuth=h.x*6.28318530718,z=h.y*2.0-1.0;
  vec3 d=vec3(vec2(sin(azimuth),cos(azimuth))*sqrt(max(0.0,1.0-z*z)),z);
  return d.y<0.0?-d:d;
}
float photonSkyBasis(int index,vec3 d){
  // Source x/z/y order becomes Three's y/z/x. Source's final two basis
  // functions have 1/sqrt(2) of the standard normalization. Both projection
  // and evaluation use that factor, so the equivalent host coefficient is 1/2.
  if(index==0)return 0.2820947918;
  if(index==1)return 0.4886025119*d.y;
  if(index==2)return 0.4886025119*d.z;
  if(index==3)return 0.4886025119*d.x;
  if(index==4)return 1.0925484310*d.x*d.y;
  if(index==5)return 1.0925484310*d.y*d.z;
  if(index==6)return 0.3153915653*(3.0*d.z*d.z-1.0);
  if(index==7)return 0.5*1.0925484310*d.x*d.z;
  return 0.5*0.5462742153*(d.x*d.x-d.y*d.y);
}
vec3 photonSkyProject(int band,sampler2D skyMap){
  vec3 result=vec3(0.0);
  for(int i=0;i<256;i++){
    vec3 direction=photonSkySample(i);
    vec3 radiance=textureLod(skyMap,skyUv(direction),0.0).rgb;
    result+=radiance*photonSkyBasis(band,direction)*(6.28318530718/256.0);
  }
  return result*photonSkylightBoost();
}
`;
