import { lightVolumeGLSL } from './light-volume-shader.js';
import {
  waterWavesGLSL,
  waterExtinctionGLSL,
  waterInterfaceGLSL,
} from './water-shader.js';

// Receiver-side refraction footprint, independently implemented for the hex field.
// Only directional light changes; ambient, emitters and the camera fog remain separate.
export const waterLightingGLSL = /* glsl */ `
${lightVolumeGLSL}
${waterWavesGLSL}
${waterExtinctionGLSL}
${waterInterfaceGLSL}
uniform float waterSunlight;
uniform float waterTime;
vec2 waterOffset(vec2 entry, vec3 sun, float depth) {
  vec3 ray = refract(-sun, waterNormal(entry, waterTime), 1.0 / waterIOR);
  return ray.xz * (depth / max(0.2, -ray.y));
}
vec3 waterSunResponse(vec3 position, vec3 normal, inout vec3 sun, float skylight, out vec3 bounceResponse) {
  bounceResponse=vec3(1.0);
  float footprint = max(length(dFdx(position)), length(dFdy(position)));
  vec3 ordinary = vec3(smoothstep(0.45, 0.95, skylight));
  if (waterSunlight < 0.5 || sun.y <= 0.05) return ordinary;
  vec3 start = position + normal * 0.045;
  ivec3 initial = lightCell(start);
  if (!insideLightVolume(initial)) return ordinary;
  float height = lightWaterHeight(mod(readLightCell(initial).a, 16.0));
  if (height <= 0.0 || fract(start.y) >= height) return ordinary;
  bounceResponse=ordinary;
  // Trace the mean refracted direction. Never assume a global sea level.
  vec3 direction = -refract(-sun, vec3(0.0, 1.0, 0.0), 0.75);
  float distance = 0.0, surface = start.y;
  bool exposed = false, atTop = false;
  for (int i = 0; i < 32; i++) {
    vec3 p = start + direction * distance;
    ivec3 cell = lightCell(p);
    if (!insideLightVolume(cell)) return ordinary;
    float medium = mod(readLightCell(cell).a, 16.0);
    height = lightWaterHeight(medium);
    if (medium < 0.5 || medium == 10.0 || medium == 11.0) { bounceResponse=vec3(0.0); return vec3(0.0); }
    if (height == 0.0 || fract(p.y) >= height) {
      // A step can cross a hex side before reaching its predicted top. Only
      // accept a horizontal interface with actual water directly below it.
      vec3 below = vec3(p.x, surface - 0.01, p.z);
      ivec3 belowCell = lightCell(below);
      float belowHeight = lightWaterHeight(mod(readLightCell(belowCell).a, 16.0));
      exposed = atTop && insideLightVolume(belowCell) && belowHeight > 0.0 && fract(below.y) < belowHeight;
      break;
    }
    float toTop = (floor(p.y) + height - p.y) / direction.y;
    atTop = toTop <= 0.6;
    float stepLength = min(0.6, toTop + 0.002);
    surface = floor(p.y) + height;
    distance += stepLength;
  }
  if (!exposed) return ordinary;
  float depth = max(0.0, surface - start.y);
  vec2 entry = (start + direction * distance).xz;
  // Two fixed inverse-map refinements keep focusing attached to world receivers.
  for (int i = 0; i < 2; i++) entry = start.xz - waterOffset(entry, sun, depth);
  vec2 offset = waterOffset(entry, sun, depth);
  const float delta = 0.025;
  vec2 dx = vec2(1.0, 0.0) + (waterOffset(entry + vec2(delta, 0.0), sun, depth) - offset) / delta;
  vec2 dz = vec2(0.0, 1.0) + (waterOffset(entry + vec2(0.0, delta), sun, depth) - offset) / delta;
  float area = abs(dx.x * dz.y - dx.y * dz.x);
  float focus = clamp(1.0 / max(area, 0.25), 0.35, 3.0);
  focus = mix(focus, 1.0, smoothstep(0.12, 0.35, footprint));
  // Deep or sub-pixel focusing tends to uniform transmitted sunlight.
  focus = mix(focus, 1.0, smoothstep(9.0, 13.0, depth));
  sun = -refract(-sun, waterNormal(entry, waterTime), 1.0 / waterIOR);
  bounceResponse=exp(-waterExtinction * (depth / max(0.2, sun.y))) * focus;
  return bounceResponse;
}
`;
