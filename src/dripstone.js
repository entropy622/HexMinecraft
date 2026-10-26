import { BLOCKS, worldToAxial, hash } from './core.js';
import { HEX_POLYGON } from './cut-blocks.js';
import { ceilingSupport } from './cave-plants.js';

const same = (world, q, y, r, down) =>
  world.get(q, y, r) === 'pointedDripstone' &&
  !!world.state(q, y, r).upper === down;
export function pointedSupport(world, q, y, r, down) {
  const sy = y + (down ? 1 : -1);
  if (same(world, q, sy, r, down)) return true;
  if (down) return ceilingSupport(world, q, sy, r);
  const def = BLOCKS[world.get(q, sy, r)];
  if (!def || def.nonSolid || def.foliage) return false;
  if (!def.shape) return true;
  const state = world.state(q, sy, r);
  return (
    ['slab', 'stairs'].includes(def.shape) && (state.upper || state.double)
  );
}
export function pointedTip(world, q, y, r) {
  const down = !!world.state(q, y, r).upper;
  return (
    world.get(q, y, r) === 'pointedDripstone' &&
    world.get(q, y + (down ? -1 : 1), r) !== 'pointedDripstone'
  );
}
export function dripstoneParts(world, q, y, r) {
  const down = !!world.state(q, y, r).upper,
    direction = down ? -1 : 1;
  let distance = 0;
  while (
    distance < 3 &&
    same(world, q, y + (distance + 1) * direction, r, down)
  )
    distance++;
  const merged =
      !distance && world.get(q, y + direction, r) === 'pointedDripstone',
    radii = [0.22, 0.31, 0.38, 0.43],
    base = radii[distance],
    tip = distance ? radii[distance - 1] : merged ? 0.22 : 0.025,
    bottom = down ? tip : base,
    top = down ? base : tip;
  return [
    {
      x: (hash(q, 0, r, 823) - 0.5) * 0.12,
      y: 0.5,
      z: (hash(q, 1, r, 823) - 0.5) * 0.12,
      h: 1,
      angle: 0,
      tile: 'pointedDripstone',
      uvFull: true,
      polygon: HEX_POLYGON.map(([x, z]) => [x * bottom, z * bottom]),
      topScale: top / bottom,
    },
  ];
}
export function dripstoneRoot(world, q, y, r) {
  let length = 1;
  while (same(world, q, y + length, r, true)) length++;
  return { y: y + length - 1, length };
}
export function tickDripstone(world, dt, occupied = () => false) {
  const changed = [];
  const place = (q, y, r, down) => {
    if (world.get(q, y, r) || world.fluids.get(q, y, r) || occupied(q, y, r))
      return;
    world.set(q, y, r, 'pointedDripstone');
    world.setState(q, y, r, { facing: 0, open: false, upper: down });
    changed.push([q, y, r]);
  };
  for (const k of [...world.dripstoneCells]) {
    const [q, y, r] = k.split(',').map(Number);
    if (
      !world.state(q, y, r).upper ||
      !pointedTip(world, q, y, r) ||
      world.fluids.get(q, y, r)
    )
      continue;
    const root = dripstoneRoot(world, q, y, r),
      water = world.fluids.get(q, root.y + 2, r);
    if (
      world.get(q, root.y + 1, r) !== 'dripstoneBlock' ||
      water?.type !== 'water' ||
      !water.source ||
      Math.random() >= 1 - Math.exp(-Math.max(0, dt) / 1800)
    )
      continue;
    if (Math.random() < 0.5) {
      if (root.length < 7 && y > 1) place(q, y - 1, r, true);
    } else
      for (let floor = y - 1; floor >= Math.max(1, y - 10); floor--) {
        if (world.fluids.get(q, floor, r)) break;
        const type = world.get(q, floor, r);
        if (!type) continue;
        if (type === 'pointedDripstone') {
          if (
            !same(world, q, floor, r, false) ||
            !pointedTip(world, q, floor, r)
          )
            break;
          let length = 1;
          while (same(world, q, floor - length, r, false)) length++;
          if (length >= 7) break;
        }
        if (pointedSupport(world, q, floor + 1, r, false))
          place(q, floor + 1, r, false);
        break;
      }
  }
  return changed;
}
export function spikeAtFeet(world, x, feet, z) {
  // Contact sensors match the player's body footprint. A merged pair has no tip.
  for (const [dx, dz] of [
    [0, 0],
    [0.24, 0],
    [-0.24, 0],
    [0, 0.24],
    [0, -0.24],
    [0.17, 0.17],
    [-0.17, -0.17],
  ]) {
    // The caller supplies world positions, so retain exact tapered support.
    const support = world.groundAt(x + dx, z + dz, feet - 0.08, feet + 0.08);
    if (support === null) continue;
    const y = Math.floor(support - 0.001);
    const { q, r } = worldToAxial(x + dx, z + dz);
    if (pointedTip(world, q, y, r) && !world.state(q, y, r).upper) return true;
  }
  return false;
}
export const spikeLandingDamage = (velocity) =>
  Math.min(40, Math.max(0, Math.ceil(((velocity * velocity) / 48 - 1) * 2)));
export const stalactiteImpactDamage = (velocity) =>
  Math.min(40, Math.max(0, Math.floor((velocity * velocity) / 40 - 1) * 6));
