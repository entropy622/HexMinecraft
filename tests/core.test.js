import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS,
  axialToWorld,
  worldToAxial,
  hexDistance,
  RECIPES,
} from '../src/core.js';
import { World } from '../src/world.js';
import { validateSave } from '../src/save.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';
import { currentSave } from './fixtures/current-save.js';
test('axial coordinates round-trip across positive and negative cells', () => {
  for (let q = -35; q <= 35; q++)
    for (let r = -35; r <= 35; r++) {
      const p = axialToWorld(q, r);
      assert.deepEqual(worldToAxial(p.x, p.z), { q: q || 0, r: r || 0 });
    }
});
test('each hexagon has six equally spaced adjacent cells', () => {
  for (const [q, r] of DIRECTIONS) {
    assert.equal(hexDistance(q, r), 1);
    const p = axialToWorld(q, r);
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - Math.sqrt(3)) < 1e-9);
  }
});
test('world generation is deterministic and seeds change terrain', () => {
  const a = new World(624),
    b = new World(624),
    c = new World(625);
  assert.deepEqual(a.blocks, b.blocks);
  assert.notDeepEqual(a.heights, c.heights);
  assert.ok([...a.blocks.values()].includes('ironOre'));
  assert.ok([...a.blocks.values()].includes('coalOre'));
});
test('edits persist both placement and removal', () => {
  const a = new World(12);
  a.set(0, 1, 0, null);
  a.set(1, 22, 0, 'planks');
  const b = new World(12, 'overworld', { edits: [...a.edits] });
  assert.equal(b.get(0, 1, 0), undefined);
  assert.equal(b.get(1, 22, 0), 'planks');
  assert.deepEqual(a.blocks, b.blocks);
});
test('current slot crafting consumes materials, requires its station, and fails atomically', () => {
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  pack.insert('wood', 10);
  pack.insert('cobble', 10);
  const planks = RECIPES.findIndex((r) => r.id === 'planks'),
    pick = RECIPES.findIndex((r) => r.id === 'pick2');
  assert.ok(fillCraftingRecipe(pack, grid, RECIPES[planks]).ok);
  assert.equal(quickCraft(pack, grid, planks, false, 1).count, 4);
  assert.equal(pack.count('wood'), 9);
  assert.equal(pack.count('planks'), 4);
  assert.ok(fillCraftingRecipe(pack, grid, RECIPES[pick]).ok);
  const before = { pack: pack.serialize(), grid: structuredClone(grid) };
  assert.equal(quickCraft(pack, grid, pick, false, 1).count, 0);
  assert.deepEqual({ pack: pack.serialize(), grid }, before);
  assert.equal(quickCraft(pack, grid, pick, true, 1).count, 1);
  assert.equal(pack.count('wood'), 7);
  assert.equal(pack.count('cobble'), 5);
  assert.equal(pack.count('pick2'), 1);
  assert.ok(fillCraftingRecipe(pack, grid, RECIPES[pick]).ok);
  assert.equal(quickCraft(pack, grid, pick, true, 1).count, 1);
  const emptyBefore = { pack: pack.serialize(), grid: structuredClone(grid) };
  assert.equal(fillCraftingRecipe(pack, grid, RECIPES[pick]).ok, false);
  assert.deepEqual({ pack: pack.serialize(), grid }, emptyBefore);
});
test('nine-item storage recipes fit the seven cells and unpack without item loss', () => {
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  pack.insert('coal', 9);
  const block = RECIPES.findIndex((r) => r.id === 'coalBlock'),
    unpack = RECIPES.findIndex((r) => r.id === 'coal' && r.cost.coalBlock);
  assert.ok(fillCraftingRecipe(pack, grid, RECIPES[block]).ok);
  assert.equal(quickCraft(pack, grid, block, true, 1).count, 1);
  assert.equal(pack.count('coal'), 0);
  assert.equal(pack.count('coalBlock'), 1);
  assert.ok(fillCraftingRecipe(pack, grid, RECIPES[unpack]).ok);
  assert.equal(quickCraft(pack, grid, unpack, false, 1).count, 9);
  assert.equal(pack.count('coal'), 9);
  assert.equal(pack.count('coalBlock'), 0);
});
test('save validator rejects corrupt or unbounded data', () => {
  assert.equal(validateSave(currentSave()).seed, 624);
  for (const override of [
    { version: 2 },
    { seed: -1 },
    { inventory: { wood: -1 } },
    { inventory: { script: 1 } },
    { position: [Infinity, 0, 0] },
    { health: 999 },
    { crafting: [null] },
    { creativeFlying: 'yes' },
  ])
    assert.throws(() => validateSave({ ...currentSave(), ...override }));
});
