import { ITEMS } from './core.js';
import { ARMOR_SLOTS } from './gear-data.js';
import {
  enchantmentsOf,
  validWearEntry,
  wearValue,
} from './enchanting-data.js';

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
    this.offhand = saved.offhand || null;
  }
  remaining(id, index = 0) {
    return wearValue(this.wear[id]?.[index]) ?? ITEMS[id]?.durability ?? 0;
  }
  entry(id, index = 0) {
    return this.wear[id]?.[index] ?? ITEMS[id]?.durability;
  }
  name(id, index = 0) {
    return this.wear[id]?.[index]?.name || ITEMS[id]?.name || '';
  }
  replaceCopy(id, index, entry) {
    this.wear[id] ||= [];
    while (this.wear[id].length <= index)
      this.wear[id].push(ITEMS[id].durability);
    this.wear[id][index] = structuredClone(entry);
  }
  removeCopy(id, index, inventory) {
    const copies = Array.from({ length: inventory[id] }, (_, i) =>
      this.entry(id, i),
    );
    copies.splice(index, 1);
    this.wear[id] = copies;
    inventory[id]--;
  }
  tags(id, index = 0) {
    return enchantmentsOf(this.wear[id]?.[index]);
  }
  rank(id, name) {
    return this.tags(id)[name] || 0;
  }
  enchant(id, index, enchant) {
    this.wear[id] ||= [];
    while (this.wear[id].length <= index)
      this.wear[id].push(ITEMS[id].durability);
    this.wear[id][index] = {
      ...(typeof this.entry(id, index) === 'object'
        ? this.entry(id, index)
        : {}),
      value: this.remaining(id, index),
      enchant: { ...enchant },
    };
  }
  enchantProtection() {
    return Math.min(
      20,
      Object.values(this.armor).reduce(
        (n, id) => n + this.rank(id, 'protection'),
        0,
      ),
    );
  }
  sync(inventory, creative = false) {
    for (const id of Object.keys(this.wear)) {
      if (!inventory[id]) delete this.wear[id];
      else this.wear[id].length = Math.min(this.wear[id].length, inventory[id]);
    }
    for (const slot of Object.keys(this.armor))
      if (!creative && !inventory[this.armor[slot]]) delete this.armor[slot];
    if (this.offhand && !creative && !inventory[this.offhand])
      this.offhand = null;
  }
  selectCopy(id, index, inventory) {
    if (
      !ITEMS[id]?.durability ||
      !Number.isInteger(index) ||
      index <= 0 ||
      index >= (inventory[id] || 0)
    )
      return;
    const copies = Array.from(
      { length: inventory[id] },
      (_, i) => this.wear[id]?.[i] ?? ITEMS[id].durability,
    );
    copies.unshift(copies.splice(index, 1)[0]);
    this.wear[id] = copies;
  }
  equip(id, inventory, creative, index = 0) {
    if (
      !creative &&
      (!Number.isInteger(index) || index < 0 || index >= (inventory[id] || 0))
    )
      return;
    this.selectCopy(id, index, inventory);
    if (ITEMS[id]?.offhand && (creative || inventory[id] > 0)) {
      this.offhand = this.offhand === id && index === 0 ? null : id;
      return;
    }
    const slot = ITEMS[id]?.armorSlot;
    if (!slot || (!creative && !inventory[id])) return;
    if (this.armor[slot] === id && index === 0) delete this.armor[slot];
    else this.armor[slot] = id;
  }
  damage(id, amount, inventory, creative = false) {
    if (creative || !ITEMS[id]?.durability || !inventory[id]) return false;
    const level = this.rank(id, 'unbreaking');
    let cost = Math.ceil(amount);
    if (level) {
      const chance = ITEMS[id].armorSlot
        ? 0.6 + 0.4 / (level + 1)
        : 1 / (level + 1);
      cost = 0;
      for (let i = 0; i < Math.ceil(amount); i++)
        if (Math.random() < chance) cost++;
    }
    if (!cost) return false;
    const next = this.remaining(id) - cost;
    this.wear[id] ||= [];
    if (next > 0) {
      this.wear[id][0] =
        typeof this.entry(id) === 'object'
          ? { ...this.entry(id), value: next }
          : next;
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
    return {
      armor: { ...this.armor },
      offhand: this.offhand,
      wear: structuredClone(this.wear),
    };
  }
}
export function miningStats(block, held, enchant = {}) {
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
    : [
          'grass',
          'dirt',
          'sand',
          'snow',
          'farmland',
          'sandstone',
          'soulSand',
        ].includes(block)
      ? 'shovel'
      : ['leaves', 'shroom', 'bed'].includes(block)
        ? null
        : 'pick';
  return {
    tier: item?.kind === 'pick' ? item.tier : 0,
    speed:
      item?.kind === kind
        ? [1, 2, 3.2, 4.5, 6.2][item.tier] *
          (1 + 0.18 * (enchant.efficiency || 0) ** 2)
        : 1,
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
        values.every((entry) => validWearEntry(ITEMS[id], entry)),
    )
  );
}
export function validEquipment(e, inventory, creative) {
  return (
    e &&
    validWear(e.wear, inventory) &&
    (e.offhand == null ||
      (ITEMS[e.offhand]?.offhand && (creative || inventory[e.offhand] > 0))) &&
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
