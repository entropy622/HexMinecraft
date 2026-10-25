import { hash, hexDistance, key } from './core.js';
import { TREES } from './wood-data.js';

// Shared by world generation and planted saplings. Trunks win over their own
// crowns, and every generated column is independent of chunk load order.
export function treeCells(species, q, base, r, seed = 1) {
  const tree = TREES[species] || TREES.oak,
    cells = new Map();
  const height =
    tree.height +
    (species === 'birch' || species === 'spruce'
      ? Number(hash(q, 777, r, seed) > 0.5)
      : 0);
  const put = (dq, y, dr, type) =>
    cells.set(key(q + dq, base + y, r + dr), [q + dq, base + y, r + dr, type]);
  if (species === 'spruce') {
    for (let y = 2; y <= height; y++) {
      let radius = Math.min(2, Math.floor((height - y) / 2) + 1);
      if (y === height) radius = 0;
      else if (y % 2) radius = Math.max(0, radius - 1);
      for (let dq = -radius; dq <= radius; dq++)
        for (let dr = -radius; dr <= radius; dr++)
          if (hexDistance(dq, dr) <= radius) put(dq, y, dr, tree.leaves);
    }
  } else {
    for (let y = height - 1; y <= height + 1; y++) {
      const radius = y === height + 1 ? 1 : 2;
      for (let dq = -radius; dq <= radius; dq++)
        for (let dr = -radius; dr <= radius; dr++)
          if (hexDistance(dq, dr) <= radius) put(dq, y, dr, tree.leaves);
    }
  }
  for (let y = 0; y < height; y++) put(0, y, 0, tree.log);
  return [...cells.values()];
}
