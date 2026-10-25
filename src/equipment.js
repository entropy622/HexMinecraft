import { ITEMS } from './core.js';
import { GEAR_SLOTS } from './inventory.js';
import {
  enchantmentsOf,
  validWearEntry,
  wearValue,
} from './enchanting-data.js';

// Equipment reads and mutates the actual stack. Copy indices are only a view
// for the enchanting/anvil selectors; moving a stack never rewrites its data.
export class Equipment {
  bind(pack) {
    this.pack = pack;
    return this;
  }
  get wear() {
    return this.pack.wearSnapshot();
  }
  get armor() {
    return Object.fromEntries(
      GEAR_SLOTS.slice(0, 4).flatMap((slot, i) =>
        this.pack.gear[i] ? [[slot, this.pack.gear[i].item]] : [],
      ),
    );
  }
  get offhand() {
    return this.pack.gear[4]?.item ?? null;
  }
  entry(id, index = null) {
    return (
      (index === null ? this.pack.active(id) : this.pack.copies(id)[index])
        ?.wear ?? ITEMS[id]?.durability
    );
  }
  remaining(id, index = null) {
    return wearValue(this.entry(id, index)) ?? ITEMS[id]?.durability ?? 0;
  }
  name(id, index = null) {
    return this.entry(id, index)?.name || ITEMS[id]?.name || '';
  }
  replaceCopy(id, index, entry) {
    const stack = this.pack.copies(id)[index];
    if (stack) stack.wear = structuredClone(entry);
  }
  removeCopy(id, index) {
    this.pack.remove(this.pack.copies(id)[index]);
  }
  tags(id, index = null) {
    return enchantmentsOf(this.entry(id, index));
  }
  rank(id, name) {
    return this.tags(id)[name] || 0;
  }
  enchant(id, index, enchant) {
    this.replaceCopy(id, index, {
      ...(typeof this.entry(id, index) === 'object'
        ? this.entry(id, index)
        : {}),
      value: this.remaining(id, index),
      enchant: { ...enchant },
    });
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
  damage(id, amount, creative = false, worn = false) {
    const stack = worn
      ? this.pack.gear.find((s) => s?.item === id)
      : this.pack.slots[this.pack.selected]?.item === id
        ? this.pack.slots[this.pack.selected]
        : this.pack.copies(id)[0];
    if (creative || !ITEMS[id]?.durability || !stack) return false;
    const level = enchantmentsOf(stack.wear).unbreaking || 0;
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
    const next = wearValue(stack.wear) - cost;
    if (next > 0)
      stack.wear =
        typeof stack.wear === 'object' ? { ...stack.wear, value: next } : next;
    else this.pack.remove(stack);
    return next <= 0;
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
}
export function miningStats(block, held, enchant = {}) {
  block = ITEMS[block]?.base || block;
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
