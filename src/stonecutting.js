import { CUT_MATERIALS } from './building-data.js';
const recipes = [];
const add = (input, output, count = 1) => {
  if (!recipes.some((r) => r.input === input && r.output === output))
    recipes.push({ input, output, count });
};
for (const [base] of CUT_MATERIALS) {
  if (/planks$/i.test(base)) continue;
  add(base, base + 'Slab', 2);
  add(base, base + 'Stairs');
}
for (const [input, block] of [
  ['stone', 'brick'],
  ['endstone', 'endstoneBricks'],
]) {
  add(input, block);
  add(input, block + 'Slab', 2);
  add(input, block + 'Stairs');
}
add('purpur', 'purpurPillar');
add('smoothStone', 'smoothStoneSlab', 2);
export const stonecuttingRecipes = (item) =>
  recipes.filter((r) => r.input === item);
export const canStonecut = (item) => recipes.some((r) => r.input === item);
export function stonecuttingResult(stack, selection) {
  const recipe = stonecuttingRecipes(stack?.item).find(
    (r) => r.output === selection,
  );
  return stack?.count > 0 && recipe
    ? { item: recipe.output, count: recipe.count }
    : null;
}
