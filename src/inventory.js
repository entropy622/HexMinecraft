import { ITEMS } from './core.js';
import { ARMOR_SLOTS } from './gear-data.js';
import { validWearEntry } from './enchanting-data.js';

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
const stores = new WeakMap();
export const GEAR_SLOTS = [...Object.keys(ARMOR_SLOTS), 'offhand'];
export const usedSlots = (inventory) =>
  stores.has(inventory)
    ? stores.get(inventory).slots.filter(Boolean).length
    : Object.entries(inventory).reduce(
        (sum, [id, n]) => sum + Math.ceil(n / stackSize(id)),
        0,
      );
export function roomFor(inventory, id) {
  if (stores.has(inventory)) return stores.get(inventory).room(id);
  const size = stackSize(id),
    count = inventory[id] || 0;
  return (
    Math.max(0, INVENTORY_SLOTS - usedSlots(inventory)) * size +
    (count % size ? size - (count % size) : 0)
  );
}

export const sameStack = (a, b) =>
  a && b && a.item === b.item && !ITEMS[a.item]?.durability;
export const copyStack = (stack, count = stack?.count) =>
  stack ? { ...structuredClone(stack), count } : null;
export function validStack(s) {
  return (
    s === null ||
    !!(
      s &&
      Object.hasOwn(ITEMS, s.item) &&
      Number.isInteger(s.count) &&
      s.count > 0 &&
      s.count <= stackSize(s.item) &&
      (ITEMS[s.item].durability
        ? validWearEntry(ITEMS[s.item], s.wear)
        : s.wear === undefined)
    )
  );
}
export const acceptsGear = (slot, stack) =>
  !stack ||
  (slot === 'offhand'
    ? !!ITEMS[stack.item]?.offhand
    : ITEMS[stack.item]?.armorSlot === slot);
export function validPlayerInventory(data) {
  return !!(
    data &&
    Array.isArray(data.slots) &&
    data.slots.length === INVENTORY_SLOTS &&
    data.slots.every(validStack) &&
    Array.isArray(data.gear) &&
    data.gear.length === GEAR_SLOTS.length &&
    data.gear.every((s, i) => validStack(s) && acceptsGear(GEAR_SLOTS[i], s)) &&
    validStack(data.cursor ?? null)
  );
}

// Physical stacks are authoritative. The count view lets recipes and world
// interactions consume resources without inventing another inventory state.
export class PlayerInventory {
  constructor(saved) {
    this.slots = saved
      ? structuredClone(saved.slots)
      : Array(INVENTORY_SLOTS).fill(null);
    this.gear = saved
      ? structuredClone(saved.gear)
      : Array(GEAR_SLOTS.length).fill(null);
    this.overflow = [];
    this.selected = 0;
    this.counts = new Proxy(
      {},
      {
        get: (_, id) =>
          typeof id === 'string' && Object.hasOwn(ITEMS, id)
            ? this.count(id)
            : undefined,
        set: (_, id, value) => {
          if (!Object.hasOwn(ITEMS, id) || !Number.isFinite(value))
            return false;
          const delta = Math.max(0, Math.floor(value)) - this.count(id);
          if (delta > 0) {
            const remaining = this.insert(id, delta);
            if (remaining < delta)
              this.overflow.push({ item: id, count: delta - remaining });
          } else if (delta < 0) this.consume(id, -delta);
          return true;
        },
        ownKeys: () => [
          ...new Set(this.slots.filter(Boolean).map((s) => s.item)),
        ],
        getOwnPropertyDescriptor: () => ({
          enumerable: true,
          configurable: true,
        }),
      },
    );
    stores.set(this.counts, this);
    // Legacy game code reads item IDs; each ID now resolves to a real hotbar stack.
    this.hotbar = new Proxy(Array(9).fill(null), {
      get: (target, prop) =>
        /^\d+$/.test(String(prop)) && Number(prop) < 9
          ? (this.slots[Number(prop)]?.item ?? null)
          : Reflect.get(target, prop),
      set: (target, prop, id) => {
        if (/^\d+$/.test(String(prop)) && Number(prop) < 9) {
          this.choose(id, Number(prop));
          return true;
        }
        return Reflect.set(target, prop, id);
      },
    });
  }
  count(id) {
    return this.slots.reduce((n, s) => n + (s?.item === id ? s.count : 0), 0);
  }
  room(id) {
    return this.slots.reduce(
      (n, s) =>
        n + (!s ? stackSize(id) : s.item === id ? stackSize(id) - s.count : 0),
      0,
    );
  }
  insert(id, count = 1, wear = []) {
    let moved = 0;
    for (const s of this.slots) {
      if (!s || s.item !== id || ITEMS[id].durability) continue;
      const n = Math.min(count - moved, stackSize(id) - s.count);
      s.count += n;
      moved += n;
    }
    for (let i = 0; i < this.slots.length && moved < count; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(count - moved, stackSize(id));
      this.slots[i] = { item: id, count: n };
      if (ITEMS[id].durability)
        this.slots[i].wear = structuredClone(
          wear[moved] ?? ITEMS[id].durability,
        );
      moved += n;
    }
    return moved;
  }
  consume(id, count) {
    const order = [
      this.selected,
      ...this.slots.map((_, i) => i).filter((i) => i !== this.selected),
    ];
    for (const i of order) {
      const s = this.slots[i];
      if (!s || s.item !== id) continue;
      const n = Math.min(count, s.count);
      s.count -= n;
      count -= n;
      if (!s.count) this.slots[i] = null;
      if (!count) break;
    }
  }
  copies(id) {
    return this.slots.filter((s) => s?.item === id);
  }
  active(id) {
    return (
      this.gear.find((s) => s?.item === id) ||
      (this.slots[this.selected]?.item === id
        ? this.slots[this.selected]
        : this.copies(id)[0])
    );
  }
  remove(stack) {
    for (const list of [this.slots, this.gear]) {
      const i = list.indexOf(stack);
      if (i !== -1) {
        list[i] = null;
        return;
      }
    }
  }
  choose(id, index = this.selected) {
    if (!id || this.slots[index]?.item === id) return;
    const from = this.slots.findIndex((s) => s?.item === id);
    if (from >= 0)
      [this.slots[from], this.slots[index]] = [
        this.slots[index],
        this.slots[from],
      ];
  }
  wearSnapshot() {
    const wear = {};
    for (const s of this.slots)
      if (s && ITEMS[s.item].durability) (wear[s.item] ||= []).push(s.wear);
    return wear;
  }
  serialize(cursor = null) {
    return structuredClone({ slots: this.slots, gear: this.gear, cursor });
  }
}
