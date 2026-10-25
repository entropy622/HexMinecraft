import { WOOD_GROUPS, LOG_VARIANTS } from './wood-data.js';

export const ingredientChoices = (recipe, id) =>
  (!recipe.exactWood && WOOD_GROUPS[id]) || LOG_VARIANTS[id] || [id];
export const ingredientMatches = (recipe, expected, actual) =>
  ingredientChoices(recipe, expected).includes(actual);
export const ingredientCount = (recipe, id, stock) =>
  ingredientChoices(recipe, id).reduce((n, key) => n + (stock[key] || 0), 0);
export const ingredientName = (recipe, id, name) =>
  ingredientChoices(recipe, id).length > 1
    ? !recipe.exactWood && WOOD_GROUPS[id]
      ? id === 'wood'
        ? '任意原木'
        : '任意木板'
      : name + '（含去皮）'
    : name;

// Assign one real material to each cell, since a slot cannot hold a mixture of
// wood species. Quantized planning also bounds bulk autofill to what fits the
// seven cells, rather than treating the aggregate resource count as sufficient.
export function recipeMaterials(recipe, stock, batches, preferred = []) {
  const remaining = { ...stock },
    plan = Array(recipe.pattern.length).fill(null);
  const needs = recipe.pattern.flatMap((item, index) =>
    item
      ? [
          {
            item,
            index,
            count: (recipe.patternCounts?.[index] || 1) * batches,
            choices: ingredientChoices(recipe, item),
          },
        ]
      : [],
  );
  needs.sort(
    (a, b) => a.choices.length - b.choices.length || b.count - a.count,
  );
  for (const need of needs) {
    const candidates = need.choices.filter(
      (id) => (remaining[id] || 0) >= need.count,
    );
    candidates.sort(
      (a, b) =>
        Number(b === preferred[need.index]?.item) -
          Number(a === preferred[need.index]?.item) ||
        (remaining[b] || 0) - (remaining[a] || 0),
    );
    const item = candidates[0];
    if (!item) return null;
    remaining[item] -= need.count;
    plan[need.index] = { item, count: need.count };
  }
  return plan;
}
