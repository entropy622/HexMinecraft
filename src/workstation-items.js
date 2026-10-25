import { ITEMS } from './core.js';
import { validStack } from './inventory.js';
import { repairMaterial } from './smithing.js';
import { woodKey } from './wood-data.js';

const repairMaterials = new Set(
  Object.keys(ITEMS).map(repairMaterial).filter(Boolean),
);
export const smithIngredient = (stack) =>
  !!(
    stack &&
    (ITEMS[stack.item]?.durability || repairMaterials.has(woodKey(stack.item)))
  );
export const newWorkstationItems = () => ({
  enchant: [null, null],
  smith: [null, null],
});
export function validWorkstationItems(items) {
  if (items === undefined) return true;
  return !!(
    items &&
    ['enchant', 'smith'].every(
      (key) =>
        Array.isArray(items[key]) &&
        items[key].length === 2 &&
        items[key].every(validStack),
    ) &&
    (!items.enchant[0] || ITEMS[items.enchant[0].item].durability) &&
    (!items.enchant[1] || items.enchant[1].item === 'lapis') &&
    (!items.smith[0] || ITEMS[items.smith[0].item].durability) &&
    (!items.smith[1] || smithIngredient(items.smith[1]))
  );
}
