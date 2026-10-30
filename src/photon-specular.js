// Adapted from Photon 6e67b36 surface/material.glsl, lighting/bsdf.glsl and
// lighting/specular_lighting.glsl. See public/licenses/PHOTON-NOTICE.md.
// Optical math uses the host's linear-sRGB working space.
export const photonSpecularGLSL = /* glsl */ `
const float photonSurfacePi=3.14159265359;
struct PhotonSurfaceOptics { float roughness;float f0;float metal;vec3 conductorF0;vec3 f82;float hardcoded;float ssr;float emission;float porosity;float sss; };
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
  float ssr=(mask==8||mask==11||mask==12||mask==13)?1.0:0.0;
  float sss=mask==5?1.0:mask==2?0.5:0.0;
  return PhotonSurfaceOptics(roughness,f0,metal,vec3(f0),vec3(0.0),0.0,ssr,0.0,0.0,sss);
}
void photonDecodeLabPbr(vec4 data,vec3 albedo,inout PhotonSurfaceOptics optical){
  optical.roughness=(1.0-data.r)*(1.0-data.r);
  optical.emission=data.a<1.0?data.a:0.0;
  if(data.g<229.5/255.0){
    optical.f0=max(optical.f0,data.g);
    float hasSss=step(64.5/255.0,data.b);
    optical.sss=max(optical.sss,photonSurfaceLinearStep(64.0/255.0,1.0,data.b*hasSss));
    optical.porosity=photonSurfaceLinearStep(0.0,64.0/255.0,max(0.0,data.b-data.b*hasSss));
  }else if(data.g<237.5/255.0){
    int id=clamp(int(floor(data.g*255.0+0.5))-230,0,7);
    const vec3 f0Table[8]=vec3[8](vec3(.78,.77,.74),vec3(1,.90,.61),vec3(1,.98,1),vec3(.77,.80,.79),vec3(1,.89,.73),vec3(.79,.87,.85),vec3(.92,.90,.83),vec3(1,1,.91));
    const vec3 f82Table[8]=vec3[8](vec3(.74,.76,.76),vec3(1,.93,.73),vec3(.96,.97,.98),vec3(.74,.79,.78),vec3(1,.90,.80),vec3(.83,.80,.83),vec3(.89,.87,.81),vec3(1,1,.95));
    optical.conductorF0=f0Table[id];optical.f82=f82Table[id];optical.f0=optical.conductorF0.r;optical.metal=1.0;optical.hardcoded=1.0;
  }else{optical.f0=albedo.r;optical.metal=1.0;}
  optical.ssr=step(0.01,optical.f0-optical.f0*optical.roughness*2.0);
}
vec3 photonSurfaceFresnel(float cosine,vec3 albedo,PhotonSurfaceOptics optical){
  if(optical.hardcoded>0.5){
    vec3 a=17.6513846*(optical.conductorF0-optical.f82)+8.16666667*(1.0-optical.conductorF0);
    float m=pow(1.0-cosine,5.0);
    return clamp(optical.conductorF0+(1.0-optical.conductorF0)*m-a*cosine*(m-m*cosine),0.0,1.0);
  }
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
  return min((NoL*distribution*visibility)*fresnel*mix(vec3(1.0),albedo,optical.hardcoded),vec3(4.0));
}
`;
