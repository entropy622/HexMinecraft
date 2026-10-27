import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { BLOCKS, RECIPES, DIRECTIONS, key, axialToWorld } from '../src/core.js';
import { blockSlots } from '../src/block-inventory.js';
import { fireDropper, dropperOffset } from '../src/droppers.js';
import { ItemDrops, validDrops } from '../src/item-drops.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import { storageLidClear } from '../src/chests.js';
import { newFurnace } from '../src/furnaces.js';
import { newBrewing } from '../src/brewing.js';

// Failure classes were recorded in droppers-verification.md before product code.
// These use the real world, redstone scheduler, slots and item entity store.
function rig(world) {
  const w = world || new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 2);
  if (!world)
    for (let q = -6; q <= 6; q++)
      for (let r = -5; r <= 5; r++) {
        w.set(q, 39, r, 'stone');
        for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
      }
  const drops = new ItemDrops(new THREE.Scene(), null);
  const step = (dt) =>
    w.redstone.tick(dt, [], undefined, (q, y, r) =>
      fireDropper(w, q, y, r, drops),
    );
  return { w, drops, step };
}
function put(w, q, y, r, type, facing = 0) {
  w.set(q, y, r, type);
  w.setState(q, y, r, {
    facing,
    open: false,
    powered: false,
    ...(type === 'lever' ? { mount: 'floor' } : {}),
  });
  if (BLOCKS[type]?.storage)
    w.chests.set(key(q, y, r), Array(BLOCKS[type].storage).fill(null));
  return w.chests.get(key(q, y, r));
}
function power(w, on, q = -1, y = 40, r = 0) {
  w.setState(q, y, r, { ...w.state(q, y, r), powered: on });
}
const count = (slots) => slots.reduce((n, s) => n + (s?.count || 0), 0);

test('one delayed rising edge survives a short pulse, ignores held power and cannot multiply an in-flight trigger', () => {
  const { w, drops, step } = rig(),
    source = put(w, 0, 40, 0, 'dropper'),
    dest = put(w, 1, 40, 0, 'chest');
  source[0] = { item: 'stone', count: 5 };
  put(w, -1, 40, 0, 'lever');
  power(w, true);
  step(0);
  assert.equal(count(dest), 0);
  step(0.1);
  power(w, false);
  step(0.01);
  power(w, true);
  step(0.01);
  assert.equal(count(dest), 0);
  step(0.08);
  assert.equal(count(dest), 1);
  step(5);
  assert.equal(count(dest), 1);
  assert.equal(count(source), 4);
  power(w, false);
  step(0);
  power(w, true);
  step(0);
  step(0.2);
  assert.equal(count(dest), 2);
  assert.equal(drops.records.length, 0);
});

test('all eight exits cross negative cells and transfer one, retain full targets, and share their actual nine slots', () => {
  const { w, drops } = rig();
  for (let facing = 0; facing < 8; facing++) {
    const source = put(w, -1, 42, -1, 'dropper', facing),
      [dq, dy, dr] = dropperOffset(facing),
      dest = put(w, -1 + dq, 42 + dy, -1 + dr, 'chest');
    source[8] = { item: 'slownessArrow', count: 3 };
    assert.equal(fireDropper(w, -1, 42, -1, drops), true);
    assert.equal(count(source), 2);
    assert.equal(count(dest), 1);
    dest.fill({ item: 'stone', count: 64 });
    assert.equal(fireDropper(w, -1, 42, -1, drops), false);
    assert.equal(count(source), 2);
    assert.equal(drops.records.length, 0);
    w.set(-1 + dq, 42 + dy, -1 + dr, null);
    w.chests.delete(key(-1 + dq, 42 + dy, -1 + dr));
  }
  const source = put(w, 0, 40, 0, 'dropper');
  source[0] = { item: 'stone', count: 2 };
  assert.equal(blockSlots(w, 0, 40, 0)[0].get(), source[0]);
  assert.equal(
    storageLidClear(w, 0, 40, 0, new THREE.PerspectiveCamera(), 40),
    true,
  );
  w.set(0, 41, 0, 'stone');
  assert.equal(
    storageLidClear(w, 0, 40, 0, new THREE.PerspectiveCamera(), 40),
    true,
  );
  const p = axialToWorld(0, 0);
  assert.equal(w.pointSolid(p.x, 40.5, p.z), true);
  assert.equal(w.groundAt(p.x, p.z, 39.8, 41.2), 41);
});

