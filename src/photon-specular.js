// Adapted from Photon 6e67b36 surface/material.glsl, lighting/bsdf.glsl and
// lighting/specular_lighting.glsl. See public/licenses/PHOTON-NOTICE.md.
// Optical math uses the host's linear-sRGB working space; no labPBR decoding.
export const photonSpecularGLSL = /* glsl */ `
const float photonSurfacePi=3.14159265359;
struct PhotonSurfaceOptics { float roughness;float f0;float metal; };
float photonSurfaceLinearStep(float a,float b,float x){return clamp((x-a)/(b-a),0.0,1.0);}
PhotonSurfaceOptics photonSurfaceOptics(vec3 albedo,float category){
  // Source rgb_to_hsl().z is HSV's maximum channel, before linear decoding.
  float linear=max(max(albedo.r,albedo.g),albedo.b);
  float value=linear<=0.0031308 ? 12.92*linear : 1.055*pow(max(linear,0.0),1.0/2.4)-0.055;
  float smoothness=0.0, f0=0.02,metal=0.0;
  int mask=int(floor(category+0.5));
  if(mask==0)smoothness=0.33*smoothstep(0.2,0.6,value);
  else if(mask==5)smoothness=0.5*smoothstep(0.16,0.5,value);
  else if(mask==7)smoothness=0.8*photonSurfaceLinearStep(0.81,0.96,value);
  else if(mask==8){float x=photonSurfaceLinearStep(0.4,0.8,value);smoothness=x*x*x*x*0.6;}
  else if(mask==9 || mask==17)smoothness=0.4*photonSurfaceLinearStep(0.61,0.85,value);
  else if(mask==10)smoothness=0.5*photonSurfaceLinearStep(0.4,0.8,value);
  else if(mask==11)smoothness=photonSurfaceLinearStep(0.02,0.4,value);
  else if(mask==12 || mask==13){smoothness=sqrt(photonSurfaceLinearStep(0.1,0.9,value));metal=mask==12 ? 1.0 : 0.0;f0=mask==13 ? 0.25 : 0.02;}
  float roughness=(1.0-smoothness)*(1.0-smoothness);
  if(mask==12 || mask==13)roughness=max(roughness,0.04);
  return PhotonSurfaceOptics(roughness,f0,metal);
}
vec3 photonSurfaceFresnel(float cosine,vec3 albedo,PhotonSurfaceOptics optical){
  if(optical.metal>0.5){float x=1.0-cosine;float f=x*x*x*x*x;return vec3(f)+albedo*(1.0-f);}
  float root=sqrt(optical.f0)*0.99999, n=(1.0+root)/(1.0-root);
  float g2=n*n+cosine*cosine-1.0;
  if(g2<0.0)return vec3(1.0);
  float g=sqrt(g2),a=g-cosine,b=g+cosine;
  float ratio=a/b,term=(b*cosine-1.0)/(a*cosine+1.0);
  return vec3(0.5*ratio*ratio*(1.0+term*term));
}
float photonSurfaceDiskNoH2(float NoL,float NoV,float LoV,float radius){
  float c=cos(radius),t=tan(radius),RoL=2.0*NoL*NoV-LoV;
  if(RoL>=c)return 1.0;
  float ratio=c*t*inversesqrt(max(1.0-RoL*RoL,1e-12));
  float nr=ratio*(NoV-RoL*NoL),vr=ratio*(2.0*NoV*NoV-1.0-RoL*LoV);
  float triple=sqrt(clamp(1.0-NoL*NoL-NoV*NoV-LoV*LoV+2.0*NoL*NoV*LoV,0.0,1.0));
  float nb=ratio*triple,vb=ratio*(2.0*triple*NoV);
  float nl=NoL*c+NoV+nr,lv=LoV*c+1.0+vr;
  float p=nb*lv,q=nl*lv,s=vb*nl;
  float xn=q*(-0.5*p+0.25*vb*nl);
  float xd=p*p+s*(s-2.0*p)+nl*((NoL*c+NoV)*lv*lv+q*(-0.5*(lv+LoV*c)-0.5));
  float twice=2.0*xn/max(xd*xd+xn*xn,1e-30);
  float sine=twice*xd,cosine=1.0-twice*xn;
  nr=cosine*nr+sine*nb;vr=cosine*vr+sine*vb;
  float bentNoL=NoL*c+nr,bentLoV=LoV*c+vr;
  return clamp((NoV+bentNoL)*(NoV+bentNoL)/max(2.0*bentLoV+2.0,1e-12),0.0,1.0);
}
vec3 photonSurfaceHighlight(vec3 albedo,PhotonSurfaceOptics optical,float NoL,float NoV,float LoV,float LoH,float radius){
  if(NoL<=0.000001)return vec3(0.0);
  vec3 fresnel=photonSurfaceFresnel(clamp(LoH,0.0,1.0),albedo,optical);
  if(all(lessThan(fresnel,vec3(0.01))))return vec3(0.0);
  float nh2=photonSurfaceDiskNoH2(NoL,NoV,LoV,radius);
  // Define the perfect-smooth limit without the source's possible 0/0.
  float alpha2=max(optical.roughness*optical.roughness,1e-8);
  float denominator=1.0-nh2+nh2*alpha2;
  float distribution=alpha2/(photonSurfacePi*denominator*denominator);
  float nl=max(NoL,0.01),nv=max(NoV,0.01);
  float visibility=0.5/(nv*sqrt((-nl*alpha2+nl)*nl+alpha2)+nl*sqrt((-nv*alpha2+nv)*nv+alpha2));
  return min((NoL*distribution*visibility)*fresnel,vec3(4.0));
}
`;
