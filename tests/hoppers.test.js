import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { BLOCKS, DIRECTIONS, RECIPES, axialToWorld, key } from '../src/core.js';
import { storageLidClear } from '../src/chests.js';
import { blockSlots } from '../src/block-inventory.js';
import { newFurnace, tickFurnace } from '../src/furnaces.js';
import { tickBrewing } from '../src/brewing.js';
import { ItemDrops } from '../src/item-drops.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';

// Failure classes were listed before implementation in hoppers-verification.md;
// hoppers.spec.js is the production-first placement/UI/Continue scenario.
function fixture() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 2);
  for (let q = -6; q <= 6; q++)
    for (let r = -5; r <= 5; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 46; y++) w.set(q, y, r, null);
    }
  return w;
}
function put(w, q, y, r, type, state = {}) {
  w.set(q, y, r, type);
  w.setState(q, y, r, { facing: 0, open: false, ...state });
  if (BLOCKS[type]?.storage)
    w.chests.set(key(q, y, r), Array(BLOCKS[type].storage).fill(null));
  return w.chests.get(key(q, y, r));
}
function advance(w, seconds, drops) {
  for (let left = seconds; left > 1e-8; left -= 0.01) {
    const dt = Math.min(0.01, left);
    w.redstone.tick(dt, [], () => true);
    w.hoppers.tick(dt, drops);
  }
}
const count = (slots) => slots.reduce((n, s) => n + (s?.count || 0), 0);

test('all six outlets and downward output move one at 0.4 seconds, preserving blocked contents', () => {
  const w = fixture();
  for (let facing = 0; facing < 6; facing++) {
    w.clearLoaded();
    w.ensureAround(0, 0, 2);
    const source = put(w, 0, 41, 0, 'hopper', { facing, down: false });
    const [dq, dr] = DIRECTIONS[facing],
      dest = put(w, dq, 41, dr, 'chest');
    source[0] = { item: 'stone', count: 3 };
    w.hoppers.tick(0);
    assert.equal(count(dest), 1);
    advance(w, 0.39);
    assert.equal(count(dest), 1);
    advance(w, 0.01);
    assert.equal(count(dest), 2);
    dest.fill({ item: 'stone', count: 64 });
    advance(w, 0.4);
    assert.equal(count(source), 1);
    dest[0] = { item: 'stone', count: 63 };
    advance(w, 0.01);
    assert.equal(count(source), 0);
    assert.equal(dest[0].count, 64);
    w.set(dq, 41, dr, null);
    w.set(0, 41, 0, null);
  }
  const source = put(w, 0, 41, 0, 'hopper', { down: true }),
    dest = put(w, 0, 40, 0, 'chest');
  source[0] = { item: 'egg', count: 2 };
  dest[0] = { item: 'egg', count: 15 };
  w.hoppers.tick(0);
  assert.deepEqual(dest[0], { item: 'egg', count: 16 });
  advance(w, 0.4);
  assert.deepEqual(dest[1], { item: 'egg', count: 1 });
  assert.equal(storageLidClear(w, 0, 40, 0), true);
  assert.equal(w.redstone.containerLevel(0, 40, 0), 1);
});

test('empty vertical chains cannot teleport stock in a single step and loops conserve it', () => {
  const w = fixture(),
    top = put(w, 0, 43, 0, 'hopper'),
    mid = put(w, 0, 42, 0, 'hopper'),
    bottom = put(w, 0, 41, 0, 'hopper'),
    dest = put(w, 0, 40, 0, 'chest');
  top[0] = { item: 'stone', count: 1 };
  w.hoppers.tick(0);
  assert.equal(count(mid), 1);
  assert.equal(count(bottom) + count(dest), 0);
  advance(w, 0.4);
  assert.equal(count(dest), 0);
  assert.equal(count(bottom), 1);
  advance(w, 0.4);
  assert.equal(count(dest), 1);
  const a = put(w, 2, 41, 0, 'hopper', { down: false, facing: 0 }),
    b = put(w, 3, 41, 0, 'hopper', { down: false, facing: 3 });
  a[0] = { item: 'coal', count: 64 };
  advance(w, 8);
  assert.equal(count(a) + count(b), 64);
});

test('actual redstone locks own activity while external insertion still works, and five slots drive comparator strength', () => {
  const w = fixture(),
    h = put(w, 0, 41, 0, 'hopper'),
    upper = put(w, 0, 42, 0, 'chest'),
    dest = put(w, 0, 40, 0, 'chest');
  put(w, 1, 40, 0, 'stone');
  put(w, 1, 41, 0, 'lever', { mount: 'floor', powered: true });
  upper[0] = { item: 'stone', count: 64 };
  h[0] = { item: 'stone', count: 64 };
  advance(w, 1);
  assert.equal(w.state(0, 41, 0).powered, true);
  assert.equal(count(dest), 0);
  assert.equal(count(upper), 64);
  const feeder = put(w, -1, 41, 0, 'hopper', { down: false, facing: 0 });
  feeder[0] = { item: 'egg', count: 1 };
  advance(w, 0.1);
  assert.equal(h[1].item, 'egg');
  w.set(0, 42, 0, 'stone'); // A hopper has no chest lid to obstruct a comparator.
  assert.equal(w.redstone.containerLevel(0, 41, 0), 3);
  h.fill({ item: 'stone', count: 64 });
  assert.equal(w.redstone.containerLevel(0, 41, 0), 15);
  h.fill(null);
  assert.equal(w.redstone.containerLevel(0, 41, 0), 0);
  w.redstone.activate(1, 41, 0);
  advance(w, 0.4);
  assert.equal(w.state(0, 41, 0).powered, false);
});