test('random choice is by occupied slot and real item entities retain equipment and portable contents', (t) => {
  const { w, drops } = rig(),
    source = put(w, 0, 42, 0, 'dropper', 7);
  source[0] = { item: 'stone', count: 64 };
  source[8] = { item: 'slownessArrow', count: 1 };
  t.mock.method(Math, 'random', () => 0.99999);
  assert.equal(fireDropper(w, 0, 42, 0, drops), true);
  assert.equal(source[0].count, 64);
  assert.equal(source[8], null);
  assert.equal(drops.records[0].item, 'slownessArrow');
  assert.equal(drops.records[0].count, 1);
  assert.ok(drops.records[0].velocity[1] > 0);
  const pack = new PlayerInventory();
  pack.insert('bow', 1);
  const bow = pack.serialize().slots.find(Boolean);
  bow.wear = { value: bow.wear, enchant: { infinity: 1 }, name: '机关弓' };
  source.fill(null);
  source[0] = bow;
  assert.equal(fireDropper(w, 0, 42, 0, drops), true);
  assert.deepEqual(drops.records.at(-1).wear.bow, [bow.wear]);
  pack.insertStack({
    item: 'shulkerBox',
    count: 1,
    contents: Array(27).fill(null),
  });
  const box = pack.serialize().slots.find((s) => s?.item === 'shulkerBox');
  box.contents[2] = { item: 'diamond', count: 3 };
  source[0] = box;
  assert.equal(fireDropper(w, 0, 42, 0, drops), true);
  assert.deepEqual(drops.records.at(-1).contents, box.contents);
  assert.notEqual(drops.records.at(-1).contents, box.contents);
  assert.equal(validDrops(drops.serialize()), true);
  assert.equal(fireDropper(w, 0, 42, 0, drops), false);
});

test('sided furnace and brewing insertion obey shared endpoints, and comparators measure the nine-slot container', () => {
  const { w, drops, step } = rig(),
    source = put(w, 0, 42, 0, 'dropper', 6);
  put(w, 0, 41, 0, 'furnace');
  const furnace = newFurnace();
  w.furnaces.set('0,41,0', furnace);
  source[0] = { item: 'rawIron', count: 2 };
  assert.equal(fireDropper(w, 0, 42, 0, drops), true);
  assert.equal(furnace.input.count, 1);
  w.setState(0, 42, 0, { facing: 0, open: false });
  put(w, 1, 42, 0, 'furnace');
  const side = newFurnace();
  w.furnaces.set('1,42,0', side);
  assert.equal(fireDropper(w, 0, 42, 0, drops), false);
  source[0] = { item: 'coal', count: 2 };
  assert.equal(fireDropper(w, 0, 42, 0, drops), true);
  assert.equal(side.fuel.count, 1);
  assert.equal(side.input, null);
  put(w, 0, 41, 0, 'brewingStand');
  const brew = newBrewing();
  w.brewing.set('0,41,0', brew);
  w.setState(0, 42, 0, { facing: 6, open: false });
  source[0] = { item: 'netherWart', count: 2 };
  assert.equal(fireDropper(w, 0, 42, 0, drops), true);
  assert.equal(brew.ingredient.count, 1);
  const slots = put(w, 3, 40, 0, 'dropper');
  put(w, 4, 40, 0, 'comparator');
  w.setState(4, 40, 0, { facing: 0, open: false, output: 0, subtract: false });
  slots.fill({ item: 'stone', count: 64 });
  step(0);
  step(0.1);
  assert.equal(w.state(4, 40, 0).output, 15);
  slots[0] = { item: 'stone', count: 63 };
  step(0);
  step(0.1);
  assert.equal(w.state(4, 40, 0).output, 14);
});

