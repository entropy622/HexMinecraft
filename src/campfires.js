import { DIRECTIONS, key, worldToAxial } from './core.js';
import { LIQUIDS } from './fluids.js';
import {
  CAMPFIRE_FOODS,
  CAMPFIRE_SECONDS,
  isCampfire,
} from './campfire-data.js';

export function setCampfireLit(world, k, lit) {
  const fire = world.campfires.get(k);
  if (!fire || fire.lit === lit) return false;
  fire.lit = lit;
  world.lightRevision++;
  world.blockRevision++;
  return true;
}
export function campfireWet(world, q, y, r) {
  return [
    [q, y, r],
    [q, y + 1, r],
    ...DIRECTIONS.map(([dq, dr]) => [q + dq, y, r + dr]),
  ].some(([a, b, c]) => LIQUIDS[world.fluids.get(a, b, c)?.type]?.coolant);
}
export function tickCampfires(world, dt, callbacks) {
  for (const [k, fire] of world.campfires) {
    const [q, y, r] = k.split(',').map(Number);
    if (!world.loaded(q, r)) continue;
    if (!isCampfire(world.get(q, y, r))) {
      world.campfires.delete(k);
      continue;
    }
    if (fire.lit && campfireWet(world, q, y, r)) {
      setCampfireLit(world, k, false);
      callbacks.changed(q, y, r);
    }
    if (!fire.lit) continue;
    fire.slots.forEach((slot, i) => {
      if (!slot) return;
      slot.elapsed += dt;
      if (slot.elapsed < CAMPFIRE_SECONDS) return;
      callbacks.drop(CAMPFIRE_FOODS[slot.item], q, y, r, i);
      fire.slots[i] = null;
    });
  }
}
// Heat is local contact, independent of the player's persistent burn status.
export function campfireHeat(world, x, feet, z) {
  const { q, r } = worldToAxial(x, z);
  const y = Math.floor(feet - 0.01);
  if (feet - y < 0.15 || feet - y > 0.65) return 0;
  const type = world.get(q, y, r);
  return isCampfire(type) && world.campfires.get(key(q, y, r))?.lit
    ? type === 'soulCampfire'
      ? 2
      : 1
    : 0;
}
