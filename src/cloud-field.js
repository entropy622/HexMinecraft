export const CLOUD_RADIUS = 4;
export const CLOUD_BASE = 52;
const mod = (x, n) => ((x % n) + n) % n;
const random = (x, y, seed) => {
  x = mod(x, 127);
  y = mod(y, 127);
  const n = mod(x * 37 + y * 17 + mod(seed, 127) * 13, 127);
  return mod(n * n * 13 + n * 7 + x * y * 3, 127) / 126;
};
const noise = (x, y, seed) => {
  const a = Math.floor(x),
    b = Math.floor(y);
  const fx = x - a,
    fy = y - b;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const low = random(a, b, seed) * (1 - u) + random(a + 1, b, seed) * u;
  const high =
    random(a, b + 1, seed) * (1 - u) + random(a + 1, b + 1, seed) * u;
  return low * (1 - v) + high * v;
};
export const cloudDensity = (q, r, seed) =>
  noise(q * 0.15, r * 0.15, seed) * 0.62 +
  noise(-r * 0.3 + 19, q * 0.3 + 41, seed) * 0.27 +
  noise((q + r) * 0.6 + 9, r * 0.6 - 27, seed) * 0.11;

// Store exact lattice numerators in R8; the shader restores the /126 value.
export function cloudNoiseData(seed) {
  const data = new Uint8Array(127 * 127);
  for (let y = 0; y < 127; y++)
    for (let x = 0; x < 127; x++)
      data[y * 127 + x] = Math.round(random(x, y, seed) * 126);
  return data;
}

// Integer-sized arithmetic stays below the float exact-integer limit. CPU
// geometry and GPU shadows sample the same seeded field and drifting hex grid.
export const cloudFieldGLSL = /* glsl */ `
uniform sampler2D cloudNoise;
uniform float cloudRadius;
uniform float cloudBase;
uniform float cloudHeight;
uniform float cloudFar;
uniform float cloudVolumetric;
uniform vec2 cloudWind;
uniform float cloudThreshold;
uniform vec3 cloudLightDirection;
uniform float cloudShade;
uniform float cloudEnabled;
float hexCloudRandom(vec2 p) {
  return texelFetch(cloudNoise, ivec2(mod(p, 127.0)), 0).r * (255.0 / 126.0);
}
float hexCloudNoise(vec2 p) {
  vec2 a = floor(p), f = fract(p);
  vec2 t = f * f * (3.0 - 2.0 * f);
  return mix(mix(hexCloudRandom(a), hexCloudRandom(a + vec2(1.0, 0.0)), t.x),
    mix(hexCloudRandom(a + vec2(0.0, 1.0)), hexCloudRandom(a + 1.0), t.x), t.y);
}
float hexCloudNoise3D(vec3 p) {
  float slice = floor(p.z), f = fract(p.z);
  vec2 shift = vec2(19.0, 37.0);
  return mix(hexCloudNoise(p.xy + shift * slice), hexCloudNoise(p.xy + shift * (slice + 1.0)), f * f * (3.0 - 2.0 * f));
}
float hexCloudDensity(vec2 h) {
  return hexCloudNoise(h * 0.15) * 0.62 +
    hexCloudNoise(vec2(-h.y, h.x) * 0.3 + vec2(19.0, 41.0)) * 0.27 +
    hexCloudNoise(vec2(h.x + h.y, h.y) * 0.6 + vec2(9.0, -27.0)) * 0.11;
}
vec2 hexCloudCell(vec2 p) {
  p /= cloudRadius;
  vec3 cube = vec3(p.x / 1.732050808 - p.y / 3.0, 0.0, p.y / 1.5);
  cube.y = -cube.x - cube.z;
  vec3 rounded = floor(cube + 0.5), error = abs(rounded - cube);
  if (error.x > error.y && error.x > error.z) rounded.x = -rounded.y - rounded.z;
  else if (error.y > error.z) rounded.y = -rounded.x - rounded.z;
  else rounded.z = -rounded.x - rounded.y;
  return rounded.xz;
}
float hexCloudPresence(float density) {
  return smoothstep(cloudThreshold - 0.035, cloudThreshold + 0.035, density);
}
const float hexCloudExtinction = 0.9;
float hexCloudVolumeDensity(vec3 position) {
  float y = position.y - cloudBase;
  if (y <= 0.0 || y >= cloudHeight * 1.6) return 0.0;
  vec2 p = (position.xz - cloudWind) / cloudRadius;
  vec2 h = vec2(p.x / 1.732050808 - p.y / 3.0, p.y / 1.5);
  float macro = hexCloudDensity(h);
  float fraction = y / (cloudHeight * (0.5 + macro * 1.1));
  float fill = clamp((macro - cloudThreshold + 0.055) * 5.0, 0.0, 1.0);
  if (fraction >= 1.0 || fill <= 0.0) return 0.0;
  float detail = hexCloudNoise3D(vec3(h * 0.8, fraction * 2.7));
  float profile = smoothstep(0.0, 0.2, fraction) * (1.0 - smoothstep(0.45, 1.0, fraction));
  return max(0.0, fill - (1.0 - detail) * 0.7) * profile;
}
float hexCloudOpticalDepth(vec3 origin, vec3 direction, float reach) {
  float depth = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) / 4.0, b = float(i + 1) / 4.0;
    float start = a * a * reach, end = b * b * reach;
    depth += hexCloudVolumeDensity(origin + direction * ((start + end) * 0.5)) * (end - start);
  }
  return depth;
}
float hexCloudShadow(vec3 point) {
  if (cloudEnabled < 0.5 || cloudLightDirection.y < 0.04) return 1.0;
  if (cloudVolumetric > 0.5) {
    float top = cloudBase + cloudHeight * 1.6;
    if (point.y >= top) return 1.0;
    float entry = max(0.0, (cloudBase - point.y) / cloudLightDirection.y);
    vec3 origin = point + cloudLightDirection * entry;
    float reach = min(48.0, (top - origin.y) / cloudLightDirection.y);
    float transmission = exp(-hexCloudExtinction * hexCloudOpticalDepth(origin, cloudLightDirection, reach));
    return mix(1.0, transmission, cloudShade * smoothstep(0.04, 0.18, cloudLightDirection.y));
  }
  if (point.y >= cloudBase) return 1.0;
  float reach = (cloudBase + 3.0 - point.y) / max(0.04, cloudLightDirection.y);
  vec2 p = point.xz + cloudLightDirection.xz * reach - cloudWind;
  vec2 h = hexCloudCell(p);
  vec2 center = vec2(1.732050808 * (h.x + h.y * 0.5), 1.5 * h.y) * cloudRadius;
  vec2 delta = p - center;
  float edge = max(abs(delta.x), abs(dot(delta, vec2(0.5, 0.866025404))));
  edge = max(edge, abs(dot(delta, vec2(-0.5, 0.866025404))));
  edge /= cloudRadius * 0.866025404;
  float presence = hexCloudPresence(hexCloudDensity(h));
  float coverage = (1.0 - smoothstep(presence - 0.12, presence + 0.12, edge)) * smoothstep(0.0, 0.1, presence);
  return 1.0 - coverage * cloudShade * smoothstep(0.04, 0.18, cloudLightDirection.y);
}
`;
