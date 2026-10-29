export const CLOUD_RADIUS = 4;
export const CLOUD_BASE = 52;
// Shared with the atmosphere's conversion of 20 metres per local world unit.
export const CLOUD_PLANET_RADIUS = 6371000 / 20;
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
  const wind = 0.7 + noise(time / 1400, 43, seed) * 0.6;
  const stratus = Math.max(
    0,
    Math.min(1, (humidity - temperature * 0.35 - 0.28) * 1.7 + storm * 0.25),
  );
  return {
    humidity,
    stratus,
    coverage: [
      Math.max(
        0.2,
        Math.min(0.94, 0.33 + humidity * 0.18 + rain * 0.3 + storm * 0.08),
      ),
      Math.max(0.12, Math.min(0.9, 0.2 + humidity * 0.23 + stratus * 0.16)),
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
export const cloudFieldGLSL = /* glsl */ `
uniform sampler2D cloudNoise;
uniform highp sampler3D cloudWorley;
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
uniform vec4 cloudLayers[3]; // base, thickness, coverage, stratus blend
uniform vec2 cloudLayerWind[3];
uniform vec2 cloudCurvatureOrigin;
uniform float cloudShear;
const float hexCloudPlanet = ${CLOUD_PLANET_RADIUS.toFixed(1)};
float hexCloudRandom(vec2 p) {
  return texelFetch(cloudNoise, ivec2(mod(p, 127.0)), 0).r * (255.0 / 126.0);
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
    vec2 p = drifting * 0.013;
    vec2 warp = vec2(hexCloudNoise(p * 0.23), hexCloudNoise(p * 0.23 + 41.0));
    p += (warp - 0.5) * 5.0;
    float macro = hexCloudNoise(p * 0.3);
    float fibers = hexCloudNoise(vec2(p.x * 0.55 + p.y * 0.3, p.y * 5.0));
    float ripples = hexCloudNoise(p * vec2(2.4, 4.8));
    float sheet = smoothstep(1.0 - band.z - 0.12, 1.0 - band.z + 0.18, macro);
    float cirrus = sheet * smoothstep(0.3, 0.8, fibers) * 0.055;
    // Cirrocumulus has its own coverage: mixing its ripples into the fiber
    // detail left both types absent inside every large cirrus coverage hole.
    float patches = hexCloudNoise(p * 0.57 + vec2(27.0, 53.0));
    float broken = smoothstep(1.0 - band.z - 0.1, 1.0 - band.z + 0.1, patches);
    float cells = smoothstep(0.35, 0.8, ripples);
    float cirrocumulus = broken * cells * cells * (0.02 + band.w * 0.05);
    return (cirrus + cirrocumulus) * sin(fraction * 3.14159265);
  }
  float scale = layer == 0 ? 1.0 : 2.8;
  vec2 p = drifting * scale / cloudRadius;
  vec2 h = vec2(p.x / 1.732050808 - p.y / 3.0, p.y / 1.5);
  float macro = hexCloudDensity(h + vec2(float(layer) * 37.0));
  float regional = hexCloudNoise(drifting * 0.0025 + float(layer) * 17.0);
  float cover = macro * 0.82 + regional * 0.18;
  float fill = clamp((cover - (1.0 - band.z) + 0.09) * 4.6, 0.0, 1.0);
  fraction /= mix(0.5 + macro * 0.5, 1.0, band.w * 0.75);
  if (fraction >= 1.0 || fill <= 0.0) return 0.0;
  vec3 detailPosition = vec3(drifting * (layer == 0 ? 0.022 : 0.06), y * 0.11);
  detailPosition.xy += fraction * vec2(0.055, -0.024) * cloudShear;
  float bubbles = textureLod(cloudWorley, detailPosition, 0.0).r * 0.72 + textureLod(cloudWorley, detailPosition * 2.7 + 0.31, 0.0).r * 0.28;
  float profile = smoothstep(0.0, 0.13, fraction) * (1.0 - smoothstep(0.48, 1.0, fraction));
  float erosion = mix(0.66, 0.27, band.w);
  return max(0.0, fill - (1.0 - bubbles) * erosion) * profile * (layer == 0 ? 1.0 : 0.48);
}
float hexCloudLayerOpticalDepth(vec3 origin, vec3 direction, float reach, int layer) {
  float depth = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) / 4.0, b = float(i + 1) / 4.0;
    float start = a * a * reach, end = b * b * reach;
    depth += hexCloudLayerDensity(origin + direction * ((start + end) * 0.5), layer) * (end - start);
  }
  return depth;
}
float hexCloudShadow(vec3 point) {
  if (cloudEnabled < 0.5 || cloudLightDirection.y < 0.04) return 1.0;
  if (cloudVolumetric > 0.5) {
    float depth = 0.0;
    for (int layer = 0; layer < 3; layer++) {
      vec2 span = hexCloudInterval(point, cloudLightDirection, layer, cloudFar);
      if (span.y > span.x) depth += hexCloudLayerOpticalDepth(point + cloudLightDirection * span.x, cloudLightDirection, span.y - span.x, layer);
    }
    float transmission = exp(-hexCloudExtinction * depth);
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
