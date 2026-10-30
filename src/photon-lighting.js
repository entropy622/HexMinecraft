// Adapted from Photon 6e67b36: light_color.glsl, atmosphere.glsl, color.glsl,
// global.glsl and shaders.properties. See public/licenses/PHOTON-NOTICE.md.
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
const mat3 photon2020ToXyz = mat3(
  0.6369736,0.1446172,0.1688585,
  0.2627066,0.6779996,0.0592938,
  0.0,0.0280728,1.0608437);
const mat3 photonXyzTo709 = mat3(
  3.2406,-1.5372,-0.4986,
  -0.9689,1.8758,0.0415,
  0.0557,-0.2040,1.0570);
const mat3 photon709ToXyz = mat3(
  0.4124,0.3576,0.1805,0.2126,0.7152,0.0722,0.0193,0.1192,0.9505);
const mat3 photonXyzTo2020 = mat3(
  1.7166084,-0.3556621,-0.2533601,-0.6666829,1.6164776,0.0157685,
  0.0176422,-0.0427763,0.94222867);
vec3 photonTo2020(vec3 rgb) { return rgb*photon709ToXyz*photonXyzTo2020; }
vec3 photonTo709(vec3 rgb) { return max(rgb*photon2020ToXyz*photonXyzTo709,vec3(0.0)); }
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
`;
