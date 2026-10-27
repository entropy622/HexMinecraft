import { SMELTING } from './exploration-data.js';
import { WOOD_GROUPS, woodKey } from './wood-data.js';
import { BUILDING_BLOCKS } from './building-data.js';
import { FURNACES, isFurnace } from './processing-data.js';
import { validStack } from './inventory.js';

export const FUELS = {
  coal: 80,
  coalBlock: 800,
  charcoal: 80,
  ...Object.fromEntries(
    [...WOOD_GROUPS.wood, ...WOOD_GROUPS.planks].map((id) => [id, 15]),
  ),
  ...Object.fromEntries(
    Object.entries(BUILDING_BLOCKS)
      .filter(([, def]) => def.wooden && !def.internal)
      .map(([id, def]) => [id, def.fuel || 15]),
  ),
  lavaBucket: 1000,
};
export const smeltingRecipe = (item, kind = 'furnace') => {
  if (!isFurnace(kind)) return null;
  const entry = Object.entries(SMELTING).find(([, recipe]) =>
    (recipe.inputs || [recipe.input]).includes(
      woodKey(item) === 'wood' ? 'wood' : item,
    ),
  );
  if (!entry) return null;
  const group =
    /Ore$/.test(item || '') ||
    ['rawIron', 'rawGold', 'rawCopper'].includes(item)
      ? 'ore'
      : ['cooked', 'cookedCod', 'cookedSalmon', 'bakedPotato'].includes(
            entry[0],
          )
        ? 'food'
        : 'other';
  return !FURNACES[kind].group || FURNACES[kind].group === group
    ? { output: entry[0], ...entry[1] }
    : null;
};
export const newFurnace = (kind = 'furnace') => ({
  kind,
  xp: 0,
  input: null,
  fuel: null,
  output: null,
  progress: 0,
  burn: 0,
  burnTotal: 0,
});
export function furnaceStatus(f) {
  const recipe = smeltingRecipe(f.input?.item, f.kind);
  if (!recipe) return '等待原料';
  if (f.output && (f.output.item !== recipe.output || f.output.count >= 64))
    return '产物槽已满，请取出';
  if (f.burn <= 0 && !FUELS[f.fuel?.item]) return '等待燃料';
  return '正在烧炼';
}
// Loaded simulation time only: opening the furnace keeps it working; other menus pause it.
export function tickFurnace(f, dt) {
  const work = dt * FURNACES[f.kind].speed;
  const recipe = smeltingRecipe(f.input?.item, f.kind);
  const canCook =
    recipe &&
    (!f.output || (f.output.item === recipe.output && f.output.count < 64));
  if (canCook && f.burn <= 0 && FUELS[f.fuel?.item]) {
    f.burn = f.burnTotal = FUELS[f.fuel.item];
    if (f.fuel.item === 'lavaBucket') f.fuel = { item: 'bucket', count: 1 };
    else if (--f.fuel.count <= 0) f.fuel = null;
  }
  const heat = Math.min(work, f.burn);
  f.burn = Math.max(0, f.burn - work);
  if (!canCook) {
    f.progress = 0;
    return;
  }
  if (!heat) {
    f.progress = Math.max(0, f.progress - work * 2);
    return;
  }
  f.progress += heat;
  if (f.progress >= recipe.seconds) {
    f.progress -= recipe.seconds;
    if (!f.output) f.output = { item: recipe.output, count: 0 };
    f.output.count++;
    const reward =
      recipe.xp ??
      (['ingot', 'goldIngot', 'copperIngot'].includes(recipe.output)
        ? 0.7
        : recipe.output === 'glass'
          ? 0.1
          : recipe.output === 'charcoal'
            ? 0.15
            : 0.35);
    f.xp = (f.xp || 0) + reward;
    if (--f.input.count <= 0) {
      f.input = null;
      f.progress = 0;
    }
  }
}
export function validFurnace(f) {
  if (
    !f ||
    !isFurnace(f.kind) ||
    !Number.isFinite(f.xp) ||
    f.xp < 0 ||
    f.xp > Number.MAX_SAFE_INTEGER ||
    !['progress', 'burn', 'burnTotal'].every(
      (k) => Number.isFinite(f[k]) && f[k] >= 0,
    )
  )
    return false;
  if (f.progress > 10 || f.burnTotal > 1000 || f.burn > f.burnTotal)
    return false;
  for (const slot of ['input', 'fuel', 'output']) {
    const s = f[slot];
    if (s === null) continue;
    if (!validStack(s)) return false;
    if (slot === 'input' && !smeltingRecipe(s.item, f.kind)) return false;
    if (slot === 'fuel' && !FUELS[s.item] && s.item !== 'bucket') return false;
    if (slot === 'output' && !Object.hasOwn(SMELTING, s.item)) return false;
  }
  return true;
}
