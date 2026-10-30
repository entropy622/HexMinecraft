// Original RGB air transport following Photon's separate Rayleigh/Mie columns,
// normalized phase functions and four-order direct scattering approximation.
// Scene distances are local units, not the shader pack's Minecraft metres.
export const airTransportGLSL = /* glsl */ `
uniform float airDensity;
uniform float airBaseHeight;
uniform float airFalloff;
uniform float airRayleighBaseHeight;
uniform float airRayleighFalloff;
uniform vec3 airRayleigh;
uniform float airMieExtinction;
uniform float airMieScattering;
uniform vec3 airSkyMean;
uniform vec3 airHorizon;
uniform vec3 airSunColor;
uniform vec3 airSunDirection;
uniform float airSunPower;
uniform float airAmbient;
uniform float airDirectMultiplier;
uniform float airScatterMultiplier;

// Exact integral of min(1, exp(-(height-base)*falloff)). Splitting at the
// profile's ceiling avoids the horizontal-ray singularity and overflow when
// a descending ray crosses the base. Endpoints can be far below the base.
float airProfileColumn(float height, float rayY, float distance, float base, float falloff) {
  if (abs(rayY) < 0.000001) return distance * exp(-max(0.0, height-base)*falloff);
  float crossAt = clamp((base-height)/rayY, 0.0, distance);
  float below = rayY > 0.0 ? crossAt : distance-crossAt;
  float above = distance-below;
  float lower = height+rayY*crossAt;
  float x = abs(rayY)*falloff*above;
  float mean = x < 0.001 ? 1.0-x*0.5+x*x/6.0 : (1.0-exp(-x))/x;
  return below + above * exp(-max(0.0,lower-base)*falloff) * mean;
}
vec2 airColumns(vec3 origin, vec3 direction, float distance) {
  return vec2(
    airProfileColumn(origin.y,direction.y,distance,airRayleighBaseHeight,airRayleighFalloff),
    airProfileColumn(origin.y,direction.y,distance,airBaseHeight,airFalloff));
}
vec3 airOpticalDepth(vec2 columns) {
  return airRayleigh*columns.x + vec3(airMieExtinction*columns.y);
}
float airHG(float cosine, float g) {
  return 0.07957747155 * (1.0-g*g) / pow(max(0.0001,1.0+g*g-2.0*g*cosine),1.5);
}
vec2 airDirectPhase(float cosine) {
  vec2 phase=vec2(0.0);
  float amount=1.0, anisotropy=1.0;
  for(int i=0;i<4;i++) {
    phase += amount*vec2(0.07957747155,
      0.7*airHG(cosine,0.5*anisotropy)+0.3*airHG(cosine,-0.2*anisotropy));
    amount*=0.5; anisotropy*=0.7;
  }
  return phase;
}
// Mean incoming sky radiance already integrates the isotropic phase over 4pi.
// The direct input is irradiance and therefore retains its normalized phase.
vec3 airScattering(vec2 columns, vec2 phase, float sky, vec3 block, vec3 sun) {
  vec3 tau=airOpticalDepth(columns), integral=(1.0-exp(-tau))/max(tau,vec3(0.000001));
  vec3 ambient=airSkyMean*airAmbient*sky;
  vec3 local=mix(vec3(0.003,0.004,0.005),vec3(0.0),sky)+block*0.85;
  sun *= airDirectMultiplier;
  return integral*((airRayleigh*columns.x*(ambient+sun*phase.x) +
    airMieScattering*columns.y*(ambient+sun*phase.y))*airScatterMultiplier + tau*local);
}
`;
