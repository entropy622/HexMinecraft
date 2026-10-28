import { DYES } from './dye-data.js';
import { woolItem } from './wool-data.js';

export const CARPET_BLOCKS = Object.fromEntries(
  Object.entries(DYES).map(([color, def]) => [
    color + 'Carpet',
    {
      name: def.name + '地毯',
      color: def.color,
      hardness: 0.1,
      shape: 'carpet',
      tile: woolItem(color),
    },
  ]),
);
export const isCarpet = (id) => Object.hasOwn(CARPET_BLOCKS, id);
export const CARPET_RECIPES = Object.entries(DYES).map(([color, def]) => ({
  id: color + 'Carpet',
  count: 3,
  title: def.name + '地毯',
  desc: '两块同色羊毛铺成三张薄地毯；下方需要方块或液体支撑。',
  pattern: [null, null, null, woolItem(color), null, null, woolItem(color)],
  cost: { [woolItem(color)]: 2 },
}));

// Carpets sit at the cell bottom even over lower slabs or thin supports.
// Unlike redstone attachments, they need no full face, only a non-air cell.
export const carpetSupport = (world, q, y, r) =>
  !!(world.get(q, y - 1, r) || world.fluids.get(q, y - 1, r));
