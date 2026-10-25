import { POTIONS, BREW_INGREDIENTS, brewResult } from './brewing-data.js';
export const BREW_SECONDS = 20;
export const newBrewing = () => ({
  bottles: [null, null, null],
  ingredient: null,
  fuelStock: 0,
  charges: 0,
  progress: 0,
  batch: null,
});
export const brewingSignature = (b) =>
  b.ingredient?.item + ':' + b.bottles.join('|');
export const brewingOutputs = (b) =>
  b.bottles.map((id) => brewResult(id, b.ingredient?.item));
export const resetBrewing = (b) => {
  b.progress = 0;
  b.batch = null;
};
export function tickBrewing(b, dt) {
  const outputs = brewingOutputs(b);
  if (!b.ingredient || !outputs.some(Boolean)) {
    resetBrewing(b);
    return false;
  }
  const signature = brewingSignature(b);
  if (signature !== b.batch) {
    if (b.charges === 0 && b.fuelStock > 0) {
      b.fuelStock--;
      b.charges = 20;
    }
    if (b.charges === 0) {
      resetBrewing(b);
      return false;
    }
    b.charges--;
    b.batch = signature;
    b.progress = 0;
  }
  b.progress += dt;
  if (b.progress < BREW_SECONDS) return false;
  b.bottles = b.bottles.map((id, i) => outputs[i] || id);
  if (--b.ingredient.count <= 0) b.ingredient = null;
  resetBrewing(b);
  return true;
}
export function brewingStatus(b) {
  if (!b.ingredient) return '放入一种酿造原料';
  if (!b.bottles.some(Boolean)) return '放入最多三瓶药水';
  if (!brewingOutputs(b).some(Boolean)) return '原料与当前药水不匹配';
  if (!b.batch && !b.charges && !b.fuelStock) return '加入烈焰粉作为燃料';
  return '正在酿造';
}
export function validBrewing(b) {
  return (
    b &&
    Array.isArray(b.bottles) &&
    b.bottles.length === 3 &&
    b.bottles.every((id) => id === null || Object.hasOwn(POTIONS, id)) &&
    (b.ingredient === null ||
      (b.ingredient &&
        BREW_INGREDIENTS.includes(b.ingredient.item) &&
        Number.isInteger(b.ingredient.count) &&
        b.ingredient.count > 0 &&
        b.ingredient.count <= 64)) &&
    ['fuelStock', 'charges'].every(
      (key) =>
        Number.isInteger(b[key]) &&
        b[key] >= 0 &&
        b[key] <= (key === 'fuelStock' ? 64 : 20),
    ) &&
    Number.isFinite(b.progress) &&
    b.progress >= 0 &&
    b.progress < BREW_SECONDS &&
    (b.batch === null
      ? b.progress === 0
      : b.batch === brewingSignature(b) &&
        b.ingredient &&
        brewingOutputs(b).some(Boolean))
  );
}
