import { BLOCKS } from './core.js';
import { isCaveVine } from './cave-data.js';

export function ceilingSupport(world, q, y, r) {
  const def = BLOCKS[world.get(q, y, r)];
  if (!def || def.nonSolid || def.foliage) return false;
  if (!def.shape) return true;
  const state = world.state(q, y, r);
  return (
    ['slab', 'stairs'].includes(def.shape) && (!state.upper || state.double)
  );
}
export function canHang(world, q, y, r, vine = false) {
  return (
    y >= 1 &&
    y < world.maxY - 1 &&
    world.loaded(q, r) &&
    (ceilingSupport(world, q, y + 1, r) ||
      (vine && isCaveVine(world.get(q, y + 1, r))))
  );
}
export function harvestCavePlant(world, q, y, r, berriesOnly = false) {
  const changed = [],
    drops = [];
  let type = world.get(q, y, r);
  while (type === 'sporeBlossom' || isCaveVine(type)) {
    if (type === 'caveVinesBerries')
      drops.push({ q, y, r, item: 'glowBerries', count: 1 });
    if (type === 'sporeBlossom') drops.push({ q, y, r, item: type, count: 1 });
    if (berriesOnly && type !== 'caveVinesBerries') break;
    world.set(q, y, r, berriesOnly ? 'caveVines' : null);
    changed.push({ q, y, r });
    if (berriesOnly || type === 'sporeBlossom') break;
    type = world.get(q, --y, r);
  }
  return { changed, drops };
}
export function tickCavePlants(world, dt) {
  const changed = [],
    drops = [];
  // Top first: losing an attachment collapses the entire chain in this tick.
  const cells = [...world.hangingPlants]
    .map((k) => k.split(',').map(Number))
    .sort((a, b) => b[1] - a[1]);
  for (const [q, y, r] of cells) {
    const type = world.get(q, y, r);
    if (!type) continue;
    const vine = isCaveVine(type);
    if (!canHang(world, q, y, r, vine) || world.fluids.get(q, y, r)) {
      const result = harvestCavePlant(world, q, y, r);
      changed.push(...result.changed);
      drops.push(...result.drops);
      continue;
    }
    if (
      !vine ||
      y <= 1 ||
      world.get(q, y - 1, r) ||
      world.fluids.get(q, y - 1, r)
    )
      continue;
    let length = 1;
    while (isCaveVine(world.get(q, y + length, r))) length++;
    if (length >= 26 || Math.random() >= 1 - Math.exp(-Math.max(0, dt) / 90))
      continue;
    world.set(
      q,
      y - 1,
      r,
      Math.random() < 1 / 9 ? 'caveVinesBerries' : 'caveVines',
    );
    changed.push({ q, y: y - 1, r });
  }
  return { changed, drops };
}
