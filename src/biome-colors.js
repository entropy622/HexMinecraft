// Native biome equivalents use VoxeLibre's pinned palette indices. Imported
// Minecraft color maps use the temperature/downfall lookup instead.
export const BIOME_COLORS = {
  青翠平原: { temperature: 0.8, downfall: 0.4, grass: 0, foliage: 1 },
  森林: { temperature: 0.7, downfall: 0.8, grass: 13, foliage: 7 },
  白桦林: { temperature: 0.6, downfall: 0.6, grass: 15, foliage: 8 },
  丛林: { temperature: 0.95, downfall: 0.9, grass: 24, foliage: 12 },
  沙漠: { temperature: 2, downfall: 0, grass: 17, foliage: 3 },
  雪原: { temperature: 0, downfall: 0.5, grass: 10, foliage: 2 },
};
export const TINT_BASES = [
  null,
  [145, 185, 93],
  [121, 169, 77],
  [77, 144, 53],
  [136, 173, 84],
  [145, 185, 93],
];
const untinted = [0, 0, 0, 0];
export function biomeTintKind(tile) {
  if (tile === 'grass:top') return 1;
  if (tile === 'grass:side') return 4;
  if (tile.startsWith('leaves:')) return 2;
  if (tile.startsWith('jungleLeaves:')) return 3;
  if (tile === 'tuft') return 5;
  return 0;
}
export function colorMapIndex(temperature, downfall) {
  const t = Math.max(0, Math.min(1, temperature)),
    h = Math.max(0, Math.min(1, downfall)) * t;
  return (Math.floor((1 - h) * 255) << 8) | Math.floor((1 - t) * 255);
}
const offsets = [];
for (let q = -2; q <= 2; q++)
  for (let r = -2; r <= 2; r++)
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2)
      offsets.push([q, r]);

export class BiomeColors {
  constructor(defaults) {
    this.defaults = defaults;
    this.pack = null;
    this.world = null;
    this.byBiome = new Map();
    this.base = new Map();
    this.blended = new Map();
  }
  clear() {
    this.base.clear();
    this.blended.clear();
  }
  setPack(pack) {
    this.pack = pack;
    this.byBiome.clear();
    this.clear();
  }
  color(name, type) {
    const key = name + ':' + type;
    if (this.byBiome.has(key)) return this.byBiome.get(key);
    const climate = BIOME_COLORS[name] || BIOME_COLORS['青翠平原'],
      map = this.pack?.images.get('colormap:' + type),
      native = this.defaults[type];
    const image = map || native,
      index = map
        ? colorMapIndex(
            Math.fround(climate.temperature),
            Math.fround(climate.downfall),
          )
        : climate[type];
    const rgb = image
      ? [...image.data.slice(index * 4, index * 4 + 3)]
      : [...(type === 'grass' ? TINT_BASES[1] : TINT_BASES[2])];
    this.byBiome.set(key, rgb);
    return rgb;
  }
  tint(world, q, r, kind) {
    if (!kind) return untinted;
    if (this.world !== world || this.dimension !== world.dimension) {
      this.world = world;
      this.dimension = world.dimension;
      this.clear();
    }
    if (this.blended.size > 65536) this.clear();
    const key = q + ',' + r;
    let values = this.blended.get(key);
    if (!values) {
      const sums = [0, 0, 0, 0, 0, 0];
      for (const [dq, dr] of offsets) {
        const cell = q + dq + ',' + (r + dr);
        let colors = this.base.get(cell);
        if (!colors) {
          const name = world.biome(q + dq, r + dr);
          colors = [
            ...this.color(name, 'grass'),
            ...this.color(name, 'foliage'),
          ];
          this.base.set(cell, colors);
        }
        for (let c = 0; c < 6; c++) sums[c] += colors[c];
      }
      values = sums.map((v) => Math.floor(v / offsets.length));
      this.blended.set(key, values);
    }
    const start = kind === 2 || kind === 3 ? 3 : 0;
    values.tints ??= [];
    return (values.tints[kind] ??= [...values.slice(start, start + 3), kind]);
  }
}
