import { ITEMS } from './core.js';
import { stackSize, validStack } from './inventory.js';

export const CHEST_SLOTS = 27;
export const validChest = (chest) =>
  Array.isArray(chest) &&
  chest.length === CHEST_SLOTS &&
  chest.every(validStack);

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
