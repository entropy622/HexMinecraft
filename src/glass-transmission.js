import { GLASS_TYPES } from './dye-data.js';
import { lightVolumeGLSL } from './light-volume-shader.js';

// Shared RGB optical depth along an actual loaded hex-volume light ray.
export const glassTransmissionGLSL = /* glsl */ `
${lightVolumeGLSL}
uniform vec3 glassExtinction[${GLASS_TYPES.length}];
uniform vec3 glassBoundsMin;
uniform vec3 glassBoundsMax;
uniform float glassSunlight;
vec3 glassTransmittance(vec3 start, vec3 ray) {
  if (glassSunlight < 0.5 || glassBoundsMin.y > glassBoundsMax.y) return vec3(1.0);
  vec3 safeRay = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), ray)) * max(abs(ray), vec3(0.000001));
  vec3 a = (glassBoundsMin - start) / safeRay, b = (glassBoundsMax - start) / safeRay;
  vec3 nearPoint = min(a, b), farPoint = max(a, b);
  float distance = max(0.0, max(max(nearPoint.x, nearPoint.y), nearPoint.z));
  float end = min(min(farPoint.x, farPoint.y), farPoint.z);
  if (end <= distance) return vec3(1.0);
  distance += 0.002;
  vec3 opticalDepth = vec3(0.0);
  // A loaded 9x9 chunk footprint plus 64 vertical cells needs fewer than
  // 256 face crossings. The glass bounds usually reduce this to a few cells.
  for (int i = 0; i < 256; i++) {
    if (distance >= end) break;
    vec3 point = start + ray * distance;
    ivec3 cell = lightCell(point);
    if (!insideLightVolume(cell)) break;
    vec4 packed = floor(texelFetch(entityLightVolume, cell, 0) * 255.0 + 0.5);
    float segment = min(end - distance, lightCellExit(point, cell, ray));
    if (mod(packed.a, 16.0) == 14.0) {
      int material = int(floor(packed.r / 16.0) + floor(packed.g / 16.0) * 16.0);
      opticalDepth += glassExtinction[material] * segment;
    } else {
      // This bound is conservative for the actual hex prisms, so empty-space
      // jumps retain the exact glass segments and original face tolerance.
      segment = min(end - distance, max(segment, floor(packed.b / 16.0) - 1.0));
    }
    distance += segment + 0.002;
  }
  return exp(-opticalDepth);
}
`;
