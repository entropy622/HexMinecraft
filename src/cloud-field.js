import { CLOUD_METRES_PER_UNIT, CIRRUS_DENSITY } from './cloud-optics.js';
import { cloudDetailGLSL } from './cloud-detail-data.js';
import { photonWeather } from './photon-weather.js';
import {
  cloudCoverageNoiseGLSL,
  CLOUD_COVERAGE_HEADER,
} from './cloud-coverage-data.js';
export { CLOUD_COVERAGE_HEADER } from './cloud-coverage-data.js';
export const CLOUD_RADIUS = 4;
export const CLOUD_BASE = 52;
export const CLOUD_NOISE_SCALE = 255 / 126;
export const CLOUD_COVERAGE_SIZE = 1024;
export const CLOUD_COVERAGE_SPANS = [512, 256];
// Shared with the atmosphere's conversion of 20 metres per local world unit.
export const CLOUD_PLANET_RADIUS = 6371000 / CLOUD_METRES_PER_UNIT;
const mod = (x, n) => ((x % n) + n) % n;
const random = (x, y, seed) => {
  x = mod(x, 127);
  y = mod(y, 127);
  let n = (Math.imul(x + y * 127, 374761393) + Math.imul(seed, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (((n ^ (n >>> 16)) >>> 0) % 127) / 126;
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

// Analytic wind displacement has no accumulated clock or saved state. Its
// derivative varies smoothly, and changing rain never teleports the texture.
export function cloudWeather(seed, time, heat, wet, rain, storm) {
  const {
      temperature,
      humidity,
      wind: breeze,
    } = photonWeather(time, heat, wet, Math.min(1, rain + storm * 0.12)),
    wind = 0.7 + breeze * 0.6,
    shaping = cloudCoverageWeather(temperature, humidity, breeze);
  return {
    temperature,
    humidity,
    ...shaping,
    noiseOffset: [random(3, 17, seed) * 25000, random(29, 5, seed) * 25000],
    // The inexpensive geometry mode retains its scalar coverage control.
    coverage: [
      Math.max(
        0.2,
        Math.min(0.94, 0.33 + humidity * 0.18 + rain * 0.3 + storm * 0.08),
      ),
      Math.max(
        0.12,
        Math.min(0.9, 0.2 + humidity * 0.23 + shaping.altoStratus * 0.16),
      ),
      Math.max(0.12, Math.min(0.78, 0.26 + humidity * 0.3 - storm * 0.08)),
    ],
    winds: [0, 1, 2].map((layer) => {
      const angle = [0.26, 1.22, 2.18][layer] + random(2, 9, seed) * 0.6;
      const speed = [0.067, 0.105, 0.16][layer];
      const bend = (Math.sin(time / 700 + layer) - Math.sin(layer)) * 3;
      return [
        Math.cos(angle) * time * speed + bend,
        Math.sin(angle) * time * speed + bend * 0.4,
      ];
    }),
    shear: wind,
  };
}

export function cloudCoverageWeather(temperature, humidity, breeze) {
  const cold = Math.max(0, Math.min(1, (0.5 - temperature) * 2)),
    calm = 1 - breeze,
    upperCold = Math.max(0, Math.min(1, (0.5 - temperature) / 0.16));
  const stratus = cold * (2 - cold) * calm * (2 - calm);
  const altoStratus = upperCold * upperCold * (3 - 2 * upperCold);
  const clamp = (v) => Math.max(0, Math.min(1, v)),
    linear = (a, b, v) => clamp((v - a) / (b - a)),
    humidityWeight =
      (1 - 0.15 * linear(0.6, 1, temperature)) *
      (0.4 * humidity + 0.5 * humidity * humidity),
    variation = 0.1 + 0.1 * breeze,
    cumulus = [
      clamp(humidityWeight - 0.1 * variation + 0.3 * stratus * stratus),
      clamp(humidityWeight + variation + 0.3 * stratus * stratus),
    ],
    ac =
      (linear(0.4, 1, humidity) * 0.5 + 0.5) *
      linear(0.4, 0.66, breeze) *
      linear(1, 0.8, temperature),
    as = linear(0.25, 0.45, breeze * humidity),
    alto = [0.5, 1.5].map((weight) =>
      clamp(ac * weight * (1 - altoStratus) + as * altoStratus),
    );
  return {
    stratus,
    altoStratus,
    ranges: [cumulus, alto],
  };
}

// Integer-sized arithmetic stays below the float exact-integer limit. CPU
// geometry and GPU shadows sample the same seeded field and drifting hex grid.
export const cloudMacroGLSL = /* glsl */ `
uniform highp sampler2D cloudNoise;
uniform float cloudNoiseScale;
uniform float cloudRadius;
uniform vec2 cloudNoiseOffset;
${cloudCoverageNoiseGLSL}
float hexCloudRandom(vec2 p) {
  return texelFetch(cloudNoise, ivec2(mod(p, 127.0)), 0).r * cloudNoiseScale;
}
float hexCloudNoise(vec2 p) {
  vec2 a = floor(p), f = fract(p);
  vec2 t = f * f * (3.0 - 2.0 * f);
  return mix(mix(hexCloudRandom(a), hexCloudRandom(a + vec2(1.0, 0.0)), t.x),
    mix(hexCloudRandom(a + vec2(0.0, 1.0)), hexCloudRandom(a + 1.0), t.x), t.y);
}
float hexCloudDensity(vec2 h) {
  return hexCloudNoise(h * 0.15) * 0.62 +
    hexCloudNoise(vec2(-h.y, h.x) * 0.3 + vec2(19.0, 41.0)) * 0.27 +
    hexCloudNoise(vec2(h.x + h.y, h.y) * 0.6 + vec2(9.0, -27.0)) * 0.11;
}
vec2 hexCloudMacroAnalytic(vec2 drifting, int layer) {
  // Source physical frequencies, at 20 metres per local unit. Seed changes
  // translate the original field rather than generating a different noise.
  vec2 position = drifting + cloudNoiseOffset;
  vec2 result = vec2(0.0);
  if (layer == 0) result = vec2(
    hexPhotonCloudNoise(position * 0.00004).r,
    hexPhotonCloudNoise(position * 0.00054).a);
  else result = hexPhotonCloudNoise(position * 0.00094 + 0.3).ar;
  return result;
}
`;
export const cloudFieldGLSL = /* glsl */ `
${cloudMacroGLSL}
uniform highp sampler3D cloudWorley;
uniform float cloudBase;
uniform float cloudHeight;
uniform float cloudFar;
uniform float cloudVolumetric;
uniform vec2 cloudWind;
uniform float cloudThreshold;
uniform vec3 cloudLightDirection;
uniform float cloudShade;
uniform float cloudEnabled;
uniform vec4 cloudLayers[3]; // base, thickness, coverage, stratus blend
uniform vec2 cloudCoverageRange[2]; // source regional min/max, not a scalar threshold
uniform vec4 cloudOptics[3]; // extinction / metre, albedo, stratus, layer response
uniform vec2 cloudLayerWind[3];
uniform vec4 cloudDetailDrift[2]; // scaled coarse xz, fine xz advection
uniform vec4 cloudDetailShape; // cumulus erosion weights, edge sharpening
uniform vec2 cloudCurvatureOrigin;
uniform float cloudShear;
uniform float cloudCoverageReady;
uniform vec2 cloudCoverageOrigin[2];
const float hexCloudPlanet = ${CLOUD_PLANET_RADIUS.toFixed(1)};
${cloudDetailGLSL}
// Rotate the analytic gradient of a C2 scalar field. Each octave needs only
// four seed fetches, and the flow remains continuous across lattice cells.
vec2 hexCloudCurl(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f - 1.0) * (f - 1.0);
  vec4 n = vec4(hexCloudRandom(cell), hexCloudRandom(cell + vec2(1,0)),
    hexCloudRandom(cell + vec2(0,1)), hexCloudRandom(cell + 1.0));
  vec2 gradient = vec2(mix(n.y - n.x, n.w - n.z, u.y),
    mix(n.z - n.x, n.w - n.y, u.x)) * du;
  return vec2(gradient.y, -gradient.x);
}
vec2 hexCloudMacro(vec2 drifting, int layer) {
  vec2 origin = layer == 0 ? cloudCoverageOrigin[0] : cloudCoverageOrigin[1];
  float span = layer == 0 ? ${CLOUD_COVERAGE_SPANS[0].toFixed(1)} : ${CLOUD_COVERAGE_SPANS[1].toFixed(1)};
  vec2 uv = (drifting - origin) / span + 0.5;
  const float guard = 0.5 / ${CLOUD_COVERAGE_SIZE.toFixed(1)};
  bool useCache = cloudCoverageReady > 0.5 && all(greaterThanEqual(uv, vec2(guard))) && all(lessThanEqual(uv, vec2(1.0 - guard)));
  vec2 result = vec2(0.0);
  if (useCache) {
    // Explicit interpolation keeps the world-aligned grid stable when a tile
    // moves; normalized hardware filtering can round differently in this atlas.
    vec2 pixel = uv * ${CLOUD_COVERAGE_SIZE.toFixed(1)} - 0.5;
    ivec2 cell = ivec2(min(floor(pixel), vec2(${(CLOUD_COVERAGE_SIZE - 2).toFixed(1)})));
    vec2 f = pixel - vec2(cell);
    cell.y += ${CLOUD_COVERAGE_HEADER};
    vec4 cached = mix(
      mix(texelFetch(cloudNoise, cell, 0), texelFetch(cloudNoise, cell + ivec2(1, 0), 0), f.x),
      mix(texelFetch(cloudNoise, cell + ivec2(0, 1), 0), texelFetch(cloudNoise, cell + ivec2(1, 1), 0), f.x), f.y);
    result = layer == 0 ? cached.rg : cached.ba;
  } else {
    result = hexCloudMacroAnalytic(drifting, layer);
  }
  return result;
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
float hexCloudAltitude(vec3 position) {
  vec2 offset = position.xz - cloudCurvatureOrigin;
  float y = position.y + hexCloudPlanet, horizontal = dot(offset, offset);
  return position.y + horizontal / (sqrt(y * y + horizontal) + y);
}
// Intersect a curved sky shell. Real terrain still truncates the resulting
// interval; the planet is virtual and never changes world collision or depth.
vec2 hexCloudInterval(vec3 origin, vec3 direction, int layer, float limit) {
  vec3 p = vec3(origin.xz - cloudCurvatureOrigin, origin.y + hexCloudPlanet);
  vec3 d = vec3(direction.xz, direction.y);
  float low = cloudLayers[layer].x, high = low + cloudLayers[layer].y;
  // Factor the difference of squared radii instead of subtracting two ~1e11
  // numbers. Thin high clouds otherwise lose useful precision in float32.
  float b = dot(p, d), horizontal = dot(p.xy, p.xy);
  float earth = b * b - horizontal - origin.y * (2.0 * hexCloudPlanet + origin.y);
  if (b < 0.0 && earth > 0.0) {
    float ground = (horizontal + origin.y * (2.0 * hexCloudPlanet + origin.y)) / (-b + sqrt(earth));
    if (ground >= 0.0) limit = min(limit, ground);
  }
  float discriminant = b * b - horizontal + (high - origin.y) * (2.0 * hexCloudPlanet + high + origin.y);
  if (discriminant <= 0.0) return vec2(0.0);
  float root = sqrt(discriminant);
  float start = max(0.0, -b - root), end = min(limit, -b + root);
  float inner = b * b - horizontal + (low - origin.y) * (2.0 * hexCloudPlanet + low + origin.y);
  if (inner > 0.0) {
    float nearInner = -b - sqrt(inner), farInner = -b + sqrt(inner);
    if (hexCloudAltitude(origin) < low) start = max(start, farInner);
    else if (nearInner > start) end = min(end, nearInner);
    else if (farInner > start) start = max(start, farInner);
  }
  return end > start ? vec2(start, end) : vec2(0.0);
}
float hexCloudLayerDensity(vec3 position, int layer) {
  vec4 band = cloudLayers[layer];
  float y = hexCloudAltitude(position) - band.x;
  if (y <= 0.0 || y >= band.y) return 0.0;
  vec2 drifting = position.xz - cloudLayerWind[layer];
  float fraction = y / band.y;
  if (layer == 2) {
    vec2 curl = hexCloudCurl(drifting * 0.0004) * 0.5 +
      hexCloudCurl(drifting * 0.0008) * 0.25 + hexCloudCurl(drifting * 0.0016) * 0.125;
    float base = 0.7 * hexCloudNoise(drifting * 0.01024 + curl * 1.6) +
      0.3 * hexCloudNoise(drifting * 0.08192 + curl * 3.2);
    float cirrus = clamp((base - (0.7 - band.z)) / (0.3 + band.z), 0.0, 1.0);
    float frequency = 0.2048, amplitude = 0.2, bend = 40.96;
    for (int octave = 0; octave < 4; octave++) {
      if (cirrus <= 0.0) break;
      cirrus -= hexCloudNoise(drifting * frequency + curl * bend) * amplitude;
      frequency *= 2.0; amplitude *= 0.6; bend *= 4.0;
    }
    cirrus = max(0.0, cirrus);
    float height = 1.0 - abs(1.0 - 2.0 * fraction);
    float wisps = cirrus * cirrus * cirrus * height * height * 1.2;
    // Independent coverage keeps small high-cloud patches outside the wisps.
    float patches = smoothstep(1.0 - band.z - 0.1, 1.0 - band.z + 0.1,
      hexCloudNoise(drifting * 0.007 + vec2(27.0, 53.0)));
    float cells = smoothstep(0.45, 0.8, hexCloudNoise(drifting * 0.256 + curl * 13.5));
    cells = max(0.0, cells - 0.6 * hexCloudNoise(drifting * 0.512 + curl * 1.5));
    float cirrocumulus = cells * cells * cells * cells * patches * height * (0.12 + band.w * 0.15);
    return (wisps + cirrocumulus) * ${CIRRUS_DENSITY.toFixed(1)};
  }
  vec2 coverage = hexCloudMacro(drifting, layer);
  vec2 range = cloudCoverageRange[layer];
  float weatherCoverage = layer == 0 ? dot(range, vec2(0.25, 0.75)) : range.y;
  fraction *= 0.8 / mix(0.5, 1.0, smoothstep(0.4, 0.6, weatherCoverage));
  float sheet = clamp(fraction * 2.0, 0.0, 1.0) * clamp(fraction / 0.1, 0.0, 1.0) * clamp((1.0 - fraction) / 0.6, 0.0, 1.0);
  sheet *= 2.0 - sheet;
  float bottom = smoothstep(0.0, 0.2, fraction);
  if (layer == 1) {
    float regional = hexPhotonCloudNoise((drifting + cloudNoiseOffset) * 0.0001 + 0.01).r;
    float detail = hexPhotonCloudNoise((drifting + cloudNoiseOffset) * 0.002 + 0.6).a;
    float localCoverage = mix(range.x, range.y, regional * (2.0 - regional));
    float threshold = (1.0 - localCoverage) * (1.0 - localCoverage);
    float ac = clamp((coverage.x - threshold) / max(0.00001, 1.0 - threshold), 0.0, 1.0);
    ac -= 1.9 * (1.0 - detail) * (1.0 - detail) * (1.0 - ac * ac);
    ac = (ac - smoothstep(0.2, 1.0, fraction) * 0.6) * bottom;
    float deck = clamp((2.0 * regional * range.y - (0.9 - range.x)) / (0.1 + range.x), 0.0, 1.0);
    deck = deck * deck * (3.0 - 2.0 * deck);
    deck *= (0.5 + clamp((coverage.x - 0.3) / 0.3, 0.0, 1.0)) * (0.5 + clamp((coverage.y - 0.3) / 0.4, 0.0, 1.0));
    deck = deck / (1.0 + deck) * sheet;
    float upperDensity = mix(ac, deck, band.w);
    if (upperDensity <= 0.0) return 0.0;
    vec3 detailPosition = position * 0.06;
    detailPosition.xz -= cloudDetailDrift[layer].xy;
    float erosion = hexCloudDetail(detailPosition, 1.0);
    upperDensity = max(0.0, upperDensity - 0.2 * erosion * erosion * (1.0 - upperDensity * upperDensity) * (1.0 - 0.85 * band.w));
    vec2 edge = mix(vec2(3.0, 14.0), vec2(2.0, 7.0), band.w);
    float sharp = mix(edge.x, edge.y, fraction);
    upperDensity = upperDensity * (1.0 + sharp) / (1.0 + upperDensity * sharp);
    return upperDensity * mix(0.1, 1.0, smoothstep(0.2, 0.7, fraction));
  }
  float localCoverage = mix(range.x, range.y, coverage.x);
  float cu = clamp((coverage.y - (1.0 - localCoverage)) / max(0.00001, localCoverage), 0.0, 1.0);
  float st = clamp((2.0 * coverage.x * range.y - (0.9 - range.x)) / (0.1 + range.x), 0.0, 1.0);
  st = st * st * (3.0 - 2.0 * st);
  st *= 0.5 + clamp((coverage.y - 0.3) / 0.3, 0.0, 1.0);
  st /= st + 1.0;
  float fill = mix(cu, st, band.w);
  float crown = smoothstep(0.2, 1.0, fraction) * mix(0.6, 0.3, band.w);
  float density = max(0.0, mix(fill, fill * sheet, band.w) - crown) * bottom;
  if (density <= 0.0) return 0.0;
  // Photon uses different bubbly/swirl volumes, physical frequencies and
  // secondary wind advection. The R8 atlas keeps the existing sampler count.
  vec4 drift = cloudDetailDrift[layer];
  vec3 coarse = position * 0.018, fine = position * 0.1;
  coarse.xz -= drift.xy;
  fine.xz -= drift.zw;
  // Fold the planet's constant periodic y offset on the CPU, preserving fine
  // texture-coordinate precision instead of multiplying a ~6.4e6 m float.
  vec2 erosionNoise = vec2(
    hexCloudDetail(coarse + vec3(0, 0.9, 0), 0.0),
    hexCloudDetail(fine, 1.0));
  vec2 erosion = cloudDetailShape.xy;
  float fineWeight = 0.2 * smoothstep(0.85, 1.0, 1.0 - fraction) - 0.35 * smoothstep(0.05, 0.5, fraction) + 0.6;
  float edge = clamp(1.0 - density, 0.0, 1.0);
  density -= erosion.x * erosionNoise.x * erosionNoise.x * edge * (2.0 - edge);
  edge = clamp(1.0 - density, 0.0, 1.0);
  density -= erosion.y * erosionNoise.y * erosionNoise.y * edge * (2.0 - edge) * fineWeight;
  density = max(0.0, density);
  vec2 sharpness = cloudDetailShape.zw;
  float sharpening = mix(sharpness.x, sharpness.y, fraction);
  density = density * (1.0 + sharpening) / (1.0 + density * sharpening);
  density *= mix(0.1, 1.0, smoothstep(0.2, 0.7, fraction));
  return density;
}
float hexCloudLayerOpticalDepth(vec3 origin, vec3 direction, float reach, int layer, int steps) {
  float depth = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= steps) break;
    float a = float(i) / float(steps), b = float(i + 1) / float(steps);
    float start = a * a * reach, end = b * b * reach;
    depth += hexCloudLayerDensity(origin + direction * ((start + end) * 0.5), layer) * (end - start);
  }
  return depth;
}
float hexCloudShadow(vec3 point) {
  if (cloudEnabled < 0.5 || cloudLightDirection.y < 0.04) return 1.0;
  if (cloudVolumetric > 0.5) {
    float opticalDepth = 0.0;
    for (int layer = 0; layer < 3; layer++) {
      vec2 span = hexCloudInterval(point, cloudLightDirection, layer, cloudFar);
      if (span.y > span.x) opticalDepth += ${CLOUD_METRES_PER_UNIT.toFixed(1)} * cloudOptics[layer].x * hexCloudLayerOpticalDepth(point + cloudLightDirection * span.x, cloudLightDirection, span.y - span.x, layer, 4);
    }
    float transmission = exp(-opticalDepth);
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
