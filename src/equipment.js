import { ITEMS } from './core.js';
import { ARMOR_SLOTS } from './gear-data.js';

// Each stack stores durability in use order; omitted trailing copies are pristine.
export function transferWear(from, to, id, count, fromCount, toCount) {
  const max = ITEMS[id]?.durability;
  if (!max || !count) return;
  const source = from[id] || [],
    destination = to[id] || [];
  while (destination.length < toCount) destination.push(max);
  for (let i = 0; i < count; i++) destination.push(source[i] ?? max);
  to[id] = destination;
  from[id] = source.slice(count, fromCount);
}
export class Equipment {
  constructor(saved = {}) {
    this.wear = structuredClone(saved.wear || {});
    this.armor = { ...saved.armor };
  }
  remaining(id) {
    return this.wear[id]?.[0] ?? ITEMS[id]?.durability ?? 0;
  }
  sync(inventory, creative = false) {
    for (const id of Object.keys(this.wear)) {
      if (!inventory[id]) delete this.wear[id];
      else this.wear[id].length = Math.min(this.wear[id].length, inventory[id]);
    }
    for (const slot of Object.keys(this.armor))
      if (!creative && !inventory[this.armor[slot]]) delete this.armor[slot];
  }
  equip(id, inventory, creative) {
    const slot = ITEMS[id]?.armorSlot;
    if (!slot || (!creative && !inventory[id])) return;
    if (this.armor[slot] === id) delete this.armor[slot];
    else this.armor[slot] = id;
  }
  damage(id, amount, inventory, creative = false) {
    if (creative || !ITEMS[id]?.durability || !inventory[id]) return false;
    const next = this.remaining(id) - amount;
    this.wear[id] ||= [];
    if (next > 0) {
      this.wear[id][0] = next;
      return false;
    }
    inventory[id]--;
    this.wear[id].shift();
    this.sync(inventory);
    return true;
  }
  protection() {
    return Math.min(
      20,
      Object.values(this.armor).reduce(
        (n, id) => n + (ITEMS[id]?.armor || 0),
        0,
      ),
    );
  }
  serialize() {
    return { armor: { ...this.armor }, wear: structuredClone(this.wear) };
  }
}
export function miningStats(block, held) {
  const item = ITEMS[held];
  const kind = [
    'wood',
    'planks',
    'workbench',
    'chest',
    'crimsonwood',
    'bookshelf',
    'door',
    'doorTop',
    'fence',
    'gate',
    'ladder',
  ].includes(block)
    ? 'axe'
    : ['grass', 'dirt', 'sand', 'snow', 'farmland', 'sandstone'].includes(block)
      ? 'shovel'
      : ['leaves', 'shroom', 'bed'].includes(block)
        ? null
        : 'pick';
  return {
    tier: item?.kind === 'pick' ? item.tier : 0,
    speed: item?.kind === kind ? [1, 2, 3.2, 4.5, 6.2][item.tier] : 1,
  };
}
export function validWear(wear, inventory) {
  return (
    wear &&
    typeof wear === 'object' &&
    !Array.isArray(wear) &&
    Object.entries(wear).every(
      ([id, values]) =>
        ITEMS[id]?.durability &&
        Array.isArray(values) &&
        values.length <= (inventory[id] || 0) &&
        values.length <= 256 &&
        values.every(
          (n) => Number.isInteger(n) && n > 0 && n <= ITEMS[id].durability,
        ),
    )
  );
}
export function validEquipment(e, inventory, creative) {
  return (
    e &&
    validWear(e.wear, inventory) &&
    e.armor &&
    typeof e.armor === 'object' &&
    !Array.isArray(e.armor) &&
    Object.entries(e.armor).every(
      ([slot, id]) =>
        Object.hasOwn(ARMOR_SLOTS, slot) &&
        ITEMS[id]?.armorSlot === slot &&
        (creative || inventory[id] > 0),
    )
  );
}
