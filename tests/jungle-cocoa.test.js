import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, DIRECTIONS, RECIPES, key, axialToWorld } from '../src/core.js';
import { World } from '../src/world.js';
import { treeCells } from '../src/tree-layout.js';
import { treePlan } from '../src/farming.js';
import {
  cocoaSupport,
  growCocoa,
  harvestCocoa,
  tickCocoa,
} from '../src/cocoa.js';
import { buildingParts } from '../src/building-shapes.js';
import { miningLoot } from '../src/mining-loot.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  fillCraftingRecipe,
  newCraftingGrid,
  quickCraft,
} from '../src/crafting.js';
import { smeltingRecipe, FUELS } from '../src/furnaces.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import { actuatePiston } from '../src/pistons.js';
import { bodyClear } from '../src/grounding.js';

// Each group traces to the preimplementation failure list in the verification doc.
function farm(dimension = 'overworld') {
  const w = new World(624, dimension, { load: false });
  w.ensureAround(0, 0, 1);
  return w;
}
function pod(w, q = 0, y = 40, r = 0, facing = 0, age = 0) {
  const [dq, dr] = DIRECTIONS[facing];
  w.set(q + dq, y, r + dr, 'jungleWood');
  w.set(q, y, r, 'cocoa');
  w.setState(q, y, r, { facing, open: false, age });
}
const tick = (w, dt = 0) => w.redstone.tick(dt, [], () => true);

test('hot wet jungle is discoverable, distinct from dry desert and cold snow', () => {
  const w = new World(624, 'overworld', { load: false }),
    counts = {};
  for (let q = -160; q <= 160; q += 4)
    for (let r = -160; r <= 160; r += 4) {
      const biome = w.biome(q, r);
      counts[biome] = (counts[biome] || 0) + 1;
    }
  for (const biome of ['丛林', '沙漠', '雪原', '森林', '白桦林', '青翠平原'])
    assert.ok(counts[biome] > 20);
  assert.equal(w.biome(0, 0), '青翠平原');
  assert.equal(w.treeKind(-160, 38), 'jungle');
  const oak = treeCells('oak', 0, 0, 0),
    jungle = treeCells('jungle', 0, 0, 0);
  assert.ok(jungle.filter((p) => p[3] === 'jungleWood').length >= 9);
  assert.ok(jungle.length > oak.length * 2);
  assert.ok(jungle.every((p) => ['jungleWood', 'jungleLeaves'].includes(p[3])));
});

test('jungle trunks, canopy and natural pods agree across all positive/negative chunk orders and preserve edits', () => {
  for (const [cq, cr] of [
    [-21, 4],
    [5, -8],
    [-20, 8],
  ]) {
    const cells = [
      [cq, cr],
      [cq + 1, cr],
      [cq, cr + 1],
      [cq + 1, cr + 1],
    ];
    const a = new World(624, 'overworld', { load: false });
    cells.forEach((p) => a.generateChunk(...p));
    for (const order of [
      cells.slice().reverse(),
      [cells[2], cells[0], cells[3], cells[1]],
    ]) {
      const b = new World(624, 'overworld', { load: false });
      order.forEach((p) => b.generateChunk(...p));
      assert.deepEqual(b.blocks, a.blocks);
      assert.deepEqual(b.naturalStates, a.naturalStates);
    }
    const cocoa = [...a.blocks].filter(([, type]) => type === 'cocoa');
    assert.ok(cocoa.length);
    for (const [k] of cocoa) {
      const [q, y, r] = k.split(',').map(Number);
      if (cocoaSupport(a, q, y, r) !== null)
        assert.equal(cocoaSupport(a, q, y, r), true);
    }
    const p = cocoa[0][0].split(',').map(Number);
    a.set(...p, 'stone');
    const restored = new World(624, 'overworld', {
      ...a.serialize(),
      load: false,
    });
    cells
      .slice()
      .reverse()
      .forEach((p) => restored.generateChunk(...p));
    assert.equal(restored.get(...p), 'stone');
  }
});

