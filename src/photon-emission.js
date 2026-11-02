// Adapted from Photon 6e67b36 surface/material.glsl (33,35,36,37,55),
// utility/color.glsl and global.glsl. See public/licenses/PHOTON-NOTICE.md.
// Source thresholds remain in texture sRGB; radiance uses the host's linear 709.
export const photonEmissionGLSL = /* glsl */ `
vec3 photonEmissionSrgb(vec3 linear){
  return mix(12.92*linear,1.055*pow(max(linear,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),linear));
}
vec3 photonEmissionHsv(vec3 c){
  const vec4 k=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
  vec4 p=mix(vec4(c.bg,k.wz),vec4(c.gb,k.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+0.000001)),d/(q.x+0.000001),q.x);
}
float photonEmissionStep(float a,float b,float x){return clamp((x-a)/(b-a),0.0,1.0);}
vec3 photonSurfaceEmission(vec3 albedo,int mask){
  if(mask!=33 && mask!=35 && mask!=36 && mask!=37 && mask!=55)return vec3(0.0);
  vec3 hsv=photonEmissionHsv(photonEmissionSrgb(albedo)),root=sqrt(max(albedo,vec3(0.0)));
  if(mask==33)return 0.66*root*photonEmissionStep(0.75,0.9,hsv.z);
  if(mask==35)return 0.85*root*hsv.z*photonEmissionStep(0.4,0.6,0.2*hsv.y+0.55*hsv.z);
  if(mask==36)return 0.85*root*photonEmissionStep(0.78,0.85,hsv.z);
  if(mask==37){
    float distance=abs(mod(hsv.x*360.0-200.0+180.0,360.0)-180.0)/30.0;
    float blue=hsv.y<0.01 || hsv.z<0.01 || distance>1.0?0.0:1.0-distance*distance*(3.0-2.0*distance);
    return 0.8*root*photonEmissionStep(0.47,0.50,0.2*hsv.y+0.5*hsv.z+0.1*blue);
  }
  return vec3(0.20)*(0.1+0.9*hsv.z);
}
`;
