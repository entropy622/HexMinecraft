import { ITEMS } from './core.js';
import { roomFor, stackSize, INVENTORY_SLOTS } from './inventory.js';
import { validWearEntry, wearValue } from './enchanting-data.js';

export const CHEST_SLOTS = 27;

export function validChest(chest) {
  return (
    Array.isArray(chest) &&
    chest.length === CHEST_SLOTS &&
    chest.every(
      (slot) =>
        slot === null ||
        (slot &&
          Object.hasOwn(ITEMS, slot.item) &&
          Number.isInteger(slot.count) &&
          slot.count > 0 &&
          slot.count <= stackSize(slot.item) &&
          (ITEMS[slot.item].durability
            ? validWearEntry(ITEMS[slot.item], slot.wear)
            : slot.wear === undefined)),
    )
  );
}

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

export function depositChest(chest, inventory, wear, item, offset, requested) {
  const available = inventory[item] || 0;
  if (!Number.isInteger(offset) || offset < 0 || offset >= available) return 0;
  const count = Math.max(0, Math.min(requested, available - offset));
  const moved = insertChest(
    chest,
    item,
    count,
    (wear[item] || []).slice(offset),
  );
  if (!moved) return 0;
  if (ITEMS[item].durability) {
    const copies = Array.from(
      { length: available },
      (_, i) => wear[item]?.[i] ?? ITEMS[item].durability,
    );
    copies.splice(offset, moved);
    if (copies.length) wear[item] = copies;
    else delete wear[item];
  }
  inventory[item] = available - moved;
  return moved;
}

export function withdrawChest(
  chest,
  inventory,
  wear,
  index,
  requested,
  creative = false,
) {
  const slot = chest[index];
  if (!slot) return 0;
  const existing = inventory[slot.item] || 0;
  const count = Math.max(
    0,
    Math.min(
      requested,
      slot.count,
      creative ? Infinity : roomFor(inventory, slot.item),
      (ITEMS[slot.item].durability ? 256 : 1e6) - existing,
    ),
  );
  if (!count) return 0;
  if (ITEMS[slot.item].durability) {
    const copies = Array.from(
      { length: existing },
      (_, i) => wear[slot.item]?.[i] ?? ITEMS[slot.item].durability,
    );
    copies.push(slot.wear);
    wear[slot.item] = copies;
  }
  inventory[slot.item] = existing + count;
  slot.count -= count;
  if (!slot.count) chest[index] = null;
  return count;
}

export function sortChest(chest) {
  const ordered = chest
    .filter(Boolean)
    .sort(
      (a, b) =>
        ITEMS[a.item].name.localeCompare(ITEMS[b.item].name, 'zh-Hans') ||
        (wearValue(a.wear) || 0) - (wearValue(b.wear) || 0),
    );
  chest.fill(null);
  for (const slot of ordered)
    insertChest(chest, slot.item, slot.count, [slot.wear]);
}

// Player inventory still aggregates counts. The view exposes actual stacks and
// per-copy tool durability, with offsets identifying which copy to transfer.
export function inventoryPage(inventory, wear, page, query = '') {
  const ids = Object.keys(inventory)
    .filter(
      (item) =>
        inventory[item] > 0 &&
        (!query ||
          ITEMS[item].name.includes(query) ||
          item.toLowerCase().includes(query.toLowerCase())),
    )
    .sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name, 'zh-Hans'));
  const total = ids.reduce(
    (n, item) => n + Math.ceil(inventory[item] / stackSize(item)),
    0,
  );
  const pages = Math.max(1, Math.ceil(total / INVENTORY_SLOTS));
  page = Math.max(0, Math.min(page, pages - 1));
  const first = page * INVENTORY_SLOTS,
    slots = [];
  let passed = 0;
  for (const item of ids) {
    const size = stackSize(item),
      stacks = Math.ceil(inventory[item] / size);
    for (
      let i = Math.max(0, first - passed);
      i < Math.min(stacks, first + INVENTORY_SLOTS - passed);
      i++
    ) {
      const offset = i * size;
      slots.push({
        item,
        offset,
        count: Math.min(size, inventory[item] - offset),
        wear: ITEMS[item].durability
          ? (wear[item]?.[offset] ?? ITEMS[item].durability)
          : undefined,
      });
    }
    passed += stacks;
  }
  while (slots.length < INVENTORY_SLOTS) slots.push(null);
  return { slots, page, pages, total };
}
