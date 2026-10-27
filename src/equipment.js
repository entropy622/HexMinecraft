import { ITEMS } from './core.js';
import { GEAR_SLOTS } from './inventory.js';
export { miningStats } from './mining.js';
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
    const id = this.pack.gear[4]?.item;
    return ITEMS[id]?.offhand ? id : null;
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
    return this.damageStack(stack, amount, creative);
  }
  damageStack(stack, amount, creative = false) {
    if (creative) return false;
    const broken = wearStack(stack, amount);
    if (broken) this.pack.remove(stack);
    return broken;
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

export function wearStack(stack, amount = 1) {
  const id = stack?.item;
  if (!ITEMS[id]?.durability || !stack) return false;
  const level = enchantmentsOf(stack.wear).unbreaking || 0;
  let cost = Math.ceil(amount);
  if (level) {
    const chance =
      ITEMS[id].armorSlot && !ITEMS[id].glider
        ? 0.6 + 0.4 / (level + 1)
        : 1 / (level + 1);
    cost = 0;
    for (let i = 0; i < Math.ceil(amount); i++)
      if (Math.random() < chance) cost++;
  }
  if (!cost) return false;
  const next = Math.max(
    ITEMS[id].durabilityFloor || 0,
    wearValue(stack.wear) - cost,
  );
  if (next > 0)
    stack.wear =
      typeof stack.wear === 'object' ? { ...stack.wear, value: next } : next;
  return next <= 0;
}
