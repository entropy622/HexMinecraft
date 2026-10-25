import { ITEMS } from './core.js';

export const INVENTORY_SLOTS = 36;
export const stackSize = (id) =>
  ITEMS[id]?.durability ||
  ITEMS[id]?.vehicle ||
  ITEMS[id]?.potion ||
  (ITEMS[id]?.bucket && id !== 'bucket') ||
  id === 'milkBucket'
    ? 1
    : id === 'bucket' || id === 'egg' || id === 'pearl'
      ? 16
      : 64;
export const usedSlots = (inventory) =>
  Object.entries(inventory).reduce(
    (sum, [id, n]) => sum + Math.ceil(n / stackSize(id)),
    0,
  );
export function roomFor(inventory, id) {
  const size = stackSize(id),
    count = inventory[id] || 0;
  return (
    Math.max(0, INVENTORY_SLOTS - usedSlots(inventory)) * size +
    (count % size ? size - (count % size) : 0)
  );
}
