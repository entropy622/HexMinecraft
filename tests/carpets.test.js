import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { BLOCKS, RECIPES, axialToWorld } from '../src/core.js';
import { DYES } from '../src/dye-data.js';
import { woolItem } from '../src/wool-data.js';
import { CARPET_BLOCKS, carpetSupport } from '../src/carpet-data.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
  craftingMatches,
  transformCraftingGrid,
} from '../src/crafting.js';
import { buildingParts } from '../src/building-shapes.js';
import { bodyClear, findFloor } from '../src/grounding.js';
import { miningStats } from '../src/mining.js';
import { miningLoot } from '../src/mining-loot.js';
import { VoxelLight } from '../src/voxel-light.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';
import { ItemDrops } from '../src/item-drops.js';
import { Scene } from 'three';

// Failure classes were recorded before product edits in carpets-verification.md.
function world() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  return w;
}
test('all sixteen personal recipes consume two exact-color wool and produce three real carpet items in every rotation', () => {
  assert.equal(Object.keys(CARPET_BLOCKS).length, 16);
  for (const color of Object.keys(DYES)) {
    const id = color + 'Carpet',
      recipe = RECIPES.find((r) => r.id === id);
    for (let turn = 0; turn < 6; turn++) {
      const pack = new PlayerInventory(),
        grid = newCraftingGrid();
      pack.insert(woolItem(color), 2);
      assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
      for (let t = 0; t < turn; t++) transformCraftingGrid(grid);
      const match = craftingMatches(grid, false).find(
        (m) => m.recipe.id === id,
      );
      assert.ok(match, `${id} rotation ${turn}`);
      assert.equal(quickCraft(pack, grid, match.index, false).count, 3);
      assert.equal(pack.count(id), 3);
      assert.equal(pack.count(woolItem(color)), 0);
      assert.ok(grid.every((s) => !s));
    }
  }
});
test('mixed colors, insufficient wool and a full result inventory never spend the ingredients', () => {
  const recipe = RECIPES.find((r) => r.id === 'blueCarpet');
  for (const stock of [
    { blueWool: 1 },
    { blueWool: 1, redWool: 1 },
    { wool: 2 },
    { stone: 2 },
  ]) {
    const pack = new PlayerInventory(),
      grid = newCraftingGrid();
    for (const [id, n] of Object.entries(stock)) pack.insert(id, n);
    const before = pack.serialize();
    assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, false);
    assert.deepEqual(pack.serialize(), before);
  }
  for (const [a, b] of [
    ['blueWool', 'redWool'],
    ['blueWool', 'wool'],
    ['wool', 'redWool'],
  ]) {
    const grid = newCraftingGrid();
    grid[3] = { item: a, count: 1 };
    grid[6] = { item: b, count: 1 };
    assert.equal(craftingMatches(grid, false).length, 0);
  }
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  pack.insert('blueWool', 6);
  assert.equal(fillCraftingRecipe(pack, grid, recipe, true).batches, 3);
  pack.insert('stone', 36 * 64);
  const escrow = structuredClone(grid);
  assert.equal(quickCraft(pack, grid, RECIPES.indexOf(recipe), false).count, 0);
  assert.deepEqual(grid, escrow);
  pack.slots[0] = null;
  assert.equal(quickCraft(pack, grid, RECIPES.indexOf(recipe), false).count, 9);
  assert.equal(pack.count('blueCarpet'), 9);
});
test('all colors use the real 1/16 hex floor, step collision and their existing wool material', () => {
  const w = world();
  for (const [id, def] of Object.entries(CARPET_BLOCKS)) {
    w.set(0, 39, 0, 'stone');
    w.set(0, 40, 0, id);
    const parts = buildingParts(w, 0, 40, 0, true);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].tile, def.tile);
    assert.equal(BLOCKS[def.tile].color, def.color);
    assert.equal(w.pointSolid(0, 40.03, 0), true);
    assert.equal(w.pointSolid(0, 40.07, 0), false);
    assert.equal(w.groundAt(0, 0, 40, 41), 40.0625);
    assert.equal(findFloor(w, 0, 0, 40), 40.0625);
    assert.equal(bodyClear(w, 0, 0, 40.063, 41.8), true);
    assert.equal(bodyClear(w, 0, 0, 40.03, 41.8), false);
  }
  w.set(1, 40, 0, 'blackCarpet');
  const p = axialToWorld(1, 0);
  assert.equal(findFloor(w, p.x, p.z, 40), 40.0625);
});
test('carpet supports accept existing partial blocks and liquids, reject air, and retain the raised fence center', () => {
  const w = world();
  w.set(0, 40, 0, null);
  assert.equal(carpetSupport(w, 0, 41, 0), false);
  for (const id of [
    'stone',
    'stoneSlab',
    'stoneStairs',
    'trapdoor',
    'fence',
    'redCarpet',
    'stonePressurePlate',
  ]) {
    w.set(0, 40, 0, id);
    assert.equal(carpetSupport(w, 0, 41, 0), true, id);
  }
  w.set(0, 40, 0, 'fence');
  w.set(0, 41, 0, 'whiteCarpet');
  assert.equal(w.groundAt(0, 0, 40, 42), 41.5);
  assert.equal(w.groundAt(0.5, 0, 40, 42), 41.0625);
  assert.equal(w.pointSolid(0, 41.4, 0), true);
  assert.equal(w.pointSolid(0.5, 41.4, 0), false);
  w.set(0, 40, 0, 'stoneSlab');
  assert.equal(w.groundAt(0, 0, 40, 42), 41.0625);
  w.set(0, 40, 0, null);
  assert.equal(w.fluids.source(0, 40, 0, 'water'), true);
  assert.equal(carpetSupport(w, 0, 41, 0), true);
  w.fluids.write(0, 40, 0, null);
  assert.equal(carpetSupport(w, 0, 41, 0), false);
  w.set(0, 41, 0, 'redCarpet');
  assert.equal(w.fluids.open(0, 41, 0), true);
  assert.equal(w.fluids.source(0, 41, 0, 'water'), true);
  assert.equal(carpetSupport(w, 0, 41, 0), false);
});
test('thin floors transmit sky and hidden light without conducting redstone or claiming a full cube', () => {
  const w = world();
  w.set(0, 39, 0, 'glowstone');
  const light = new VoxelLight(w);
  light.update(0, true);
  const at = light.index(0, 40, 0),
    before = light.rgb.map((c) => c[at]);
  for (const id of Object.keys(CARPET_BLOCKS)) {
    w.set(0, 40, 0, id);
    light.update(0, true);
    assert.equal(light.cost[at], 1);
    assert.equal(light.sky[at], 15);
    assert.deepEqual(
      light.rgb.map((c) => c[at]),
      before,
    );
    assert.equal(w.redstone.conductive(0, 40, 0), false);
  }
});
test('all carpets break with bare hands and every tool at the same speed and drop exactly one of their own color', () => {
  for (const id of Object.keys(CARPET_BLOCKS))
    for (const held of [null, 'shears', 'pick4', 'sword', 'axe1']) {
      const stats = miningStats(id, held);
      assert.equal(stats.harvest, true);
      assert.equal(stats.speed, 1);
      assert.deepEqual(miningLoot(id, { tool: held }).stacks, [
        { item: id, count: 1 },
      ]);
    }
});
test('the real piston scheduler moves each colored carpet across supported cells without duplicating its identity', () => {
  const w = world();
  for (const id of Object.keys(CARPET_BLOCKS)) {
    w.set(-2, 40, -1, 'piston');
    w.setState(-2, 40, -1, { facing: 0, open: false, powered: false });
    w.set(-1, 39, -1, 'stone');
    w.set(0, 39, -1, 'stone');
    w.set(-1, 40, -1, id);
    w.set(0, 40, -1, null);
    w.set(-2, 40, 0, 'lever');
    w.setState(-2, 40, 0, {
      facing: 0,
      open: false,
      powered: true,
      mount: 'floor',
    });
    w.redstone.tick(0, []);
    w.redstone.tick(0.1, []);
    assert.equal(w.get(-1, 40, -1), 'pistonHead');
    assert.equal(w.get(0, 40, -1), id);
    assert.equal(carpetSupport(w, 0, 40, -1), true);
    assert.equal(
      [...w.blocks.values()].filter((type) => type === id).length,
      1,
    );
    w.setState(-2, 40, 0, { ...w.state(-2, 40, 0), powered: false });
    w.redstone.tick(0, []);
    w.redstone.tick(0.1, []);
    assert.equal(w.state(-2, 40, -1).open, false);
    w.set(0, 40, -1, null);
  }
});
test('real serializers preserve sixteen color identities, inventory stacks and loose carpets in the existing v16 save', () => {
  const w = world(),
    pack = new PlayerInventory(),
    drops = new ItemDrops(new Scene(), null);
  const entries = Object.keys(CARPET_BLOCKS).map((id, i) => [
    i % 4,
    40,
    Math.floor(i / 4),
    id,
  ]);
  for (const [q, y, r, id] of entries) {
    w.set(q, y - 1, r, 'stone');
    w.set(q, y, r, id);
    pack.insert(id, 3);
    drops.spawn(id, 1, [q * 2, 41, r * 2], {}, [0, 0, 0]);
  }
  const saved = currentSave(w);
  saved.inventory = pack.serialize();
  saved.dimensions.overworld.drops = drops.serialize();
  const parsed = validateSave(JSON.parse(JSON.stringify(saved)));
  const restored = new World(624, 'overworld', {
    ...parsed.dimensions.overworld,
    load: false,
  });
  restored.ensureAround(0, 0, 1);
  for (const [q, y, r, id] of entries) assert.equal(restored.get(q, y, r), id);
  assert.deepEqual(
    new PlayerInventory(parsed.inventory).serialize(),
    pack.serialize(),
  );
  assert.equal(parsed.dimensions.overworld.drops.length, 16);
});
