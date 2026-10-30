import {
  PHOTON_RAYLEIGH_PER_KM,
  PHOTON_MIE_PER_KM,
  PHOTON_OZONE_PER_KM,
  photonLightingGLSL,
} from './photon-lighting.js';

export const SUN_RADIUS = (2 * Math.PI) / 180;
export const RAYLEIGH_PER_KM = PHOTON_RAYLEIGH_PER_KM;
// Source coefficients/density in kilometres; local distance remains 20 m/unit.
export const transportGLSL = /* glsl */ `
const float SKY_PI = 3.14159265359;
const float SKY_RADIUS = 6371.0;
const float SKY_TOP = 6481.0;
const vec3 SKY_RAYLEIGH = vec3(${RAYLEIGH_PER_KM.join(', ')});
const vec3 SKY_MIE = vec3(${PHOTON_MIE_PER_KM.join(',')});
const vec3 SKY_OZONE = vec3(${PHOTON_OZONE_PER_KM.join(',')});
uniform float skyObserverHeight;
uniform float skyAerosol;
uniform vec3 skySunDirection;
uniform float skyMoonIllumination;
uniform float skyMoonPhase;
${photonLightingGLSL}

vec3 skyDensity(float height) {
  height = max(0.0, height);
  float h18=height-18.0, h23=height-23.5, h30=height-30.0;
  float ozone=0.007428*(12.5*exp(-height/8.0)+30.0*exp(-h18*h18/80.0)+
    75.0*exp(-h23*h23/50.0)+50.0*exp(-h30*h30/150.0));
  return vec3(exp(-height/8.4),exp(-height/1.25),ozone);
}
vec3 skyExtinction(vec3 columns) {
  return SKY_RAYLEIGH * columns.x + SKY_MIE * skyAerosol * columns.y + SKY_OZONE * columns.z;
}
float skyBoundary(vec3 position, vec3 direction) {
  float r = length(position), b = dot(position, direction);
  float top = -b + sqrt(max(0.0, b * b + (SKY_TOP - r) * (SKY_TOP + r)));
  float ground = b * b - (r - SKY_RADIUS) * (r + SKY_RADIUS);
  if (b < 0.0 && ground >= 0.0) top = min(top, max(0.0, -b - sqrt(ground)));
  return top;
}
vec3 skyDiskTransmittance2020(vec3 position, vec3 direction, float angularRadius) {
  float r = length(position), mu = dot(position, direction) / r;
  float horizon = -sqrt(max(0.0, (r - SKY_RADIUS) * (r + SKY_RADIUS))) / r;
  float visibility = smoothstep(horizon - sin(angularRadius), horizon + sin(angularRadius), mu);
  if (visibility <= 0.0) return vec3(0.0);
  // A partially risen disk is seen through its visible arc, never through
  // the short path to the ground under its occluded centre.
  if (mu < horizon + 0.0001) {
    mu=horizon+0.0001;
  }
  return photonAtmosphereTransmittance(mu,r)*visibility;
}
vec3 skyLightTransmittance(vec3 position, vec3 direction, float angularRadius) {
  return clamp(photonTo709(skyDiskTransmittance2020(position,direction,angularRadius)),0.0,1.0);
}
vec2 skyUv(vec3 direction) {
  float elevation = asin(clamp(direction.y, -1.0, 1.0));
  float azimuth = dot(direction.xz, direction.xz) < 1e-10 ? 0.0 : atan(direction.z, direction.x);
  return vec2(azimuth / (2.0 * SKY_PI) + 0.5,
    0.5 + 0.5 * sign(elevation) * sqrt(abs(elevation) / (0.5 * SKY_PI)));
}
vec3 skyDirection(vec2 uv) {
  float v = uv.y * 2.0 - 1.0, elevation = sign(v) * v * v * SKY_PI * 0.5;
  float azimuth = (uv.x - 0.5) * 2.0 * SKY_PI;
  return vec3(cos(azimuth) * cos(elevation), sin(elevation), sin(azimuth) * cos(elevation));
}
`;

export const skyRadianceGLSL = /* glsl */ `
${transportGLSL}
uniform sampler2D skyRadianceMap;
vec3 hexSkyRadiance(vec3 worldDirection) {
  vec2 uv = skyUv(normalize(worldDirection));
  // Terrain supplies the visible ground. Extend the air-side horizon behind
  // the finite streaming boundary, instead of displaying the SH ground model.
  uv.y = max(uv.y, 0.5);
  return textureLod(skyRadianceMap, uv, 0.0).rgb;
}
vec3 hexAirTransmittance(float worldDistance, vec3 worldDirection) {
  vec3 direction = normalize(worldDirection), position = vec3(0.0, SKY_RADIUS + skyObserverHeight, 0.0);
  // A visual world unit is 20 m; virtual cloud distance uses the same boundary.
  float distance = min(max(0.0, worldDistance) * 0.02, skyBoundary(position, direction));
  vec3 columns = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) / 8.0, b = float(i + 1) / 8.0;
    vec3 p = position + direction * distance * ((a * a + b * b) * 0.5);
    columns += skyDensity(length(p) - SKY_RADIUS) * ((b * b - a * a) * distance);
  }
  return exp(-skyExtinction(columns));
}
`;