test('furnace sided ports reject wrong fuel and input, extract only output or buckets and preserve earned experience', () => {
  for (const kind of ['furnace', 'blastFurnace', 'smoker']) {
    const w = fixture(),
      input = kind === 'smoker' ? 'meat' : 'rawIron';
    put(w, 0, 41, 0, kind);
    const top = put(w, 0, 42, 0, 'hopper'),
      side = put(w, -1, 41, 0, 'hopper', { down: false, facing: 0 }),
      bottom = put(w, 0, 40, 0, 'hopper');
    top[0] = { item: input, count: 1 };
    side[0] = { item: input, count: 1 };
    advance(w, 0.01);
    const f = w.furnaces.get('0,41,0');
    assert.equal(f.input.item, input);
    assert.equal(f.fuel, null);
    assert.equal(count(side), 1);
    side[0] = { item: 'lavaBucket', count: 1 };
    advance(w, 0.4);
    assert.equal(f.fuel.item, 'lavaBucket');
    for (let i = 0; i < 101; i++) tickFurnace(f, 0.1);
    const xp = f.xp;
    assert.ok(xp > 0);
    assert.equal(f.output.count, 1);
    advance(w, 0.8);
    assert.equal(f.output, null);
    assert.equal(f.fuel, null);
    assert.equal(f.xp, xp);
    assert.ok(bottom.some((s) => s?.item === 'bucket'));
    assert.ok(
      bottom.some((s) => s?.item === (kind === 'smoker' ? 'cooked' : 'ingot')),
    );
    assert.equal(count(side), 0);
    f.input = { item: input, count: 1 };
    f.fuel = { item: 'coal', count: 1 };
    advance(w, 0.8);
    assert.equal(f.input.count, 1);
    assert.equal(f.fuel.count, 1);
  }
});

test('brewing sided transport fills bottles, fuel and ingredients, resets batches and only extracts bottles', () => {
  const w = fixture();
  put(w, 0, 41, 0, 'brewingStand');
  const top = put(w, 0, 42, 0, 'hopper'),
    side = put(w, -1, 41, 0, 'hopper', { down: false, facing: 0 });
  top[0] = { item: 'netherWart', count: 2 };
  side[0] = { item: 'waterBottle', count: 1 };
  side[1] = { item: 'ember', count: 1 };
  advance(w, 0.5);
  const b = w.brewing.get('0,41,0');
  assert.equal(b.ingredient.count, 2);
  assert.equal(b.bottles[0], 'waterBottle');
  assert.equal(b.fuelStock, 1);
  tickBrewing(b, 1);
  assert.equal(b.progress, 1);
  const bottom = put(w, 0, 40, 0, 'hopper');
  advance(w, 0.01);
  assert.equal(bottom[0].item, 'waterBottle');
  assert.equal(b.progress, 0);
  assert.equal(b.batch, null);
  assert.equal(b.ingredient.count, 2);
  assert.ok(b.charges > 0);
  side[0] = { item: 'netherWart', count: 1 };
  advance(w, 0.8);
  assert.equal(side[0].count, 1);
});

test('metadata, portable contents and stack capacities survive real transfer; portable nesting is rejected', () => {
  const w = fixture(),
    h = put(w, 0, 41, 0, 'hopper'),
    dest = put(w, 0, 40, 0, 'chest');
  const tool = {
    item: 'pick1',
    count: 1,
    wear: { value: 19, enchant: { efficiency: 1 }, name: '矿工' },
  };
  const box = { item: 'shulkerBox', count: 1, contents: Array(27).fill(null) };
  box.contents[0] = { item: 'egg', count: 16 };
  h[0] = structuredClone(tool);
  h[1] = structuredClone(box);
  advance(w, 0.41);
  assert.deepEqual(dest.slice(0, 2), [tool, box]);
  put(w, 0, 40, 0, 'shulkerBox');
  h[0] = structuredClone(box);
  advance(w, 0.8);
  assert.deepEqual(h[0], box);
  const slots = blockSlots(w, 0, 40, 0);
  assert.equal(slots[0].accepts(box), false);
});

