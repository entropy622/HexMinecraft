import { BLOCKS } from './core.js';
import { isGlass } from './dye-data.js';
import { isWool } from './wool-data.js';

// Subtle pixel relief, with per-material roughness. These are native-only
// numerical channels, not labPBR: RG tangent normal, B roughness, A height.
// Imported colour never inherits relief from an unrelated native bitmap.
export function nativeMaterialProfile(tile) {
  const profile = reliefProfile(tile);
  if (!profile) return null;
  const id = tile.split(':')[0];
  return {
    ...profile,
    depth: parallaxDepth(profile, BLOCKS[id]?.tile || BLOCKS[id]?.base || id),
  };
}

// POM depth span as a fraction of the 0.25-block maximum. Joints, grain and
// bark carry readable height; luminance noise on plain stone and soil stays
// shallow so it does not turn into lumps at grazing angles.
const MASONRY = new Set([
  'cobble',
  'cobbledDeepslate',
  'brick',
  'mossybrick',
  'netherbrick',
  'endstoneBricks',
]);
const KIND_DEPTH = {
  grain: 0.35,
  bark: 0.45,
  rings: 0.2,
  birch: 0.15,
  ore: 0.25,
  cloth: 0.2,
  soil: 0.12,
  organic: 0.12,
};
function parallaxDepth(profile, base) {
  if (profile.kind === 'leaf') return 0;
  if (profile.kind === 'mineral') return MASONRY.has(base) ? 0.45 : 0.12;
  return KIND_DEPTH[profile.kind] ?? 0.08;
}

function reliefProfile(tile) {
  const [id, face] = tile.split(':'),
    base =
      BLOCKS[id]?.tile ||
      BLOCKS[id]?.base ||
      (BLOCKS[id]?.cauldronLiquid ? 'cauldron' : id),
    def = BLOCKS[base];
  if (def?.foliage) return { kind: 'leaf', relief: 0.42, roughness: null };
  if (
    isGlass(base) ||
    def?.nonSolid ||
    [
      'glowstone',
      'lantern',
      'endRod',
      'glowBerry',
      'sporeCenter',
      'redstoneLamp',
      'redstoneLampOn',
      'redstoneWire',
      'redstoneWireOn',
      'redstoneTorch',
      'portal',
      'endportal',
      'endGateway',
    ].includes(base) ||
    /Lit$|Output/.test(base)
  )
    return null;
  if (isWool(base) || base === 'bed')
    return { kind: 'cloth', relief: 0.16, roughness: 0.94 };
  if (
    def?.wooden ||
    [
      'workbench',
      'chest',
      'bookshelf',
      'pistonRod',
      'campfireLog',
      'grindstoneFrame',
    ].includes(base)
  )
    return { kind: 'grain', relief: 0.2, roughness: 0.65 };
  if (
    [
      'ironBlock',
      'goldBlock',
      'copperBlock',
      'rawIronBlock',
      'rawGoldBlock',
      'rawCopperBlock',
      'anvil',
      'chippedAnvil',
      'damagedAnvil',
      'anvilBase',
      'cauldron',
      'hopper',
      'brewingBase',
    ].includes(base)
  )
    return { kind: 'metal', relief: 0.12, roughness: null };
  if (
    def?.amethyst ||
    [
      'obsidian',
      'diamondBlock',
      'crystal',
      'purpur',
      'purpurPillar',
      'enchantingTable',
    ].includes(base)
  )
    return { kind: 'gem', relief: 0.1, roughness: null };
  if (['snow', 'powderSnow'].includes(base))
    return { kind: 'frost', relief: 0.12, roughness: null };
  if (
    ['grass', 'farmland', 'mossBlock', 'hayBale', 'cactus', 'shroom'].includes(
      base,
    )
  )
    return { kind: 'organic', relief: 0.14, roughness: 0.86 };
  if (
    /^(?:furnace|blastFurnace|smoker|stonecutter|grindstone|dispenser|dropper|observer|piston|stickyPiston|comparator|repeater|stoneButton|stonePressurePlate)/.test(
      base,
    )
  )
    return { kind: 'mineral', relief: 0.16, roughness: 0.74 };
  if (BLOCKS[base]?.log)
    return {
      kind: face === 'top' ? 'rings' : /[Bb]irch/.test(base) ? 'birch' : 'bark',
      relief: 0.28,
      roughness: 0.7,
    };
  if (/^(?:planks|birchPlanks|sprucePlanks|junglePlanks)$/.test(base))
    return { kind: 'grain', relief: 0.26, roughness: 0.58 };
  if (/(?:Ore)$/.test(base))
    return {
      kind: 'ore',
      relief: 0.22,
      roughness: ['netherQuartzOre', 'redstoneOre'].includes(base)
        ? null
        : 0.76,
    };
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
      'smoothBasalt',
      'coalBlock',
      'dripstoneBlock',
      'pointedDripstone',
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
  if (profile.kind === 'leaf') {
    // Pigment changes within a leaf bend its normal. A hole has no surface:
    // extend the center pigment into it instead of beveling a black cut edge.
    const data = new Uint8Array(rgba.length);
    const pigment = (i) =>
      (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = 4 * (y * size + x),
          center = pigment(i);
        const neighbor = (dx, dy) => {
          const j =
            4 * (((y + dy + size) % size) * size + ((x + dx + size) % size));
          return rgba[j + 3] >= 128 ? pigment(j) : center;
        };
        const k = rgba[i + 3] >= 128 ? profile.relief : 0;
        const nx = k * (neighbor(-1, 0) - neighbor(1, 0)),
          ny = k * (neighbor(0, 1) - neighbor(0, -1));
        const inv = 1 / Math.hypot(nx, ny, 1);
        data.set(
          [
            Math.round(127.5 * (1 + nx * inv)),
            Math.round(127.5 * (1 + ny * inv)),
            0,
            255,
          ],
          i,
        );
      }
    return { width: size, height: size, data, preserveOptics: true };
  }
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
        case 'cloth':
          relief[i] =
            0.5 + (x % 4 < 2 ? 0.08 : -0.08) + (y % 4 < 2 ? 0.08 : -0.08);
          break;
        case 'metal':
        case 'gem':
          relief[i] = 0.45 + 0.12 * level;
          break;
        case 'frost':
          relief[i] = 0.5 + 0.05 * level;
          break;
        case 'organic':
          relief[i] = 0.42 + 0.15 * level;
          break;
        default:
          relief[i] = 0.3 + 0.4 * level;
      }
    }
  const sample = (x, y) =>
      relief[((y + size) % size) * size + ((x + size) % size)],
    out = new Uint8Array(rgba.length);
  // Height is labPBR-like for POM: the highest texel is the face itself and
  // the depth span follows the material's normal strength.
  let top = 0,
    bottom = 1;
  for (const r of relief) {
    top = Math.max(top, r);
    bottom = Math.min(bottom, r);
  }
  const span = top - bottom > 1e-6 ? profile.depth / (top - bottom) : 0;
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
          (profile.roughness ?? 1) - deposit * 0.22 + (relief[i] - 0.5) * 0.1,
        ),
      );
      out.set(
        [
          Math.round((nx * inv * 0.5 + 0.5) * 255),
          Math.round((ny * inv * 0.5 + 0.5) * 255),
          Math.round(roughness * 255),
          Math.round((1 - (top - relief[i]) * span) * 255),
        ],
        i * 4,
      );
    }
  return {
    width: size,
    height: size,
    data: out,
    preserveOptics: profile.roughness === null,
  };
}
