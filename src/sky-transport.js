import { Color } from 'three';

export const SUN_RADIUS = (2 * Math.PI) / 180;
export const SOLAR_IRRADIANCE = new Color(3.8, 3.7, 3.6);
export const RAYLEIGH_PER_KM = [0.005802, 0.013558, 0.0331];
// Host direct-light/local-air transport, in kilometres. Scattered sky uses
// Photon's precomputed table; see docs/photon-sky-verification.md for the limits.
export const transportGLSL = /* glsl */ `
const float SKY_PI = 3.14159265359;
const float SKY_RADIUS = 6371.0;
const float SKY_TOP = 6471.0;
const vec3 SKY_RAYLEIGH = vec3(${RAYLEIGH_PER_KM.join(', ')});
const vec3 SKY_MIE = vec3(0.003996);
const vec3 SKY_OZONE = vec3(0.000650, 0.001881, 0.000085);
const vec3 SKY_SOLAR = vec3(${SOLAR_IRRADIANCE.toArray().join(', ')});
uniform sampler2D skyOpticalDepthMap;
uniform float skyObserverHeight;
uniform float skyAerosol;
uniform vec3 skySunDirection;
uniform float skyMoonIllumination;

vec3 skyDensity(float height) {
  height = max(0.0, height);
  return vec3(exp(-height / 8.0), exp(-height / 1.2),
    max(0.0, 1.0 - abs(height - 25.0) / 15.0));
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
vec3 skyColumns(vec3 position, vec3 direction) {
  float r = length(position), mu = clamp(dot(position, direction) / r, -1.0, 1.0);
  vec2 unit = vec2(0.5 + 0.5 * sign(mu) * sqrt(abs(mu)),
    sqrt(clamp((r - SKY_RADIUS) / 100.0, 0.0, 1.0)));
  vec2 size = vec2(textureSize(skyOpticalDepthMap, 0));
  return textureLod(skyOpticalDepthMap, (0.5 + unit * (size - 1.0)) / size, 0.0).rgb;
}
vec3 skyLightTransmittance(vec3 position, vec3 direction, float angularRadius) {
  float r = length(position), mu = dot(position, direction) / r;
  float horizon = -sqrt(max(0.0, (r - SKY_RADIUS) * (r + SKY_RADIUS))) / r;
  float visibility = smoothstep(horizon - sin(angularRadius), horizon + sin(angularRadius), mu);
  if (visibility <= 0.0) return vec3(0.0);
  // A partially risen disk is seen through its visible arc, never through
  // the short path to the ground under its occluded centre.
  if (mu < horizon + 0.0001) {
    vec3 up = position / r, tangent = normalize(direction - up * mu);
    float visibleMu = horizon + 0.0001;
    direction = tangent * sqrt(max(0.0, 1.0 - visibleMu * visibleMu)) + up * visibleMu;
  }
  return exp(-skyExtinction(skyColumns(position, direction))) * visibility;
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
