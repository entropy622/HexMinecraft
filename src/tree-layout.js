import { DIRECTIONS, hash, hexDistance, key } from './core.js';
import { TREES } from './wood-data.js';

// Shared by world generation and planted saplings. Trunks win over their own
// crowns, and every generated column is independent of chunk load order.
export function treeCells(species, q, base, r, seed = 1) {
  const tree = TREES[species] || TREES.oak,
    cells = new Map();
  const broadleaf = species === 'oak' || species === 'birch',
    branched = species === 'oak' && hash(q, 749, r, seed) > 0.82;
  const height =
    (branched ? 7 : tree.height) +
    (species === 'jungle'
      ? Math.floor(hash(q, 777, r, seed) * 5)
      : broadleaf
        ? Math.floor(hash(q, 777, r, seed) * 3)
        : species === 'spruce'
          ? Number(hash(q, 777, r, seed) > 0.5)
          : 0);
  const put = (dq, y, dr, type, axis = 0) => {
    const cell = [q + dq, base + y, r + dr, type];
    if (axis) cell.push(axis);
    cells.set(key(q + dq, base + y, r + dr), cell);
  };
  const branches = [];
  if (broadleaf) {
    // Four rounded rows with independently clipped hex corners. Keep the
    // footprint within the world's existing three-column generation halo.
    const crown = (cq, top, cr, wide) => {
      for (let row = -3; row <= 0; row++) {
        const radius = row < -1 && wide ? 2 : 1;
        for (let dq = -radius; dq <= radius; dq++)
          for (let dr = -radius; dr <= radius; dr++) {
            const distance = hexDistance(dq, dr),
              corner = !dq || !dr || dq === -dr,
              chance = row === 0 ? 0.55 : row === -3 ? 0.25 : corner ? 0.2 : 0;
            if (
              distance > radius ||
              hexDistance(cq + dq, cr + dr) > 3 ||
              (distance === radius &&
                hash(q + cq + dq, top + row + 811, r + cr + dr, seed) < chance)
            )
              continue;
            put(cq + dq, top + row, cr + dr, tree.leaves);
          }
      }
    };
    crown(0, height + 1, 0, true);
    if (branched) {
      const direction = Math.floor(hash(q, 823, r, seed) * 6);
      for (const [turn, drop] of [
        [0, 0],
        [2 + Number(hash(q, 829, r, seed) > 0.5), 1],
      ]) {
        const index = (direction + turn) % 6,
          [dq, dr] = DIRECTIONS[index],
          end = height - 2 - drop,
          axis = (index % 3) + 1;
        branches.push(
          [dq, end - 1, dr, axis],
          [dq, end, dr, 0],
          [dq * 2, end, dr * 2, axis],
        );
        crown(dq * 2, end + 2, dr * 2, false);
      }
    }
  } else if (species === 'jungle') {
    // A broad, layered evergreen crown above a clear, tall trunk.
    for (let y = height - 2; y <= height + 1; y++) {
      const radius = y === height + 1 ? 2 : 3;
      for (let dq = -radius; dq <= radius; dq++)
        for (let dr = -radius; dr <= radius; dr++)
          if (
            hexDistance(dq, dr) <= radius &&
            !(
              y === height - 2 &&
              hexDistance(dq, dr) === 3 &&
              hash(q + dq, y, r + dr, seed) < 0.3
            )
          )
            put(dq, y, dr, tree.leaves);
    }
  } else if (species === 'spruce') {
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
  for (const [dq, y, dr, axis] of branches) put(dq, y, dr, tree.log, axis);
  for (let y = 0; y < height; y++) put(0, y, 0, tree.log);
  return [...cells.values()];
}
