import { BLOCKS } from './core.js';

// Subtle pixel relief, with per-material roughness. These are native-only
// numerical channels, not labPBR: RG tangent normal, B roughness, A height.
// Imported colour never inherits relief from an unrelated native bitmap.
export function nativeMaterialProfile(tile) {
  const [id, face] = tile.split(':'),
    base = BLOCKS[id]?.base || id;
  if (BLOCKS[base]?.log)
    return {
      kind: face === 'top' ? 'rings' : /[Bb]irch/.test(base) ? 'birch' : 'bark',
      relief: 0.28,
      roughness: 0.7,
    };
  if (/^(?:planks|birchPlanks|sprucePlanks|junglePlanks)$/.test(base))
    return { kind: 'grain', relief: 0.26, roughness: 0.58 };
  if (
    /(?:Ore)$/.test(base) &&
    !['netherQuartzOre', 'redstoneOre'].includes(base)
  )
    return { kind: 'ore', relief: 0.22, roughness: 0.76 };
  if (['dirt', 'gravel', 'sand', 'soulSand'].includes(base))
    return { kind: 'soil', relief: 0.18, roughness: 0.9 };
  if (
    [
      'stone',
      'cobble',
      'cobbledDeepslate',
      'deepslate',
      'brick',
      'mossybrick',
      'sandstone',
      'netherbrick',
      'endstone',
      'endstoneBricks',
      'netherrack',
      'basalt',
      'bedrock',
      'tuff',
      'calcite',
      'smoothStone',
      'smoothStoneSlab',
    ].includes(base)
  )
    return {
      kind: 'mineral',
      relief: base === 'smoothStone' ? 0.1 : 0.24,
      roughness:
        base === 'calcite' ? 0.62 : base === 'smoothStone' ? 0.65 : 0.8,
    };
  return null;
}

export function createNativeMaterialDetail(tile, image) {
  const profile = nativeMaterialProfile(tile);
  if (!profile) return null;
  const { width: size, height, data: rgba } = image;
  if (size !== height || rgba.length !== size * size * 4)
    throw Error('Native detail needs a square RGBA tile');
  const values = new Float32Array(size * size),
    chroma = new Float32Array(values.length);
  let lo = 1,
    hi = 0;
  for (let i = 0; i < values.length; i++) {
    // Native detail is restricted to opaque, non-emissive hard surfaces.
    if (rgba[i * 4 + 3] !== 255) return null;
    const r = rgba[i * 4] / 255,
      g = rgba[i * 4 + 1] / 255,
      b = rgba[i * 4 + 2] / 255;
    const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    values[i] = v;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const relief = new Float32Array(values.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x,
        v = hi - lo > 0.025 ? (values[i] - lo) / (hi - lo) : 0.5;
      const level = Math.round(v * 4) / 4;
      switch (profile.kind) {
        // Birch's dark marks are pigment; do not turn them into deep cavities.
        case 'birch':
          relief[i] = 0.5 + 0.08 * Math.cos(x * Math.PI * 0.5);
          break;
        case 'grain':
          relief[i] = 0.25 + 0.5 * level;
          break;
        case 'bark':
          relief[i] = v < 0.24 ? 0.2 : 0.55 + 0.15 * level;
          break;
        case 'ore':
          relief[i] = 0.35 + 0.15 * level + Math.min(1, chroma[i] * 3) * 0.18;
          break;
        case 'soil':
          relief[i] = 0.4 + 0.22 * level;
          break;
        default:
          relief[i] = 0.3 + 0.4 * level;
      }
    }
  const sample = (x, y) =>
      relief[((y + size) % size) * size + ((x + size) % size)],
    out = new Uint8Array(rgba.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x,
        nx = (sample(x - 1, y) - sample(x + 1, y)) * profile.relief,
        ny = (sample(x, y + 1) - sample(x, y - 1)) * profile.relief;
      const inv = 1 / Math.hypot(nx, ny, 1);
      // Ore deposits get a restrained glint; the surrounding stone stays matte.
      const deposit = profile.kind === 'ore' ? Math.min(1, chroma[i] * 3) : 0;
      const roughness = Math.max(
        0.32,
        Math.min(
          0.98,
          profile.roughness - deposit * 0.22 + (relief[i] - 0.5) * 0.1,
        ),
      );
      out.set(
        [
          Math.round((nx * inv * 0.5 + 0.5) * 255),
          Math.round((ny * inv * 0.5 + 0.5) * 255),
          Math.round(roughness * 255),
          Math.round(relief[i] * 255),
        ],
        i * 4,
      );
    }
  return { width: size, height: size, data: out };
}
