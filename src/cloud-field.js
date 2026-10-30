import { CLOUD_METRES_PER_UNIT, CIRRUS_DENSITY } from './cloud-optics.js';
export const CLOUD_RADIUS = 4;
export const CLOUD_BASE = 52;
export const CLOUD_NOISE_SCALE = 255 / 126;
export const CLOUD_COVERAGE_SIZE = 1024;
export const CLOUD_COVERAGE_SPANS = [512, 256];
export const CLOUD_COVERAGE_HEADER = 128;
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
  const temperature = Math.max(
    0,
    Math.min(1, heat + Math.sin((time * Math.PI) / 300) * 0.06),
  );
  const humidity = Math.max(
    0,
    Math.min(
      1,
      wet +
        rain * 0.34 +
        storm * 0.12 +
        noise(time / 900, 7, seed) * 0.12 -
        0.06,
    ),
  );
  const breeze = noise(time / 1400, 43, seed),
    wind = 0.7 + breeze * 0.6;
  const cold = Math.max(0, Math.min(1, (0.5 - temperature) * 2)),
    calm = 1 - breeze,
    upperCold = Math.max(0, Math.min(1, (0.5 - temperature) / 0.16));
  const stratus = Math.max(
    0,
    Math.min(1, cold * (2 - cold) * calm * (2 - calm) + storm * 0.25),
  );
  const altoStratus = upperCold * upperCold * (3 - 2 * upperCold);
  return {
    temperature,
    humidity,
    stratus,
    altoStratus,
    coverage: [
      Math.max(
        0.2,
        Math.min(0.94, 0.33 + humidity * 0.18 + rain * 0.3 + storm * 0.08),
      ),
      Math.max(0.12, Math.min(0.9, 0.2 + humidity * 0.23 + altoStratus * 0.16)),
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

// A small, periodic, independently generated Worley field. No upstream texture
// is shipped; both density erosion octaves sample this same R8 volume.
export function cloudWorleyData(seed) {
  const size = 64,
    cells = 8,
    data = new Uint8Array(size ** 3);
  const points = new Float32Array(cells ** 3 * 3);
  for (let i = 0; i < cells ** 3; i++) {
    const x = i % cells,
      y = Math.floor(i / cells) % cells,
      z = Math.floor(i / cells ** 2);
    points.set(
      [
        random(x + z * 11, y + z * 7, seed),
        random(y + z * 3, x + 37, seed + 17),
        random(x + y * 5, z + 61, seed + 43),
      ],
      i * 3,
    );
  }
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const px = ((x + 0.5) * cells) / size,
          py = ((y + 0.5) * cells) / size,
          pz = ((z + 0.5) * cells) / size;
        const cx = Math.floor(px),
          cy = Math.floor(py),
          cz = Math.floor(pz);
        let nearest = 3;
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const x1 = cx + dx,
                y1 = cy + dy,
                z1 = cz + dz;
              const i =
                (mod(z1, cells) * cells ** 2 +
                  mod(y1, cells) * cells +
                  mod(x1, cells)) *
                3;
              const d =
                (x1 + points[i] - px) ** 2 +
                (y1 + points[i + 1] - py) ** 2 +
                (z1 + points[i + 2] - pz) ** 2;
              nearest = Math.min(nearest, d);
            }
        data[(z * size + y) * size + x] = Math.round(
          Math.max(0, 1 - Math.sqrt(nearest) / 1.25) * 255,
        );
      }
  return data;
}