test('loose intake respects actual geometry, partial room and ordered equipment metadata', () => {
  const w = fixture(),
    h = put(w, 0, 41, 0, 'hopper'),
    p = axialToWorld(0, 0),
    drops = new ItemDrops(new THREE.Scene(), null);
  h.fill({ item: 'stone', count: 64 });
  h[0] = { item: 'stone', count: 63 };
  drops.spawn('stone', 80, [p.x, 42.25, p.z], {}, [0, 0, 0]);
  w.hoppers.tick(0, drops);
  assert.equal(h[0].count, 64);
  assert.equal(drops.records[0].count, 79);
  h.fill(null);
  w.set(0, 42, 0, 'stone');
  advance(w, 0.4, drops);
  assert.equal(count(h), 0);
  assert.equal(drops.records[0].count, 79);
  w.set(0, 42, 0, null);
  drops.load([]);
  const wear = [12, { value: 20, enchant: { unbreaking: 1 }, name: '保留' }];
  drops.spawn('pick1', 2, [p.x, 41.7, p.z], { pick1: wear }, [0, 0, 0]);
  advance(w, 0.01, drops);
  assert.deepEqual(
    h.slice(0, 2).map((s) => s.wear),
    wear,
  );
  assert.equal(drops.records.length, 0);
  drops.spawn('stone', 1, [axialToWorld(1, 0).x, 42, p.z], {}, [0, 0, 0]);
  advance(w, 0.4, drops);
  assert.equal(drops.records.length, 1);
  w.set(1, 40, 0, 'stone');
  put(w, 1, 41, 0, 'lever', { mount: 'floor', powered: true });
  drops.spawn('stone', 1, [p.x, 41.7, p.z], {}, [0, 0, 0]);
  advance(w, 0.8, drops);
  assert.equal(count(h), 2);
  assert.equal(drops.records.length, 2);
  w.redstone.activate(1, 41, 0);
  advance(w, 0.01, drops);
  assert.equal(count(h), 3);
  assert.equal(drops.records.length, 1);
});

test('loaded cooldown and five-slot contents restore without offline catchup; malformed state is rejected', () => {
  const w = fixture(),
    h = put(w, 0, 41, 0, 'hopper', { down: false, facing: 0 }),
    dest = put(w, 1, 41, 0, 'chest');
  h[0] = { item: 'stone', count: 3 };
  w.hoppers.tick(0);
  advance(w, 0.15);
  const saved = currentSave(w);
  assert.doesNotThrow(() => validateSave(saved));
  const restored = new World(w.seed, 'overworld', {
    ...w.serialize(),
    load: false,
  });
  restored.ensureAround(0, 0, 2);
  advance(restored, 0.24);
  assert.equal(count(restored.chests.get('1,41,0')), 1);
  advance(restored, 0.01);
  assert.equal(count(restored.chests.get('1,41,0')), 2);
  restored.ensureAround(90, 0, 1);
  const frozen = restored.hoppers.cooldowns.get('0,41,0');
  advance(restored, 2);
  assert.equal(restored.hoppers.cooldowns.get('0,41,0'), frozen);
  restored.ensureAround(0, 0, 2);
  advance(restored, 0.4);
  assert.equal(count(restored.chests.get('1,41,0')), 3);
  restored.set(0, 41, 0, null);
  assert.equal(restored.hoppers.cooldowns.has('0,41,0'), false);
  for (const bad of [-0.1, 0, 0.401, NaN, '0.2', Infinity]) {
    const copy = structuredClone(saved);
    copy.dimensions.overworld.hopperCooldowns = [['0,41,0', bad]];
    assert.throws(() => validateSave(copy));
  }
  for (const corrupt of [
    (d) => d.hopperCooldowns.push(...d.hopperCooldowns),
    (d) => (d.hopperCooldowns = [['1,41,0', 0.1]]),
    (d) => d.chests.find(([k]) => k === '0,41,0')[1].push(null),
    (d) => (d.blockStates.find(([k]) => k === '0,41,0')[1].down = 1),
    (d) => (d.blockStates.find(([k]) => k === '1,41,0')[1].down = true),
  ]) {
    const copy = structuredClone(saved);
    corrupt(copy.dimensions.overworld);
    assert.throws(() => validateSave(copy));
  }
  const noTimers = structuredClone(saved);
  delete noTimers.dimensions.overworld.hopperCooldowns;
  assert.doesNotThrow(() => validateSave(noTimers));
  const f = newFurnace();
  f.xp = 1200.5;
  put(w, 3, 40, 0, 'furnace');
  w.furnaces.set('3,40,0', f);
  assert.doesNotThrow(() => validateSave(currentSave(w)));
});

test('survival crafting consumes five ingots and a chest at a workbench', () => {
  const p = new PlayerInventory(),
    grid = newCraftingGrid(),
    i = RECIPES.findIndex((r) => r.id === 'hopper');
  p.insert('ingot', 5);
  p.insert('chest', 1);
  fillCraftingRecipe(p, grid, RECIPES[i]);
  assert.equal(quickCraft(p, grid, i, false, 1).count, 0);
  assert.equal(quickCraft(p, grid, i, true, 1).count, 1);
  assert.equal(p.count('hopper'), 1);
  assert.equal(p.count('ingot'), 0);
  assert.equal(p.count('chest'), 0);
});
