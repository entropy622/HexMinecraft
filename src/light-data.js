import { BLOCKS, key } from './core.js';
import { GLASS_TYPES, isGlass } from './dye-data.js';
import { isDoor, isTrapdoor } from './building-data.js';
import { isCampfire } from './campfire-data.js';
import { FURNACES, isFurnace } from './processing-data.js';

// Shared by invalidation and transport. Geometry, growth and circuit state can
// change without changing any of the light volume's optical properties.
export const EMISSION = {
  caveVinesBerries: [14, 10, 5],
  redstoneLamp: [15, 13, 9],
  redstoneTorch: [7, 2, 1],
  campfire: [15, 10, 5],
  soulCampfire: [6, 11, 12],
  endRod: [15, 14, 15],
  torch: [14, 11, 7],
  lantern: [15, 13, 9],
  glowstone: [15, 13, 9],
  crystal: [6, 11, 10],
  ...Object.fromEntries(Object.keys(FURNACES).map((id) => [id, [13, 9, 5]])),
  portal: [11, 6, 15],
  endportal: [7, 14, 12],
  spawner: [10, 5, 13],
  lava: [15, 10, 5],
  lavaCauldron: [15, 10, 5],
  glow: [7, 15, 12],
  enchantingTable: [8, 5, 13],
  brewingStand: [3, 2, 1],
};

// Bits: cost 5, medium 4, emission RGB 12, glass palette 5. The palette must
// invalidate uploads even when a change of glass leaves transport unchanged.
const LIGHT_DATA = Object.fromEntries(
  Object.entries(BLOCKS).map(([type, block]) => {
    const glass = isGlass(type),
      cost = block.foliage
        ? 3
        : glass || block.shape === 'carpet'
          ? 1
          : isDoor(type) || ['dropper', 'observer'].includes(block.shape)
            ? 16
            : isTrapdoor(type)
              ? 3
              : block.shape
                ? 2
                : block.nonSolid
                  ? 1
                  : 16,
      medium = glass
        ? 14
        : block.foliage
          ? 12
          : cost > 1 && cost < 16 && !block.nonSolid
            ? 13
            : 0,
      [r, g, b] = EMISSION[type] || [0, 0, 0];
    return [
      type,
      cost |
        (medium << 5) |
        (r << 9) |
        (g << 13) |
        (b << 17) |
        (glass ? GLASS_TYPES.indexOf(type) << 21 : 0),
    ];
  }),
);

export function blockLight(world, q, y, r, type = world.get(q, y, r), state) {
  let data = LIGHT_DATA[type] ?? 1;
  if (isDoor(type) || isTrapdoor(type)) {
    state ??= world.state(q, y, r);
    if (state.open) data = (data & ~511) | 1;
  }
  if (
    (isFurnace(type) && !(world.furnaces.get(key(q, y, r))?.burn > 0)) ||
    (isCampfire(type) && !world.campfires.get(key(q, y, r))?.lit) ||
    (type === 'redstoneLamp' && !(state ?? world.state(q, y, r)).powered) ||
    (type === 'redstoneTorch' &&
      (state ?? world.state(q, y, r)).powered === false)
  )
    data &= ~(4095 << 9);
  return data;
}