// Integer-sized arithmetic stays below the float exact-integer limit. CPU
// geometry and GPU shadows sample the same seeded field and drifting hex grid.
export const cloudMacroGLSL = /* glsl */ `
uniform highp sampler2D cloudNoise;
uniform float cloudNoiseScale;
uniform float cloudRadius;
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
  vec2 p = drifting * (layer == 0 ? 1.0 : 2.8) / cloudRadius;
  vec2 h = vec2(p.x / 1.732050808 - p.y / 3.0, p.y / 1.5);
  return vec2(hexCloudDensity(h + vec2(float(layer) * 37.0)),
    hexCloudNoise(drifting * 0.0025 + float(layer) * 17.0));
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
uniform vec4 cloudOptics[3]; // extinction / metre, albedo, stratus, layer response
uniform vec2 cloudLayerWind[3];
uniform vec2 cloudCurvatureOrigin;
uniform float cloudShear;
uniform float cloudCoverageReady;
uniform vec2 cloudCoverageOrigin[2];
const float hexCloudPlanet = ${CLOUD_PLANET_RADIUS.toFixed(1)};
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
  float macro = coverage.x, regional = coverage.y;
  // The weather controls layer depth. Applying the local coverage a second
  // time to altitude squeezed every footprint into a tall pointed column.
  float thickness = min(1.0, mix(0.5, 1.0, smoothstep(0.4, 0.6, band.z)) / 0.8);
  fraction /= thickness;
  if (fraction >= 1.0) return 0.0;
  float sheet = clamp(fraction * 2.0, 0.0, 1.0) * clamp(fraction / 0.1, 0.0, 1.0) * clamp((1.0 - fraction) / 0.6, 0.0, 1.0);
  sheet *= 2.0 - sheet;
  float bottom = smoothstep(0.0, 0.2, fraction);
  float profile = 1.0 - smoothstep(0.88, 1.0, fraction);
  if (layer == 1) {
    // A separate patch/sheet mixture gives the upper deck its own morphology.
    // Reuse the cached base and seed header; no additional texture or sampler.
    float localCoverage = clamp(band.z + (regional - 0.5) * 0.25, 0.05, 0.95);
    float threshold = (1.0 - localCoverage) * (1.0 - localCoverage);
    float ac = clamp((macro - threshold) / (1.0 - threshold), 0.0, 1.0);
    float detail = hexCloudNoise(drifting * 0.12 + vec2(71.0, 29.0));
    ac -= 1.9 * (1.0 - detail) * (1.0 - detail) * (1.0 - ac * ac);
    ac = max(0.0, ac - smoothstep(0.2, 1.0, fraction) * 0.6) * bottom;
    float deck = clamp((2.0 * regional * band.z - (0.9 - band.z)) / (0.1 + band.z), 0.0, 1.0);
    deck = deck * deck * (3.0 - 2.0 * deck);
    deck *= (0.5 + smoothstep(0.3, 0.6, macro)) * (0.5 + smoothstep(0.3, 0.7, detail));
    deck = deck / (1.0 + deck) * sheet;
    float upperDensity = mix(ac, deck, band.w);
    if (upperDensity <= 0.0) return 0.0;
    float erosion = 1.0 - textureLod(cloudWorley, vec3(drifting.x, y, drifting.y) * 0.06, 0.0).r;
    upperDensity = max(0.0, upperDensity - 0.2 * erosion * erosion * (1.0 - upperDensity * upperDensity) * (1.0 - 0.85 * band.w));
    vec2 edge = mix(vec2(3.0, 14.0), vec2(2.0, 7.0), band.w);
    float sharp = mix(edge.x, edge.y, fraction);
    upperDensity = upperDensity * (1.0 + sharp) / (1.0 + upperDensity * sharp);
    return upperDensity * mix(0.1, 1.0, smoothstep(0.2, 0.7, fraction)) * profile * 0.48;
  }
  float cover = macro * 0.82 + regional * 0.18;
  float fill = clamp((cover - (1.0 - band.z)) / max(0.18, band.z * 0.75), 0.0, 1.0);
  float crown = smoothstep(0.2, 1.0, fraction) * mix(0.6, 0.3, band.w);
  float density = max(0.0, mix(fill, fill * sheet, band.w) - crown) * bottom;
  if (density <= 0.0) return 0.0;
  // ~139 m cells at the shared 20 m/local scale. The former ~416 m cells
  // gave a deep cloud too few independent billows along its vertical axis.
  vec3 detailPosition = vec3(drifting.x, y, drifting.y) * 0.018;
  detailPosition.xz += fraction * vec2(0.12, -0.06) * cloudShear;
  vec2 erosionNoise = 1.0 - vec2(textureLod(cloudWorley, detailPosition, 0.0).r,
    textureLod(cloudWorley, detailPosition * 5.4 + 0.31, 0.0).r);
  // Erode the envelope with independent coarse billows and smaller wisps.
  // Dense interiors survive; fragmented edges retain detail with two samples.
  vec2 erosion = mix(vec2(0.33, 0.40), vec2(0.07, 0.10), vec2(band.w * band.w, band.w));
  float fineWeight = 0.2 * smoothstep(0.85, 1.0, 1.0 - fraction) - 0.35 * smoothstep(0.05, 0.5, fraction) + 0.6;
  float edge = 1.0 - density * density;
  density = max(0.0, density - dot(erosionNoise * erosionNoise, erosion * vec2(1.0, fineWeight)) * edge);
  vec2 sharpness = mix(vec2(3.0, 12.0), vec2(2.0, 7.0), band.w * band.w);
  float sharpening = mix(sharpness.x, sharpness.y, fraction);
  density = density * (1.0 + sharpening) / (1.0 + density * sharpening);
  density *= mix(0.1, 1.0, smoothstep(0.2, 0.7, fraction));
  return density * profile;
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
