import { SMELTING } from './exploration-data.js';

export const FUELS = {
  coal: 80,
  charcoal: 80,
  wood: 15,
  planks: 15,
  lavaBucket: 1000,
};
export const smeltingRecipe = (item) => {
  const entry = Object.entries(SMELTING).find(
    ([, recipe]) => recipe.input === item,
  );
  return entry ? { output: entry[0], ...entry[1] } : null;
};
export const newFurnace = () => ({
  input: null,
  fuel: null,
  output: null,
  progress: 0,
  burn: 0,
  burnTotal: 0,
});
export function furnaceStatus(f) {
  const recipe = smeltingRecipe(f.input?.item);
  if (!recipe) return '等待原料';
  if (f.output && (f.output.item !== recipe.output || f.output.count >= 64))
    return '产物槽已满，请取出';
  if (f.burn <= 0 && !FUELS[f.fuel?.item]) return '等待燃料';
  return '正在烧炼';
}
// Loaded simulation time only: opening the furnace keeps it working; other menus pause it.
export function tickFurnace(f, dt) {
  const recipe = smeltingRecipe(f.input?.item);
  const canCook =
    recipe &&
    (!f.output || (f.output.item === recipe.output && f.output.count < 64));
  if (canCook && f.burn <= 0 && FUELS[f.fuel?.item]) {
    f.burn = f.burnTotal = FUELS[f.fuel.item];
    if (f.fuel.item === 'lavaBucket') f.fuel = { item: 'bucket', count: 1 };
    else if (--f.fuel.count <= 0) f.fuel = null;
  }
  const heat = Math.min(dt, f.burn);
  f.burn = Math.max(0, f.burn - dt);
  if (!canCook) {
    f.progress = 0;
    return;
  }
  if (!heat) {
    f.progress = Math.max(0, f.progress - dt * 2);
    return;
  }
  f.progress += heat;
  if (f.progress >= recipe.seconds) {
    f.progress -= recipe.seconds;
    if (!f.output) f.output = { item: recipe.output, count: 0 };
    f.output.count++;
    if (--f.input.count <= 0) {
      f.input = null;
      f.progress = 0;
    }
  }
}
export function validFurnace(f) {
  if (
    !f ||
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
    if (
      !s ||
      !Number.isInteger(s.count) ||
      s.count < 1 ||
      s.count > (['lavaBucket', 'bucket'].includes(s.item) ? 1 : 64)
    )
      return false;
    if (slot === 'input' && !smeltingRecipe(s.item)) return false;
    if (slot === 'fuel' && !FUELS[s.item] && s.item !== 'bucket') return false;
    if (slot === 'output' && !Object.hasOwn(SMELTING, s.item)) return false;
  }
  return true;
}
