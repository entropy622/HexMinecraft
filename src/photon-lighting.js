// Adapted from Photon 6e67b36: light_color.glsl, atmosphere.glsl, color.glsl,
// global.glsl and shaders.properties. See public/licenses/PHOTON-NOTICE.md.
import { photonColorGLSL } from './photon-color.js';
export const PHOTON_RAYLEIGH_PER_KM = [
  0.008059375432, 0.01671209429, 0.04080133294,
];
export const PHOTON_MIE_PER_KM = [
  0.001666442358, 0.001812685127, 0.001958927896,
];
export const PHOTON_OZONE_PER_KM = [
  0.0008304280072, 0.00131491197, 0.00005440679729,
];
export const PHOTON_SUN_SCALE = 7;

// Pure GLSL/data module: cloud/air logic can import it in Node without Vite's
// browser-only scattering asset. All published light colours use this kernel.
export const photonLightingGLSL = /* glsl */ `
${photonColorGLSL}
float photonLinear(float a,float b,float x) { return clamp((x-a)/(b-a),0.0,1.0); }
float photonPulse(float x,float center,float width) {
  x=clamp(abs(x-center)/width,0.0,1.0);
  return 1.0-x*x*(3.0-2.0*x);
}
float photonLightBlueHour() {
  float h=skySunDirection.y+0.09604;
  return photonLinear(0.05,1.0,exp(-190.0*h*h));
}
float photonMorningEveningWeight() {
  float y=skySunDirection.y;
  float fade=y<0.18 ? 0.37+1.2*max(0.0,-y) : 1.7;
  float w=clamp(1.0-fade*abs(y-0.18),0.0,1.0);
  return w*w;
}
float photonSunExposure() {
  float weight=skySunDirection.x==0.0 ? 0.0 : photonMorningEveningWeight();
  return 7.0*(1.0+0.5*weight+40.0*photonLightBlueHour());
}
vec3 photonSunTint() {
  float pulse=photonPulse(skySunDirection.y,0.17,0.40);
  vec3 tint=mix(vec3(1.0),1.2*vec3(1.05,0.84,0.93),pulse*pulse);
  tint*=mix(vec3(1.0),vec3(0.95,0.80,1.0),photonLightBlueHour());
  // Default user morning/noon/evening tint is white, transformed as in Photon.
  return tint*photonTo2020(vec3(1.0));
}
float photonMoonBrightness() {
  int phase=int(skyMoonPhase+0.5);
  // Preserve the pinned source's asymmetric default eight-phase table.
  if(phase==1 || phase==6)return 0.875;
  if(phase==2 || phase==5)return 0.75;
  if(phase==3)return 0.625;
  if(phase==4)return 0.5;
  return 1.0;
}
float photonMoonExposure() {
  return 0.66*photonMoonBrightness()*(1.0+0.33/clamp(1.25*max(-skySunDirection.y,0.1),0.0,1.0));
}
vec3 photonMoonTint() { return photonTo2020(pow(vec3(0.75,0.83,1.0),vec3(2.2))); }
vec3 photonSunColor() { return photonSunExposure()*photonSunTint(); }
vec3 photonMoonColor() { return photonMoonExposure()*photonMoonTint(); }
// Source weather_color.glsl constants are already in the working Rec.2020
// space. Precipitation uses the brighter PROGRAM_WEATHER snow night floor.
vec3 photonWeatherColor(float sunHeight,float snow,bool precipitation) {
  float day=smoothstep(-0.1,0.5,sunHeight);
  float rain=mix(0.033,0.66,day);
  float snowfall=mix(precipitation?0.5:0.060,1.60,day);
  return photonTo709(mix(rain,snowfall,clamp(snow,0.0,1.0))
    *vec3(1.051,0.985,0.940)*vec3(0.49,0.65,1.00));
}
vec3 photonAtmospherePost(vec3 rgb) {
  // This curve differs from the 190/0.09604 light-exposure blue hour above.
  float h=skySunDirection.y+0.07283;
  float boost=0.10+0.20*exp(-150.0*h*h);
  float saturation=(1.0+boost)*(1.0-clamp((skyAerosol-1.0)/5.0,0.0,1.0));
  return mix(vec3(dot(rgb,vec3(0.2627,0.6780,0.0593))),rgb,saturation);
}
float photonSkylightBoost() {
  float h=skySunDirection.y+0.3;
  return 1.0+0.5*photonLinear(0.05,1.0,exp(-25.0*h*h));
}
float photonChapman(float x,float mu) {
  float c=sqrt(0.5*SKY_PI*x);
  if(mu>=0.0)return c/((c-1.0)*mu+1.0);
  float s=sqrt(clamp(1.0-mu*mu,0.0,1.0));
  return c/((c-1.0)*mu-1.0)+2.0*c*exp(x*(1.0-s))*sqrt(s);
}
vec3 photonAtmosphereTransmittance(float mu,float r) {
  float probeR=max(r,SKY_RADIUS+0.01), b=probeR*mu;
  float discriminant=b*b-(probeR-SKY_RADIUS)*(probeR+SKY_RADIUS);
  if(mu<0.0 && discriminant>=0.0)return vec3(0.0);
  vec2 H=vec2(8.4,1.25);
  vec2 columns=H*exp(-(r-SKY_RADIUS)/H);
  columns*=vec2(photonChapman(r/H.x,mu),photonChapman(r/H.y,mu));
  vec3 extinction=photonTo2020(vec3(${PHOTON_RAYLEIGH_PER_KM.join(',')}))*columns.x+
    photonTo2020(vec3(${PHOTON_MIE_PER_KM.join(',')}))*columns.y+
    photonTo2020(vec3(${PHOTON_OZONE_PER_KM.join(',')}))*columns.x;
  return clamp(exp(-extinction),0.0,1.0);
}
vec3 photonDirectLight() {
  float mu=abs(skySunDirection.y);
  vec3 color=vec3(1.051,0.985,0.940)*photonAtmosphereTransmittance(mu,SKY_RADIUS);
  color=photonAtmospherePost(color);
  color*=skySunDirection.y>=0.0 ? photonSunColor() : photonMoonColor();
  color*=clamp(mu/0.02,0.0,1.0)*(1.0-0.25*photonPulse(mu,0.15,0.11));
  return photonTo709(color);
}
// Clouds receive light at their own altitude, without the surface horizon fade.
// The caller supplies the local radial cosine and the layer's moonlit threshold.
vec3 photonCloudLight(float mu,float height,bool moonlit) {
  vec3 color=vec3(1.051,0.985,0.940)*photonAtmosphereTransmittance(mu,SKY_RADIUS+max(0.0,height)*0.02);
  color=photonAtmospherePost(color);
  return photonTo709(color*(moonlit?photonMoonColor():photonSunColor()));
}
`;
