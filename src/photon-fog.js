// Adapted from Photon 6e67b36 weather/fog.glsl, shaders.properties and the
// default settings. Coefficients stay in the host's linear-sRGB/local units;
// the planetary sky's 20 m/unit mapping does not rescale this near-field fog.
// See public/licenses/PHOTON-NOTICE.md.
const clamp = (x) => Math.max(0, Math.min(1, x));
const linear = (a, b, x) => clamp((x - a) / (b - a));
const profile = (rgb, density) => rgb.map((c) => c ** 2.2 * density);
const profiles = [
  profile([0.31, 0.67, 1], 0.0005),
  profile([0.65, 0.8, 1], 0.0003),
  profile([0.5, 0.81, 1], 0.001),
  profile([0.4, 0.95, 1], 0.0013),
];
const biomeGroup = (name) =>
  name === '沙漠' ? 1 : name === '雪原' ? 2 : name === '丛林' ? 3 : 0;

// Spatial filtering, rather than a time-based transition, keeps a paused or
// freshly loaded view at the same biome boundary reproducible. A compact hex
// tent has zero weight at its radius, including across negative cell borders.
export class FogBiomes {
  constructor() {
    this.cells = new Map();
  }
  sample(world, position) {
    if (this.world !== world || this.dimension !== world.dimension) {
      this.world = world;
      this.dimension = world.dimension;
      this.cells.clear();
    }
    if (this.cells.size > 4096) this.cells.clear();
    const q = position.x / Math.sqrt(3) - position.z / 3,
      r = position.z / 1.5,
      weights = [0, 0, 0, 0];
    let total = 0;
    for (let x = Math.floor(q) - 1; x <= Math.floor(q) + 2; x++)
      for (let z = Math.floor(r) - 1; z <= Math.floor(r) + 2; z++) {
        const d = Math.max(
          Math.abs(x - q),
          Math.abs(z - r),
          Math.abs(x + z - q - r),
        );
        if (d >= 2) continue;
        const key = x + ',' + z;
        let group = this.cells.get(key);
        if (group === undefined) {
          group = biomeGroup(world.biome(x, z));
          this.cells.set(key, group);
        }
        const weight = (2 - d) ** 2;
        weights[group] += weight;
        total += weight;
      }
    return weights.map((v) => v / total);
  }
}

export function photonFogParameters({
  sunDirection,
  humidity,
  temperature,
  rain,
  biomes,
}) {
  const y = sunDirection.y,
    fade = y < 0.18 ? 0.37 + 1.2 * Math.max(0, -y) : 1.7,
    edge = clamp(1 - fade * Math.abs(y - 0.18)) ** 2,
    morning = sunDirection.x > 0 ? edge : 0,
    evening = sunDirection.x < 0 ? edge : 0,
    noon = y > 0 ? 1 - edge : 0,
    midnight = y < 0 ? 1 - edge : 0,
    blue = linear(0.05, 1, Math.exp(-190 * (y + 0.07283) ** 2)),
    wet = clamp(rain) * (biomes[0] + biomes[3]),
    snow = clamp(rain) * biomes[2],
    h = clamp(humidity),
    t = clamp(temperature);
  const rayleigh = profiles[0].map((v, c) => {
    const clear =
      biomes.reduce((sum, w, i) => sum + w * profiles[i][c], 0) * (1 + h * t);
    return clear * (1 - wet) + v * wet;
  });
  let mie =
    0.007 * morning +
    0.0001 * noon +
    0.005 * evening +
    0.005 * midnight +
    0.002 * blue;
  mie += 0.0008 * clamp(h / 0.8) ** 2;
  mie = mie * (1 - wet) + 0.03 * wet;
  mie = mie * (1 - snow) + 0.015 * snow;
  return {
    rayleigh,
    mieExtinction: mie,
    mieScattering: mie * (0.9 - 0.4 * wet),
    direct: 1 - 0.9 * clamp(rain),
    glow: 1 + 0.75 * linear(0.05, 1, Math.exp(-300 * (y + 0.02) ** 2)),
  };
}
