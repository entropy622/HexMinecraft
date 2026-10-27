import { BLOCKS, key } from './core.js';
import { isFurnace } from './processing-data.js';
import { newFurnace, FUELS, smeltingRecipe } from './furnaces.js';
import { newBrewing, resetBrewing } from './brewing.js';
import { POTIONS, BREW_INGREDIENTS } from './brewing-data.js';

// Manual inventory sessions, comparators and hoppers share the actual slots.
// Setters own recipe resets; only the player's UI adds an XP withdrawal callback.
export function blockSlots(world, q, y, r) {
  if (!world.loaded(q, r)) return null;
  const type = world.get(q, y, r),
    k = key(q, y, r);
  if (BLOCKS[type]?.storage) {
    let list = world.chests.get(k);
    if (!list && ['hopper', 'dropper', 'dispenser'].includes(type)) {
      list = Array(BLOCKS[type].storage).fill(null);
      world.chests.set(k, list);
    }
    // Natural treasure is populated by discovery, never overwritten here.
    if (!list) return null;
    return Object.fromEntries(
      list.map((_, i) => [
        i,
        {
          get: () => list[i],
          set: (s) => {
            list[i] = s;
          },
          accepts: (s) => !BLOCKS[type].portable || !BLOCKS[s.item]?.portable,
        },
      ]),
    );
  }
  if (isFurnace(type)) {
    const f = world.furnaces.get(k) || newFurnace(type);
    return Object.fromEntries(
      ['input', 'fuel', 'output'].map((name) => [
        name,
        {
          get: () => f[name],
          set: (s) => {
            if (name === 'input' && f.input?.item !== s?.item) f.progress = 0;
            f[name] = s;
            world.furnaces.set(k, f);
          },
          accepts: (s) =>
            name === 'input'
              ? !!smeltingRecipe(s.item, type)
              : name === 'fuel' && !!FUELS[s.item],
          output: name === 'output',
        },
      ]),
    );
  }
  if (type !== 'brewingStand') return null;
  const b = world.brewing.get(k) || newBrewing();
  const slots = Object.fromEntries(
    b.bottles.map((_, i) => [
      i,
      {
        get: () => (b.bottles[i] ? { item: b.bottles[i], count: 1 } : null),
        set: (s) => {
          if (b.bottles[i] !== (s?.item || null)) resetBrewing(b);
          b.bottles[i] = s?.item || null;
          world.brewing.set(k, b);
        },
        accepts: (s) => Object.hasOwn(POTIONS, s.item),
        limit: 1,
      },
    ]),
  );
  slots.ingredient = {
    get: () => b.ingredient,
    set: (s) => {
      if (b.ingredient?.item !== s?.item) resetBrewing(b);
      b.ingredient = s;
      world.brewing.set(k, b);
    },
    accepts: (s) => BREW_INGREDIENTS.includes(s.item),
  };
  slots.fuel = {
    get: () => (b.fuelStock ? { item: 'ember', count: b.fuelStock } : null),
    set: (s) => {
      b.fuelStock = s?.count || 0;
      world.brewing.set(k, b);
    },
    accepts: (s) => s.item === 'ember',
  };
  return slots;
}

export function insertionSlots(world, q, y, r, face) {
  const slots = blockSlots(world, q, y, r),
    type = world.get(q, y, r);
  if (!slots) return null;
  if (isFurnace(type))
    return face === 'top'
      ? { input: slots.input }
      : face === 'bottom'
        ? {
            fuel: { ...slots.fuel, accepts: (s) => s.item === 'bucket' },
          }
        : { fuel: slots.fuel };
  if (type === 'brewingStand')
    return face === 'top'
      ? { ingredient: slots.ingredient }
      : face === 'bottom'
        ? {
            0: slots[0],
            1: slots[1],
            2: slots[2],
          }
        : { 0: slots[0], 1: slots[1], 2: slots[2], fuel: slots.fuel };
  return slots;
}
