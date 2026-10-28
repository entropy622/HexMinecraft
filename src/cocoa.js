import { DIRECTIONS, hash } from './core.js';
import { isJungleLog } from './cocoa-data.js';

// Facing points from the pod to its supporting log, as in CocoaBlock.
export function cocoaSupport(world, q, y, r) {
  const [dq, dr] = DIRECTIONS[world.state(q, y, r).facing];
  if (!world.loaded(q + dq, r + dr)) return null;
  return isJungleLog(world.get(q + dq, y, r + dr));
}

export function growCocoa(world, q, y, r) {
  if (
    world.get(q, y, r) !== 'cocoa' ||
    !cocoaSupport(world, q, y, r) ||
    world.fluids.get(q, y, r)
  )
    return false;
  const state = world.state(q, y, r),
    age = state.age || 0;
  if (age >= 2) return false;
  // Natural pods become ordinary edits when they change, preserving their
  // actual stage and support across regeneration and v16 save validation.
  world.set(q, y, r, 'cocoa');
  world.setState(q, y, r, { ...state, age: age + 1 });
  return true;
}

export function harvestCocoa(world, q, y, r) {
  if (world.get(q, y, r) !== 'cocoa') return { changed: [], drops: [] };
  const count = world.state(q, y, r).age === 2 ? 3 : 1;
  world.set(q, y, r, null);
  return {
    changed: [{ q, y, r }],
    drops: [{ q, y, r, item: 'cocoaBeans', count }],
  };
}

export function tickCocoa(world, dt) {
  const output = { changed: [], drops: [] };
  // Java's default 3 random samples / 4096 cells / game tick, with a 1/5
  // growth chance. Adapt that mean to the existing loaded-time maintenance.
  const chance = -Math.expm1((-dt * 3) / 1024);
  for (const k of [...world.buildings]) {
    const [q, y, r] = k.split(',').map(Number);
    if (world.get(q, y, r) !== 'cocoa') continue;
    const support = cocoaSupport(world, q, y, r);
    if (support === null) continue;
    if (!support || world.fluids.get(q, y, r)) {
      const removed = harvestCocoa(world, q, y, r);
      output.changed.push(...removed.changed);
      output.drops.push(...removed.drops);
    } else if (
      chance > 0 &&
      (world.state(q, y, r).age || 0) < 2 &&
      Math.random() < chance &&
      growCocoa(world, q, y, r)
    )
      output.changed.push({ q, y, r });
  }
  return output;
}

// Derive pod candidates from each natural trunk, never from loaded neighbors.
// Saplings use treeCells directly and therefore cannot create free cocoa.
export function naturalCocoa(q, base, r, seed) {
  const pods = [];
  for (let y = 1; y <= 3; y++)
    DIRECTIONS.forEach(([dq, dr], side) => {
      if (hash(q, base + y + side * 19, r, seed + 1281) < 0.12)
        pods.push([
          q + dq,
          base + y,
          r + dr,
          {
            facing: (side + 3) % 6,
            open: false,
            age: Math.floor(hash(q, base + y + side * 23, r, seed + 1282) * 3),
          },
        ]);
    });
  return pods;
}
