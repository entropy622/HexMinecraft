import { BLOCKS, ITEMS, DIRECTIONS, hexDistance, hash } from './core.js';
import { ENCHANTS, compatibleEnchants } from './enchanting-data.js';

export function bookshelfPower(world, q, y, r) {
  let count = 0;
  for (let dq = -2; dq <= 2; dq++)
    for (let dr = -2; dr <= 2; dr++) {
      if (hexDistance(dq, dr) !== 2) continue;
      const clear = DIRECTIONS.some(
        ([a, b]) =>
          hexDistance(dq - a, dr - b) === 1 &&
          [0, 1].every(
            (dy) =>
              !world.get(q + a, y + dy, r + b) &&
              !world.fluids.get(q + a, y + dy, r + b),
          ),
      );
      if (clear)
        for (const dy of [0, 1])
          if (world.get(q + dq, y + dy, r + dr) === 'bookshelf') count++;
    }
  return Math.min(18, count);
}
export function enchantOffers(item, seed, shelves) {
  const def = ITEMS[item];
  if (!def?.durability || BLOCKS[item]) return [];
  const pool = Object.keys(ENCHANTS).filter((key) =>
    ENCHANTS[key].accepts(def),
  );
  const stringCode = (text) =>
    [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 0);
  const code = stringCode(item);
  return [0, 1, 2].map((tier) => {
    const keys = [...pool].sort(
      (a, b) =>
        hash(code, seed, tier, stringCode(a)) -
        hash(code, seed, tier, stringCode(b)),
    );
    const enchants = {};
    const count = tier === 2 ? 2 : 1;
    for (const key of keys) {
      if (!compatibleEnchants({ ...enchants, [key]: 1 })) continue;
      const max = ENCHANTS[key].max;
      const minimum = Math.min(
        max,
        tier === 0
          ? 1
          : tier === 1
            ? Math.max(1, max - 2)
            : Math.max(2, max - 2),
      );
      const ceiling =
        tier === 0 ? Math.min(2, max) : tier === 1 ? Math.max(1, max - 1) : max;
      enchants[key] =
        minimum +
        Math.floor(
          hash(code, seed + stringCode(key), tier, 877) *
            (ceiling - minimum + 1),
        );
      if (Object.keys(enchants).length >= count) break;
    }
    return {
      enchants,
      cost: tier + 1,
      levels: [8, 16, 30][tier],
      shelves: [0, 6, 18][tier],
      available: shelves >= [0, 6, 18][tier],
    };
  });
}
