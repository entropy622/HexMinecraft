import { DIRECTIONS, hash, hexDistance } from './core.js';
import { treeCells, megaTreeCells, megaTreeRoots } from './tree-layout.js';

// Java 1.21.5 trees_jungle's ordered selector, with independent seeded samples.
// These are conditional chances, not percentages of the final forest.
export function jungleForm(q, r, seed) {
  if (hash(q, 1441, r, seed) < 0.1) return 'fancy-oak';
  if (hash(q, 1447, r, seed) < 0.5) return 'bush';
  if (hash(q, 1451, r, seed) < 0.33333334) return 'giant';
  if (hash(q, 1453, r, seed) < 0.0125) return 'fallen';
  return 'jungle';
}

export function bushCells(q, base, r, seed) {
  const cells = [];
  for (let row = 0; row < 3; row++) {
    const radius = 2 - row;
    for (let dq = -radius; dq <= radius; dq++)
      for (let dr = -radius; dr <= radius; dr++) {
        if (
          hexDistance(dq, dr) > radius ||
          (radius &&
            hexDistance(dq, dr) === radius &&
            hash(q + dq, 1463 + row, r + dr, seed) < 0.25)
        )
          continue;
        if (!dq && !dr && !row) continue;
        cells.push([q + dq, base + row, r + dr, 'leaves']);
      }
  }
  cells.push([q, base, r, 'jungleWood']);
  return cells;
}

function fallenCells(world, q, base, r) {
  const direction = Math.floor(hash(q, 1471, r, world.seed) * 6),
    [dq, dr] = DIRECTIONS[direction],
    gap = 2 + Math.floor(hash(q, 1477, r, world.seed) * 2),
    length = 2 + Math.floor(hash(q, 1481, r, world.seed) * 8),
    startQ = q + dq * gap,
    startR = r + dr * gap,
    height = world.terrainHeight(startQ, startR),
    stump = [[q, base, r, 'jungleWood']],
    body = [];
  if (height < base - 5 || height > base + 1) return stump;
  let unsupported = 0;
  for (let i = 0; i < length; i++) {
    const a = startQ + dq * i,
      c = startR + dr * i,
      ground = world.terrainHeight(a, c);
    if (!world.treeGround(a, c)) return stump;
    if (ground > height || (ground < height && ++unsupported > 2)) return stump;
    if (ground === height) unsupported = 0;
    body.push([a, height, c, 'jungleWood', (direction % 3) + 1]);
  }
  return [...stump, ...body];
}

// The caller has already established that this is a natural tree candidate.
// Site checks use terrain/feature data only, so chunk loading cannot select a
// different tree, root level or crown. Player edits retain their later priority.
export function naturalTree(world, q, r) {
  const species = world.treeKind(q, r),
    form = species === 'jungle' ? jungleForm(q, r, world.seed) : species,
    ground = world.terrainHeight(q, r);
  let base = ground,
    cells,
    vines = false,
    cocoa = false,
    rotation = 0;
  if (form === 'giant') {
    rotation = Math.floor(hash(q, 1483, r, world.seed) * 3);
    const roots = megaTreeRoots(q, 0, r, rotation),
      heights = roots.map(([a, , c]) => world.terrainHeight(a, c));
    base = Math.max(...heights);
    if (
      base - Math.min(...heights) > 1 ||
      roots.some(
        ([a, , c]) => world.biome(a, c) !== '丛林' || !world.treeGround(a, c),
      )
    )
      return null;
    cells = megaTreeCells('jungle', q, base, r, world.seed, rotation);
    if (cells.some((c) => c[1] >= world.maxY - 1)) return null;
    const columns = new Map();
    for (const [a, y, c] of cells) {
      const k = `${a},${c}`;
      columns.set(k, Math.min(y, columns.get(k) ?? Infinity));
    }
    for (const [k, y] of columns) {
      const [a, c] = k.split(',').map(Number);
      if (!world.treeSpace(a, y, c)) return null;
    }
    cells.unshift(...roots.map(([a, , c]) => [a, base - 1, c, 'dirt']));
    vines = true;
  } else if (form === 'bush') cells = bushCells(q, base, r, world.seed);
  else if (form === 'fallen') cells = fallenCells(world, q, base, r);
  else if (form === 'fancy-oak')
    cells = treeCells('oak', q, base, r, world.seed, { fancy: true });
  else {
    cells = treeCells(species, q, base, r, world.seed);
    vines = cocoa = form === 'jungle';
  }
  return {
    form,
    species: form === 'fancy-oak' ? 'oak' : species,
    base,
    rotation,
    cells,
    vines,
    cocoa,
  };
}

// Only these distant roots can reach beyond the old four-cell tree/vine halo.
// Reject most cells before any terrain, cave or structure lookup.
export function distantJungleRoot(world, q, r) {
  if (world.dimension !== 'overworld' || hash(q, 17, r, world.seed) <= 0.91)
    return false;
  const form = jungleForm(q, r, world.seed);
  return (
    (form === 'giant' || form === 'fallen') && world.biome(q, r) === '丛林'
  );
}
