import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { RECIPES, axialToWorld } from '../src/core.js';
import { blockSlots } from '../src/block-inventory.js';
import {
  dispensingSource,
  dropperOffset,
  replaceDispensed,
  ejectStack,
} from '../src/droppers.js';
import { ItemDrops, validDrops } from '../src/item-drops.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';
import { wearStack } from '../src/equipment.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';

function rig() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 2);
  for (let q = -4; q <= 4; q++)
    for (let r = -4; r <= 4; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
    }
  w.set(-1, 42, -1, 'dispenser');
  w.setState(-1, 42, -1, { facing: 0, open: false, powered: false });
  const slots = blockSlots(w, -1, 42, -1);
  return { w, slots, drops: new ItemDrops(new THREE.Scene(), null) };
}

test('dispenser crafting consumes a real bow and seven cobblestone substitutes at a workbench', () => {
  const i = RECIPES.findIndex((r) => r.id === 'dispenser');
  for (const cobble of ['cobble', 'cobbledDeepslate']) {
    const pack = new PlayerInventory(),
      grid = newCraftingGrid();
    pack.insert(cobble, 7);
    pack.insert('redstone', 1);
    fillCraftingRecipe(pack, grid, RECIPES[i]);
    assert.equal(quickCraft(pack, grid, i, true, 1).count, 0);
    pack.insert('bow', 1);
    fillCraftingRecipe(pack, grid, RECIPES[i]);
    assert.equal(quickCraft(pack, grid, i, false, 1).count, 0);
    assert.equal(quickCraft(pack, grid, i, true, 1).count, 1);
    for (const id of [cobble, 'redstone', 'bow'])
      assert.equal(pack.count(id), 0);
    assert.equal(pack.count('dispenser'), 1);
  }
});

test('actual nine-slot selection is uniform by occupied slot and honors all eight loaded outlets', (t) => {
  const { w, slots } = rig();
  slots[0].set({ item: 'stone', count: 64 });
  slots[8].set({ item: 'slownessArrow', count: 1 });
  t.mock.method(Math, 'random', () => 0.999);
  for (let facing = 0; facing < 8; facing++) {
    w.setState(-1, 42, -1, { ...w.state(-1, 42, -1), facing });
    const source = dispensingSource(w, -1, 42, -1),
      [q, y, r] = dropperOffset(facing);
    assert.equal(source.slot.get().item, 'slownessArrow');
    assert.deepEqual(source.target, [-1 + q, 42 + y, -1 + r]);
    assert.ok(Math.abs(Math.hypot(...source.direction) - 1) < 1e-12);
    assert.equal(w.pointSolid(...source.position), false);
  }
  w.set(23, 42, 0, 'dispenser');
  blockSlots(w, 23, 42, 0)[0].set({ item: 'arrow', count: 1 });
  assert.equal(w.loaded(24, 0), false);
  assert.equal(dispensingSource(w, 23, 42, 0), null);
  assert.equal(blockSlots(w, 23, 42, 0)[0].get().count, 1);
});

test('bucket and bottle replacements merge or spill without losing stacks or metadata', () => {
  const { w, slots, drops } = rig();
  slots[0].set({ item: 'bucket', count: 2 });
  for (let i = 1; i < 9; i++) slots[i].set({ item: 'stone', count: 64 });
  // Only one occupied choice is needed for the actual replacement transaction.
  const source = { ...dispensingSource(w, -1, 42, -1), slot: slots[0] };
  replaceDispensed(w, source, 'waterBucket', drops);
  assert.deepEqual(slots[0].get(), { item: 'bucket', count: 1 });
  assert.equal(drops.records[0].item, 'waterBucket');
  replaceDispensed(w, source, 'lavaBucket', drops);
  assert.deepEqual(slots[0].get(), { item: 'lavaBucket', count: 1 });
  slots[0].set({ item: 'glassBottle', count: 3 });
  slots[1].set({ item: 'waterBottle', count: 1 });
  slots[2].set(null);
  replaceDispensed(w, source, 'waterBottle', drops);
  assert.equal(slots[0].get().count, 2);
  assert.equal(slots[1].get().count, 1);
  assert.deepEqual(slots[2].get(), { item: 'waterBottle', count: 1 });
  const box = { item: 'shulkerBox', count: 1, contents: Array(27).fill(null) };
  box.contents[4] = { item: 'diamond', count: 5 };
  const p = axialToWorld(0, -1);
  w.set(0, 42, -1, 'chest');
  ejectStack(w, drops, box, source.position, source.direction);
  const record = drops.records.at(-1);
  assert.deepEqual(record.contents, box.contents);
  assert.notEqual(record.contents, box.contents);
  assert.equal(
    w.pointSolid(
      record.position[0],
      record.position[1] - 0.15,
      record.position[2],
    ),
    false,
  );
  assert.equal(validDrops(drops.serialize()), true);
  // Exercise actual loose-item physics beside the obstructing chest.
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(p.x - 2, 44, p.z);
  for (let i = 0; i < 20; i++) drops.update(0.02, w, camera, () => 0);
  assert.equal(w.pointSolid(...record.position), false);
});

test('machine tools use actual stack durability, preserving names and enchantments including unbreaking', (t) => {
  const tool = {
    item: 'shears',
    count: 1,
    wear: { value: 2, enchant: { unbreaking: 1 }, name: '牧场剪刀' },
  };
  t.mock.method(Math, 'random', () => 0.99);
  assert.equal(wearStack(tool), false);
  assert.equal(tool.wear.value, 2);
  t.mock.method(Math, 'random', () => 0);
  assert.equal(wearStack(tool), false);
  assert.deepEqual(tool.wear, {
    value: 1,
    enchant: { unbreaking: 1 },
    name: '牧场剪刀',
  });
  assert.equal(wearStack(tool), true);
});

test('solid machines reject liquid intrusion and native v16 restores vertical facing and one pending pulse', () => {
  const { w, slots } = rig();
  slots[0].set({ item: 'arrow', count: 3 });
  for (const type of ['dropper', 'dispenser']) {
    w.set(0, 40, 0, type);
    assert.equal(w.fluids.source(0, 40, 0, 'water'), false);
    assert.equal(w.get(0, 40, 0), type);
    assert.equal(w.fluids.get(0, 40, 0) || null, null);
  }
  w.setState(-1, 42, -1, { facing: 7, open: false, powered: true });
  w.redstone.timers.set('-1,42,-1', 0.13);
  const saved = currentSave(w);
  assert.doesNotThrow(() => validateSave(saved));
  const copy = new World(624, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  copy.ensureAround(0, 0, 2);
  assert.equal(copy.state(-1, 42, -1).facing, 7);
  assert.equal(copy.redstone.timers.get('-1,42,-1'), 0.13);
  assert.equal(blockSlots(copy, -1, 42, -1)[0].get().count, 3);
  for (const mutate of [
    (d) => (d.redstoneTimers[0][1] = 0.201),
    (d) => d.redstoneTimers.push(['1,42,0', 0.1]),
    (d) => (d.blockStates.find(([k]) => k === '-1,42,-1')[1].facing = 8),
    (d) => d.chests.find(([k]) => k === '-1,42,-1')[1].push(null),
  ]) {
    const invalid = structuredClone(saved);
    mutate(invalid.dimensions.overworld);
    assert.throws(() => validateSave(invalid));
  }
});