test('pending pulses freeze unloaded, persist through the native save schema, and reject malformed directions and timers', () => {
  const { w, step } = rig(),
    source = put(w, 0, 40, 0, 'dropper', 7),
    dest = put(w, 0, 41, 0, 'chest');
  source[0] = { item: 'stone', count: 2 };
  put(w, -1, 40, 0, 'lever');
  power(w, true);
  step(0);
  step(0.08);
  power(w, false);
  step(0);
  const saved = currentSave(w);
  assert.doesNotThrow(() => validateSave(saved));
  w.ensureAround(90, 0, 1);
  const left = w.redstone.timers.get('0,40,0');
  step(5);
  assert.equal(w.redstone.timers.get('0,40,0'), left);
  const copy = new World(w.seed, w.dimension, {
      ...saved.dimensions.overworld,
      load: false,
    }),
    r = rig(copy);
  r.step(0.119);
  assert.equal(count(copy.chests.get('0,41,0')), 0);
  r.step(0.001);
  assert.equal(count(copy.chests.get('0,41,0')), 1);
  for (const bad of [0, -1, 0.201, NaN, Infinity, '0.1']) {
    const s = structuredClone(saved);
    s.dimensions.overworld.redstoneTimers = [['0,40,0', bad]];
    assert.throws(() => validateSave(s));
  }
  for (const corrupt of [
    (d) => d.redstoneTimers.push(...d.redstoneTimers),
    (d) => (d.redstoneTimers = [['2,40,0', 0.1]]),
    (d) => (d.blockStates.find(([k]) => k === '0,40,0')[1].facing = 8),
    (d) => (d.blockStates.find(([k]) => k === '-1,40,0')[1].facing = 7),
    (d) => d.chests.find(([k]) => k === '0,40,0')[1].push(null),
  ]) {
    const s = structuredClone(saved);
    corrupt(s.dimensions.overworld);
    assert.throws(() => validateSave(s));
  }
  copy.set(0, 40, 0, null);
  assert.equal(copy.redstone.timers.has('0,40,0'), false);
});

test('real seven-cell crafting consumes seven cobblestone and redstone, including deepslate substitutes', () => {
  const i = RECIPES.findIndex((r) => r.id === 'dropper');
  for (const cobble of ['cobble', 'cobbledDeepslate']) {
    const p = new PlayerInventory(),
      grid = newCraftingGrid();
    p.insert(cobble, 7);
    p.insert('redstone', 1);
    fillCraftingRecipe(p, grid, RECIPES[i]);
    assert.equal(quickCraft(p, grid, i, false, 1).count, 0);
    assert.equal(quickCraft(p, grid, i, true, 1).count, 1);
    assert.equal(p.count('dropper'), 1);
    assert.equal(p.count(cobble), 0);
    assert.equal(p.count('redstone'), 0);
  }
});

test('a valid but undiscovered container and an unloaded outlet retain stock instead of spraying it', () => {
  const { w, drops } = rig(),
    source = put(w, 0, 40, 0, 'dropper');
  source[0] = { item: 'stone', count: 2 };
  w.set(1, 40, 0, 'chest');
  assert.equal(w.chests.has('1,40,0'), false);
  assert.doesNotThrow(() => validateSave(currentSave(w)));
  assert.equal(fireDropper(w, 0, 40, 0, drops), false);
  assert.equal(source[0].count, 2);
  assert.equal(drops.records.length, 0);
  const edge = put(w, 23, 40, 0, 'dropper');
  edge[0] = { item: 'stone', count: 2 };
  assert.equal(w.loaded(24, 0), false);
  assert.equal(fireDropper(w, 23, 40, 0, drops), false);
  assert.equal(edge[0].count, 2);
  assert.equal(drops.records.length, 0);
});
