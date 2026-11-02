import { cloudCoverageNoiseGLSL } from './cloud-coverage-data.js';

// Photon 6e67b36 vertex/displacement.glsl. The cloud climate already publishes
// weather/core.glsl windiness, including wetness and absolute world age.
export const foliageWindStrength = (rain, windiness) =>
  (0.25 + 0.66 * rain) * (0.5 + windiness);

export const foliageWindGLSL = /* glsl */ `
uniform sampler2D leafNoise;
${cloudCoverageNoiseGLSL.replaceAll('cloudNoise', 'leafNoise')}
vec3 hexFoliageWind(vec3 worldPosition, float time, float strength, float squaredSky) {
  if (strength <= 0.0 || squaredSky <= 0.0) return vec3(0.0);
  const vec2 direction = vec2(0.866025403784, 0.5);
  float t = 0.3 * time;
  float amount = hexPhotonCloudNoise(0.05 * (worldPosition.xz + direction * t)).g;
  amount *= amount;
  vec3 gust = vec3(direction.x * amount, 0.1 * amount, direction.y * amount);
  vec3 phase = 32.0 * worldPosition + 3.0 * t + vec3(0.0, 2.399963229729, 4.799926459457);
  vec3 wobble = sin(phase) + 0.5 * sin(2.0 * phase) + 0.25 * sin(4.0 * phase);
  // Host skylight attributes already contain (level / 15)^2.
  return strength * squaredSky * (gust + 0.1 * wobble);
}
`;
