import { BLOCKS } from './core.js';
import { AMETHYST_STAGES, isAmethystBud } from './amethyst-data.js';
import { amethystOffset } from './geodes.js';
import { miningLoot } from './mining-loot.js';
import { buildingParts, insidePart } from './building-shapes.js';
import { HEX_POLYGON, polygonContains } from './cut-blocks.js';

// null preserves attachments across an unloaded boundary until it is known.
export function amethystSupport(world, q, y, r, facing) {
  const [a, b, c] = amethystOffset(facing);
  q -= a;
  y -= b;
  r -= c;
  if (!world.loaded(q, r)) return null;
  const block = BLOCKS[world.get(q, y, r)];
  if (!block || block.nonSolid) return false;
  if (!block.shape || ['dropper', 'observer'].includes(block.shape))
    return true;
  const k = `${q},${y},${r}`;
  if (!world.shapeCache.has(k))
    world.shapeCache.set(k, buildingParts(world, q, y, r, true));
  const parts = world.shapeCache.get(k),
    epsilon = 1e-5;
  const contains = (x, y, z) => parts.some((part) => insidePart(x, y, z, part));
  // Inspect the full face at the host's 1/16 cut resolution, including edge
  // points. Stairs, slabs, trapdoors and extended pistons use their real parts.
  if (facing >= 6) {
    const height = facing === 6 ? 1 - epsilon : epsilon;
    for (const [x, z] of HEX_POLYGON)
      if (!contains(x * (1 - epsilon), height, z * (1 - epsilon))) return false;
    for (let a = 0; a < 32; a++)
      for (let b = 0; b < 32; b++) {
        const x = (a + 0.5) / 16 - 1,
          z = (b + 0.5) / 16 - 1;
        if (polygonContains(HEX_POLYGON, x, z) && !contains(x, height, z))
          return false;
      }
  } else {
    const a = HEX_POLYGON[facing],
      b = HEX_POLYGON[(facing + 1) % 6];
    for (let h = 0; h < 16; h++)
      for (let t = 0; t <= 16; t++) {
        const u = t / 16,
          x = (a[0] + (b[0] - a[0]) * u) * (1 - epsilon),
          z = (a[1] + (b[1] - a[1]) * u) * (1 - epsilon);
        if (!contains(x, (h + 0.5) / 16, z)) return false;
      }
  }
  return true;
}

export function growAmethyst(world, q, y, r, facing) {
  if (
    world.get(q, y, r) !== 'buddingAmethyst' ||
    !Number.isInteger(facing) ||
    facing < 0 ||
    facing > 7
  )
    return null;
  const [a, b, c] = amethystOffset(facing);
  q += a;
  y += b;
  r += c;
  if (y < 1 || y >= world.maxY - 1 || !world.loaded(q, r)) return null;
  const type = world.get(q, y, r),
    fluid = world.fluids.get(q, y, r);
  let next;
  if (!type) {
    if (fluid && (fluid.type !== 'water' || fluid.level !== 0)) return null;
    next = AMETHYST_STAGES[0];
  } else {
    const stage = AMETHYST_STAGES.indexOf(type);
    if (stage < 0 || stage >= 3 || world.state(q, y, r).facing !== facing)
      return null;
    next = AMETHYST_STAGES[stage + 1];
  }
  world.set(q, y, r, next);
  world.setState(q, y, r, { facing, open: false });
  return { q, y, r };
}

export function tickAmethyst(world, dt, random = Math.random) {
  const changed = [],
    drops = [];
  for (const k of [...world.amethystCells]) {
    const [q, y, r] = k.split(',').map(Number),
      type = world.get(q, y, r);
    if (!isAmethystBud(type)) {
      world.amethystCells.delete(k);
      continue;
    }
    if (amethystSupport(world, q, y, r, world.state(q, y, r).facing) !== false)
      continue;
    for (const stack of miningLoot(type).stacks)
      drops.push({ q, y, r, ...stack });
    world.set(q, y, r, null);
    changed.push({ q, y, r });
  }
  if (!(dt > 0) || !Number.isFinite(dt)) return { changed, drops };
  // Three random cells per game tick, over the host's 4096-cell chunk, matches
  // the existing grass/cactus sampler. Only a fifth of budding ticks grow.
  for (const ck of world.chunks.keys()) {
    const [cq, cr] = ck.split(',').map(Number);
    for (let n = 0; n < Math.round(dt * 60); n++) {
      const q = cq * 8 + Math.floor(random() * 8),
        r = cr * 8 + Math.floor(random() * 8),
        y = Math.floor(random() * world.maxY);
      if (world.get(q, y, r) !== 'buddingAmethyst' || random() >= 1 / 5)
        continue;
      const cell = growAmethyst(world, q, y, r, Math.floor(random() * 8));
      if (cell) changed.push(cell);
    }
  }
  return { changed, drops };
}