test('all existing wood construction and common recipes consume actual jungle stock, with fuel and renewable saplings', () => {
  for (const id of [
    'junglePlanks',
    'jungleDoor',
    'jungleFence',
    'jungleGate',
    'jungleTrapdoor',
    'junglePlanksSlab',
    'junglePlanksStairs',
  ]) {
    const recipe = RECIPES.find((r) => r.id === id),
      pack = new PlayerInventory(),
      grid = newCraftingGrid();
    for (const [item, n] of Object.entries(recipe.cost)) pack.insert(item, n);
    assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
    assert.equal(
      quickCraft(pack, grid, RECIPES.indexOf(recipe), true, 1).count,
      recipe.count,
    );
    assert.equal(pack.count(id), recipe.count);
    assert.equal(grid.some(Boolean), false);
  }
  const recipe = RECIPES.find((r) => r.id === 'workbench'),
    pack = new PlayerInventory(),
    grid = newCraftingGrid();
  pack.insert('junglePlanks', 12);
  assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
  assert.ok(quickCraft(pack, grid, RECIPES.indexOf(recipe), false, 1).count);
  for (const id of ['jungleWood', 'strippedJungleWood']) {
    assert.equal(smeltingRecipe(id).output, 'charcoal');
    assert.equal(FUELS[id], 15);
    const planks = RECIPES.findIndex((r) => r.id === 'junglePlanks'),
      stock = new PlayerInventory(),
      cells = newCraftingGrid();
    stock.insert(id, 1);
    assert.equal(fillCraftingRecipe(stock, cells, RECIPES[planks]).ok, true);
    assert.equal(quickCraft(stock, cells, planks, false, 1).count, 4);
    assert.equal(stock.count(id), 0);
  }
  assert.deepEqual(miningLoot('jungleLeaves', { random: () => 0 }).stacks, [
    { item: 'jungleSapling', count: 1 },
  ]);
  assert.deepEqual(miningLoot('jungleLeaves', { tool: 'shears' }).stacks, [
    { item: 'jungleLeaves', count: 1 },
  ]);
  assert.deepEqual(
    miningLoot('jungleLeaves', { random: () => 0.03 }).stacks,
    [],
  );
  assert.equal(BLOCKS.jungleWood.stripped, 'strippedJungleWood');
  const w = farm();
  w.set(0, 39, 0, 'dirt');
  const plan = treePlan(w, 0, 39, 0, () => false, 'jungle');
  assert.ok(plan.some((p) => p[3] === 'jungleLeaves'));
  assert.ok(!plan.some((p) => p[3] === 'cocoa'));
  w.set(...plan[0].slice(0, 3), 'stone');
  assert.equal(
    treePlan(w, 0, 39, 0, () => false, 'jungle'),
    null,
  );
});

test('six faces and stripped jungle support stages, exact harvests, bone meal and real observer changes', () => {
  for (let facing = 0; facing < 6; facing++) {
    const w = farm();
    pod(w, 0, 40, 0, facing);
    const [dq, dr] = DIRECTIONS[(facing + 3) % 6],
      observer = [dq, 40, dr];
    w.set(...observer, 'observer');
    w.setState(...observer, { facing, open: false, powered: false });
    tick(w);
    w.redstone.timers.clear();
    w.setState(0, 40, 0, { facing, open: false });
    assert.equal(
      w.redstone.timers.size,
      0,
      'omitted and explicit age zero are equal',
    );
    w.setState(0, 40, 0, { facing, open: false, age: 0 });
    assert.equal(w.redstone.timers.size, 0);
    const sizes = [];
    for (let age = 0; age < 3; age++) {
      sizes.push(buildingParts(w, 0, 40, 0)[0].w);
      const body = buildingParts(w, 0, 40, 0, true)[0];
      assert.equal(w.pointSolid(body.x, 40 + body.y, body.z), true);
      assert.equal(
        w.pointSolid(0, 40.5, 0),
        false,
        'the empty part of the hex cell stays clear',
      );
      assert.equal(w.groundAt(body.x, body.z, 40, 41), 40.75);
      if (age < 2) {
        assert.equal(growCocoa(w, 0, 40, 0), true);
        assert.equal(w.redstone.timers.has(key(...observer)), true);
        tick(w, 0.1);
        assert.equal(w.state(...observer).powered, true);
        tick(w, 0.1);
      }
    }
    assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2]);
    assert.equal(growCocoa(w, 0, 40, 0), false);
    assert.equal(w.redstone.timers.size, 0);
    assert.equal(harvestCocoa(w, 0, 40, 0).drops[0].count, 3);
    assert.equal(harvestCocoa(w, 0, 40, 0).drops.length, 0);
    pod(w, 0, 40, 0, facing, 1);
    assert.equal(harvestCocoa(w, 0, 40, 0).drops[0].count, 1);
    pod(w, 0, 40, 0, facing);
    const [sq, sr] = DIRECTIONS[facing];
    w.set(sq, 40, sr, 'strippedJungleWood');
    assert.equal(cocoaSupport(w, 0, 40, 0), true);
    for (const type of ['wood', 'birchWood', 'spruceWood', 'stone']) {
      w.set(sq, 40, sr, type);
      assert.equal(cocoaSupport(w, 0, 40, 0), false);
    }
    assert.equal(tickCocoa(w, 1).drops[0].count, 1);
  }
});

