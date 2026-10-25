import { ITEMS, RECIPES } from './core.js';
import { FOODS } from './survival.js';
import { woodKey } from './wood-data.js';
import {
  ingredientCount,
  ingredientMatches,
  recipeMaterials,
} from './wood-ingredients.js';
import {
  PlayerInventory,
  copyStack,
  stackSize,
  validStack,
} from './inventory.js';

// Matches the seven UI cells: upper-left, top, upper-right, centre,
// lower-left, bottom, lower-right. Geometry, not array order, defines recipes.
export const CRAFT_CELLS = [
  [-1, 0],
  [0, -1],
  [1, -1],
  [0, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
];
const cellAt = new Map(CRAFT_CELLS.map(([q, r], i) => [q + ',' + r, i]));
const rotate = ([q, r]) => [-r, q + r];
const reflect = ([q, r]) => [-q, q + r];
const signature = (cells) => cells.map((s) => woodKey(s?.item || '')).join('|');
export const newCraftingGrid = () => Array(7).fill(null);
export const validCraftingGrid = (grid) =>
  Array.isArray(grid) && grid.length === 7 && grid.every(validStack);
export const recipeCells = (recipe) =>
  recipe.pattern.map((item, i) =>
    item ? { item, count: recipe.patternCounts?.[i] || 1 } : null,
  );

function compileRecipes() {
  const registry = new Map();
  RECIPES.forEach((recipe, index) => {
    const seen = new Set();
    const original = recipeCells(recipe).flatMap((s, i) =>
      s ? [{ ...s, point: CRAFT_CELLS[i] }] : [],
    );
    for (const mirror of [false, true]) {
      let cells = original.map((s) => ({
        ...s,
        point: mirror ? reflect(s.point) : s.point,
      }));
      for (let turn = 0; turn < 6; turn++) {
        // Crop empty margins like a shaped recipe, then translate anywhere it fits.
        for (const target of CRAFT_CELLS) {
          const dq = target[0] - cells[0].point[0],
            dr = target[1] - cells[0].point[1];
          const variant = newCraftingGrid();
          let fits = true;
          for (const s of cells) {
            const i = cellAt.get(s.point[0] + dq + ',' + (s.point[1] + dr));
            if (i === undefined) {
              fits = false;
              break;
            }
            variant[i] = { item: s.item, count: s.count };
          }
          if (!fits) continue;
          const key = signature(variant),
            fullKey = key + ':' + variant.map((s) => s?.count || 0).join(',');
          if (seen.has(fullKey)) continue;
          seen.add(fullKey);
          if (!registry.has(key)) registry.set(key, []);
          registry.get(key).push({ index, recipe, cells: variant });
        }
        cells = cells.map((s) => ({ ...s, point: rotate(s.point) }));
      }
    }
  });
  return registry;
}
const registry = compileRecipes();
export function craftingMatches(grid, station = true) {
  const matches = registry.get(signature(grid)) || [],
    seen = new Set();
  return matches.filter((match) => {
    if ((match.recipe.station && !station) || seen.has(match.recipe.id))
      return false;
    if (
      !match.cells.every(
        (s, i) =>
          !s ||
          (ingredientMatches(match.recipe, s.item, grid[i]?.item) &&
            grid[i].count >= s.count),
      )
    )
      return false;
    seen.add(match.recipe.id);
    return true;
  });
}
export const craftingResult = (match) =>
  match
    ? {
        item: match.recipe.id,
        count: match.recipe.count,
        ...(ITEMS[match.recipe.id].durability
          ? { wear: ITEMS[match.recipe.id].durability }
          : {}),
      }
    : null;
export function craftingStock(pack, grid) {
  const stock = { ...pack.counts };
  for (const s of grid) if (s) stock[s.item] = (stock[s.item] || 0) + s.count;
  return stock;
}
export function availableBatches(recipe, stock) {
  let upper = Math.max(
    0,
    Math.min(
      ...Object.entries(recipe.cost).map(([id, n]) =>
        Math.floor(ingredientCount(recipe, id, stock) / n),
      ),
      ...recipeCells(recipe)
        .filter(Boolean)
        .map((s) => Math.floor(stackSize(s.item) / s.count)),
    ),
  );
  let lower = 0;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (recipeMaterials(recipe, stock, middle)) lower = middle;
    else upper = middle - 1;
  }
  return lower;
}

