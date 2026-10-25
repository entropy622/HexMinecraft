import { ITEMS, axialToWorld } from './core.js';
import { stackSize, validStack } from './inventory.js';

export const CHEST_SLOTS = 27;
export const isStorage = (id) => !!ITEMS[id]?.storage;
export function storageLidClear(world, q, y, r, camera, feet) {
  if (!ITEMS[world.get(q, y, r)]?.portable) return !world.solid(q, y + 1, r);
  const p = axialToWorld(q, r);
  if (
    Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 1.1 &&
    feet < y + 1.5 &&
    camera.position.y + 0.15 > y + 1
  )
    return false;
  for (const [dx, dz] of [
    [0, 0],
    [0.65, 0],
    [-0.65, 0],
    [0, 0.7],
    [0, -0.7],
  ])
    for (const h of [1.02, 1.25, 1.49])
      if (world.pointSolid(p.x + dx, y + h, p.z + dz)) return false;
  return true;
}
export const validChest = (chest, portable = false) =>
  Array.isArray(chest) &&
  chest.length === CHEST_SLOTS &&
  chest.every(
    (stack) =>
      validStack(stack) && (!portable || !ITEMS[stack?.item]?.portable),
  );

export function newChest(loot = {}) {
  const chest = Array(CHEST_SLOTS).fill(null);
  for (const [item, count] of Object.entries(loot)) {
    if (insertChest(chest, item, count) !== count)
      throw new Error('Generated chest loot exceeds its capacity');
  }
  return chest;
}

// Return the accepted count; callers only remove that amount from the source.
export function insertChest(chest, item, count, wear = []) {
  const size = stackSize(item),
    maxWear = ITEMS[item]?.durability;
  let moved = 0;
  for (const slot of chest) {
    if (!slot || slot.item !== item || slot.count >= size) continue;
    const n = Math.min(count - moved, size - slot.count);
    slot.count += n;
    moved += n;
  }
  for (let i = 0; i < chest.length && moved < count; i++) {
    if (chest[i]) continue;
    const n = Math.min(count - moved, size);
    chest[i] = { item, count: n };
    if (maxWear) chest[i].wear = wear[moved] ?? maxWear;
    moved += n;
  }
  return moved;
}