test('cocoa collision follows each official stage footprint instead of filling or emptying its hex cell', () => {
  const w = farm(),
    point = axialToWorld(0, 0);
  for (let facing = 0; facing < 6; facing++)
    for (let stage = 0; stage <= 2; stage++) {
      pod(w, 0, 40, 0, facing, stage);
      const body = buildingParts(w, 0, 40, 0, true)[0];
      assert.equal(
        bodyClear(
          w,
          point.x + body.x,
          point.z + body.z,
          40 + body.y - 0.05,
          40 + body.y + 0.05,
          0.02,
        ),
        false,
      );
      assert.equal(bodyClear(w, point.x, point.z, 40, 40.8, 0.02), true);
      assert.equal(w.columnSolid(body.x, body.z, 40.76, 40.9), false);
      const [dq, dr] = DIRECTIONS[facing];
      w.set(dq, 40, dr, null);
    }
});

test('natural random growth needs neither daylight nor water and only loaded time advances', () => {
  const oldRandom = Math.random;
  try {
    Math.random = () => 0;
    for (const dimension of ['overworld', 'nether', 'end']) {
      const w = farm(dimension);
      pod(w);
      w.set(0, 41, 0, 'stone');
      assert.equal(tickCocoa(w, 1).changed.length, 1);
      assert.equal(w.state(0, 40, 0).age, 1);
      w.ensureAround(200, 200, 1);
      assert.deepEqual(tickCocoa(w, 1000), { changed: [], drops: [] });
      assert.equal(w.blockStates.get('0,40,0').age, 1);
      w.ensureAround(0, 0, 1);
      assert.equal(w.state(0, 40, 0).age, 1);
      assert.equal(tickCocoa(w, 1).changed.length, 1);
      assert.equal(w.state(0, 40, 0).age, 2);
    }
  } finally {
    Math.random = oldRandom;
  }
});

test('water/lava cleanup, missing support and piston destruction drop actual cocoa once', () => {
  for (const liquid of ['water', 'lava']) {
    const w = farm();
    pod(w, 0, 40, 0, 0, 2);
    assert.equal(w.fluids.source(0, 40, 0, liquid), true);
    assert.equal(tickCocoa(w, 1).drops[0].count, 3);
    assert.equal(w.get(0, 40, 0), undefined);
    assert.equal(tickCocoa(w, 1).drops.length, 0);
  }
  const w = farm();
  pod(w, 0, 40, 0, 1, 2);
  w.set(-1, 40, 0, 'piston');
  w.setState(-1, 40, 0, { facing: 0, open: false });
  const pushed = actuatePiston(w, -1, 40, 0, true);
  assert.deepEqual(pushed.broken[0].stack, { item: 'cocoaBeans', count: 3 });
  assert.equal(w.get(0, 40, 0), 'pistonHead');
  pod(w, 7, 42, 0, 0, 1);
  w.unloadChunk(1, 0);
  assert.equal(cocoaSupport(w, 7, 42, 0), null);
  assert.equal(tickCocoa(w, 1).changed.length, 0);
});

test('v16 validates cocoa stage strictly, saves natural growth, and restores facing and age', () => {
  const w = farm();
  pod(w, 0, 40, 0, 5, 1);
  const saved = currentSave(w);
  assert.doesNotThrow(() => validateSave(saved));
  const restored = new World(624, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  restored.ensureAround(0, 0, 1);
  assert.equal(restored.state(0, 40, 0).age, 1);
  assert.equal(restored.state(0, 40, 0).facing, 5);
  for (const age of [-1, 3, 0.5, '1', NaN]) {
    const bad = structuredClone(saved);
    bad.dimensions.overworld.blockStates[0][1].age = age;
    assert.throws(() => validateSave(bad));
  }
  const bad = structuredClone(saved);
  bad.dimensions.overworld.edits.find(([k]) => k === '0,40,0')[1] = 'stone';
  assert.throws(() => validateSave(bad));
  w.ensureAround(-160, 38, 1);
  const p = [...w.blocks]
    .find(
      ([k, type]) =>
        type === 'cocoa' && w.state(...k.split(',').map(Number)).age < 2,
    )[0]
    .split(',')
    .map(Number);
  assert.equal(growCocoa(w, ...p), true);
  assert.equal(w.edits.get(key(...p)), 'cocoa');
  assert.doesNotThrow(() => validateSave(currentSave(w)));
  const grown = w.state(...p).age,
    facing = w.state(...p).facing;
  w.ensureAround(400, 400, 1);
  const distant = currentSave(w);
  assert.doesNotThrow(() => validateSave(distant));
  const continued = new World(624, 'overworld', {
    ...distant.dimensions.overworld,
    load: false,
  });
  continued.ensureAround(p[0], p[2], 1);
  assert.equal(continued.get(...p), 'cocoa');
  assert.equal(continued.state(...p).age, grown);
  assert.equal(continued.state(...p).facing, facing);
  assert.equal(
    harvestCocoa(continued, ...p).drops[0].count,
    grown === 2 ? 3 : 1,
  );
  assert.doesNotThrow(() => validateSave(currentSave(continued)));
});