// Stage on copies. If the old grid cannot be returned, the entire operation is
// rejected without touching either inventory. Materials already in the grid
// are reused before touching the player's bag, including individual equipment.
export function fillCraftingRecipe(
  pack,
  grid,
  recipe,
  all = false,
  creative = false,
) {
  const stock = craftingStock(pack, grid),
    cells = recipeCells(recipe);
  const maximum = creative
    ? Math.min(
        ...cells
          .filter(Boolean)
          .map((s) => Math.floor(stackSize(s.item) / s.count)),
      )
    : availableBatches(recipe, stock);
  if (!maximum) return { ok: false, reason: 'missing' };
  const sameLayout = cells.every((s, i) =>
    s ? ingredientMatches(recipe, s.item, grid[i]?.item) : !grid[i],
  );
  const existing = sameLayout
    ? Math.min(
        ...cells.flatMap((s, i) =>
          s ? [Math.floor(grid[i].count / s.count)] : [],
        ),
      )
    : 0;
  const batches = all ? maximum : Math.min(maximum, existing + 1);
  const materials = creative
    ? cells.map((s, i) =>
        s
          ? {
              item: ingredientMatches(recipe, s.item, grid[i]?.item)
                ? grid[i].item
                : s.item,
              count: s.count * batches,
            }
          : null,
      )
    : recipeMaterials(recipe, stock, batches, grid);
  if (!materials) return { ok: false, reason: 'missing' };
  const draft = new PlayerInventory(pack.serialize()),
    rest = structuredClone(grid);
  const filled = newCraftingGrid();
  for (let i = 0; i < cells.length; i++) {
    const need = materials[i];
    if (!need) continue;
    let left = need.count,
      source;
    for (const list of [rest, draft.slots])
      for (let j = 0; j < list.length && left; j++) {
        const s = list[j];
        if (!s || s.item !== need.item) continue;
        const n = Math.min(left, s.count);
        source ||= copyStack(s);
        left -= n;
        s.count -= n;
        if (!s.count) list[j] = null;
      }
    if (left && !creative) return { ok: false, reason: 'missing' };
    filled[i] = source ? copyStack(source, need.count) : { ...need };
    if (ITEMS[need.item].durability && filled[i].wear === undefined)
      filled[i].wear = ITEMS[need.item].durability;
  }
  for (const s of rest)
    if (s && draft.insertStack(s) !== s.count)
      return { ok: false, reason: 'full' };
  pack.slots = draft.slots;
  grid.splice(0, 7, ...filled);
  return { ok: true, batches };
}

// Return containers to their vacated ingredient cell first (e.g. a milk bucket
// becomes an empty bucket). Other remainders are handled after the transaction,
// so they cannot occupy a hotbar slot while a number-key swap is still running.
export function consumeCrafting(grid, match) {
  const sources = structuredClone(grid);
  for (let i = 0; i < grid.length; i++) {
    const n = match.cells[i]?.count;
    if (!n) continue;
    grid[i].count -= n;
    if (!grid[i].count) grid[i] = null;
  }
  const remainders = [];
  for (const [id, count] of Object.entries(match.recipe.returns || {})) {
    let left = count;
    const order = grid
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Number(FOODS[sources[b]?.item]?.container === id) -
          Number(FOODS[sources[a]?.item]?.container === id),
      );
    for (const i of order) {
      if (!left || grid[i] || !match.cells[i]) continue;
      const n = Math.min(left, stackSize(id));
      grid[i] = { item: id, count: n };
      left -= n;
    }
    while (left) {
      const n = Math.min(left, stackSize(id));
      remainders.push({ item: id, count: n });
      left -= n;
    }
  }
  return remainders;
}
export function returnCraftingGrid(pack, grid) {
  let remaining = 0;
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    const moved = pack.insertStack(s);
    s.count -= moved;
    if (!s.count) grid[i] = null;
    else remaining += s.count;
  }
  return remaining;
}
export function transformCraftingGrid(grid, mirror = false) {
  const transformed = newCraftingGrid();
  grid.forEach((s, i) => {
    const [q, r] = (mirror ? reflect : rotate)(CRAFT_CELLS[i]);
    transformed[cellAt.get(q + ',' + r)] = s;
  });
  grid.splice(0, 7, ...transformed);
}

// Shift-click crafts the actual grid repeatedly. It never refills from the bag.
// A full result must fit before committing any consumed ingredients.
export function quickCraft(pack, grid, preferred, station = true, limit = 64) {
  let count = 0,
    recipeId = null;
  const remainders = [];
  for (let batch = 0; batch < limit; batch++) {
    const matches = craftingMatches(grid, station);
    const match = matches.find((m) => m.index === preferred) || matches[0];
    if (!match || (recipeId && match.recipe.id !== recipeId)) break;
    const output = craftingResult(match),
      draft = new PlayerInventory(pack.serialize());
    if (draft.insertStack(output) !== output.count) break;
    const next = structuredClone(grid),
      returns = consumeCrafting(next, match);
    for (const s of returns) {
      const moved = draft.insertStack(s);
      if (moved < s.count) remainders.push(copyStack(s, s.count - moved));
    }
    pack.slots = draft.slots;
    grid.splice(0, 7, ...next);
    recipeId = output.item;
    count += output.count;
  }
  return { count, item: recipeId, remainders };
}
