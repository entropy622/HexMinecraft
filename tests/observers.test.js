import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { key, RECIPES } from '../src/core.js';
import { dropperOffset, fireDropper } from '../src/droppers.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';
import { buildingParts } from '../src/building-shapes.js';

// Failure classes are recorded in docs/observers-verification.md. These use
// the real World, redstone scheduler, fluid state, crafting and containers.
function fixture() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  return w;
}
function put(w, p, type, state = {}) {
  w.set(...p, type);
  w.setState(...p, { facing: 0, open: false, ...state });
}
const tick = (w, dt = 0) =>
  w.redstone.tick(
    dt,
    [],
    () => true,
    (...p) => fireDropper(w, ...p, null),
  );
function advance(w, seconds) {
  for (let left = seconds; left > 1e-8; left -= 0.01)
    tick(w, Math.min(0.01, left));
}
function rig(facing = 0) {
  const w = fixture(),
    origin = [-1, 40, -1],
    d = dropperOffset(facing),
    at = (n) => origin.map((v, i) => v + d[i] * n);
  w.set(...at(1), 'stone');
  put(w, origin, 'observer', { facing, powered: false });
  put(w, at(-1), 'redstoneLamp', { powered: false });
  tick(w);
  return { w, origin, at };
}
const pulse = (w, target) => {
  w.set(...target, 'cobble');
  w.set(...target, 'stone');
};

test('the workbench consumes all nine ingredients, rejects shortages atomically and accepts cobbled deepslate', () => {
  const recipe = RECIPES.find((r) => r.id === 'observer');
  for (const cobble of ['cobble', 'cobbledDeepslate']) {
    const pack = new PlayerInventory(),
      grid = newCraftingGrid();
    for (const [id, n] of [
      [cobble, 6],
      ['redstone', 2],
      ['netherQuartz', 1],
    ])
      pack.insert(id, n);
    assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
    assert.equal(
      quickCraft(pack, grid, RECIPES.indexOf(recipe), false, 1).count,
      0,
    );
    assert.equal(
      quickCraft(pack, grid, RECIPES.indexOf(recipe), true, 1).count,
      1,
    );
    assert.equal(pack.count('observer'), 1);
    assert.equal(
      pack.count(cobble) + pack.count('redstone') + pack.count('netherQuartz'),
      0,
    );
    assert.equal(grid.some(Boolean), false);
  }
  for (const missing of ['cobble', 'redstone', 'netherQuartz']) {
    const pack = new PlayerInventory(),
      grid = newCraftingGrid();
    for (const [id, n] of [
      ['cobble', 6],
      ['redstone', 2],
      ['netherQuartz', 1],
    ])
      pack.insert(id, n - Number(id === missing));
    const before = pack.serialize();
    assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, false);
    assert.deepEqual(pack.serialize(), before);
    assert.equal(grid.some(Boolean), false);
  }
});

test('all eight directions detect only the watching face and emit a delayed 0.1 second pulse from the opposite face', () => {
  for (let facing = 0; facing < 8; facing++) {
    const { w, origin, at } = rig(facing);
    assert.equal(w.redstone.timers.size, 0);
    pulse(w, at(-2));
    assert.equal(w.redstone.timers.size, 0, 'rear changes are not observed');
    const opposite = facing >= 6 ? 13 - facing : (facing + 3) % 6;
    for (let side = 0; side < 8; side++) {
      if (side === facing || side === opposite) continue;
      const p = origin.map((v, i) => v + dropperOffset(side)[i]);
      w.set(...p, 'stone');
      w.set(...p, null);
    }
    assert.equal(w.redstone.timers.size, 0, 'side changes are not observed');
    pulse(w, at(1));
    assert.equal(w.state(...origin).powered, false);
    tick(w, 0.09);
    assert.equal(w.state(...origin).powered, false);
    tick(w, 0.01);
    assert.equal(w.state(...origin).powered, true, `facing ${facing}`);
    assert.equal(w.state(...at(-1)).powered, true);
    assert.equal(w.redstone.outputTo(...origin, at(1)), 0);
    assert.equal(w.redstone.outputTo(...origin, at(-1)), 15);
    for (let side = 0; side < 8; side++)
      assert.equal(
        w.redstone.outputTo(
          ...origin,
          origin.map((v, i) => v + dropperOffset(side)[i]),
        ),
        side === opposite ? 15 : 0,
      );
    const parts = buildingParts(w, ...origin);
    assert.equal(
      parts.some((p) => p.tile === 'observerFace'),
      true,
    );
    assert.equal(
      parts.some((p) => p.tile === 'observerOutputOn'),
      true,
    );
    assert.equal(buildingParts(w, ...origin, true).length, 1);
    tick(w, 0.099);
    assert.equal(w.state(...origin).powered, true);
    tick(w, 0.001);
    assert.equal(w.state(...origin).powered, false);
    assert.equal(w.state(...at(-1)).powered, false);
    advance(w, 0.5);
    assert.equal(w.redstone.timers.has(key(...origin)), false);
  }
});

test('same values and speculative rollback stay silent, while committed A→B→A survives one physics step', () => {
  const { w, origin, at } = rig();
  w.set(...at(1), 'stone');
  w.setState(...at(1), { facing: 0, open: false });
  w.setState(...at(1), { ...w.state(...at(1)) });
  assert.equal(w.redstone.timers.has(key(...origin)), false);
  const before = w.serialize();
  w.set(...at(1), 'cobble', false);
  w.set(...at(1), 'stone', false);
  const old = w.state(...at(1));
  w.setState(...at(1), { ...old, open: true }, false);
  w.setState(...at(1), old, false);
  assert.deepEqual(w.serialize(), before);
  assert.equal(w.redstone.timers.has(key(...origin)), false);
  pulse(w, at(1));
  tick(w, 0.1);
  assert.equal(w.state(...origin).powered, true);
  pulse(w, at(1));
  tick(w, 0.09);
  pulse(w, at(1));
  tick(w, 0.01);
  assert.equal(
    w.state(...origin).powered,
    false,
    'busy updates cannot stretch output',
  );
  tick(w, 0.2);
  assert.equal(w.state(...origin).powered, false);
  w.setState(...at(1), { ...old, double: true });
  w.setState(...at(1), old);
  tick(w, 0.1);
  assert.equal(
    w.state(...origin).powered,
    true,
    'committed state A→B→A also survives',
  );
});

test('real liquid updates and wire strength changes notify observers without full-world sampling', () => {
  const { w, origin, at } = rig();
  w.set(...at(1), null);
  advance(w, 0.2);
  assert.equal(w.fluids.source(...at(1), 'water'), true);
  tick(w, 0.1);
  assert.equal(w.state(...origin).powered, true);
  tick(w, 0.1);
  assert.equal(w.fluids.source(...at(1), 'water'), false);
  assert.equal(w.redstone.timers.has(key(...origin)), false);
  assert.equal(w.fluids.scoop(...at(1)), 'water');
  tick(w, 0.1);
  assert.equal(w.state(...origin).powered, true);
  assert.equal(
    w.fluids.open(...origin),
    false,
    'water cannot replace the solid casing',
  );
  tick(w, 0.1);
  put(w, at(1), 'redstoneWire');
  put(w, at(2), 'lever', { powered: false });
  advance(w, 0.2);
  w.redstone.activate(...at(2));
  tick(w);
  assert.equal(w.redstone.power(...at(1)), 15);
  tick(w, 0.1);
  assert.equal(w.state(...origin).powered, true);
  tick(w, 0.1);
  tick(w, 0.3);
  assert.equal(w.state(...origin).powered, false);
});

test('empty-to-empty commits are silent and a reverted trial cannot delete a growing target entity', () => {
  const { w, origin, at } = rig();
  w.set(...at(1), null);
  advance(w, 0.2);
  w.set(...at(1), null);
  assert.equal(w.redstone.timers.has(key(...origin)), false);
  w.set(...at(1), 'chorusFlower');
  w.chorus.set(key(...at(1)), { stage: 2, time: 7 });
  advance(w, 0.2);
  const before = w.serialize();
  w.set(...at(1), 'stone', false);
  w.set(...at(1), 'chorusFlower', false);
  assert.deepEqual(w.serialize(), before);
  assert.equal(w.redstone.timers.has(key(...origin)), false);
});

test('chains cannot consume newly scheduled delays in the same step, including a large dt', () => {
  const { w, origin, at } = rig();
  w.set(...at(-1), null);
  put(w, at(-1), 'observer', { facing: 0, powered: false });
  put(w, at(-2), 'redstoneLamp', { powered: false });
  pulse(w, at(1));
  tick(w, 1);
  assert.equal(w.state(...origin).powered, true);
  assert.equal(w.state(...at(-1)).powered, false);
  assert.equal(w.state(...at(-2)).powered, false);
  tick(w, 0.099);
  assert.equal(w.state(...at(-1)).powered, false);
  tick(w, 0.001);
  assert.equal(w.state(...origin).powered, false);
  assert.equal(w.state(...at(-1)).powered, true);
  assert.equal(w.state(...at(-2)).powered, true);
  tick(w, 0.1);
  assert.equal(w.state(...at(-1)).powered, false);
});

test('two facing observers form a bounded real clock instead of recursively updating in one step', () => {
  const { w, origin, at } = rig();
  put(w, at(1), 'observer', { facing: 3, powered: false });
  const outputs = [];
  for (let n = 0; n < 20; n++) {
    tick(w, 0.1);
    outputs.push(!!w.state(...origin).powered);
    assert.equal(w.redstone.timers.size <= 2, true);
  }
  assert.equal(outputs.filter(Boolean).length, 10);
  assert.equal(
    outputs.filter((on, i) => i && on !== outputs[i - 1]).length,
    19,
  );
});

test('a pulse strongly powers a solid output, runs a piston and delivers exactly one item to a real chest', () => {
  const a = rig();
  a.w.set(...a.at(-1), 'stone');
  a.w.set(a.at(-1)[0], 41, a.at(-1)[2], 'redstoneWire');
  pulse(a.w, a.at(1));
  tick(a.w, 0.1);
  assert.equal(a.w.redstone.power(a.at(-1)[0], 41, a.at(-1)[2]), 15);
  assert.equal(a.w.redstone.conductive(...a.origin), false);

  const b = rig();
  put(b.w, b.at(-1), 'piston', { facing: 3, powered: false });
  b.w.set(...b.at(-2), 'stone');
  pulse(b.w, b.at(1));
  advance(b.w, 0.2);
  assert.equal(
    b.w.state(...b.at(-1)).open,
    true,
    'one redstone tick must actuate a piston',
  );
  assert.equal(b.w.get(...b.at(-2)), 'pistonHead');
  assert.equal(b.w.get(...b.at(-3)), 'stone');
  advance(b.w, 0.11);
  assert.equal(b.w.state(...b.at(-1)).open, false);

  const c = rig();
  put(c.w, c.at(-1), 'dropper', { facing: 3, powered: false });
  put(c.w, c.at(-2), 'chest');
  c.w.chests.set(key(...c.at(-1)), [
    { item: 'cobble', count: 4 },
    ...Array(8).fill(null),
  ]);
  c.w.chests.set(key(...c.at(-2)), Array(27).fill(null));
  pulse(c.w, c.at(1));
  advance(c.w, 0.6);
  const count = (p) =>
    c.w.chests.get(key(...p)).reduce((n, s) => n + (s?.count || 0), 0);
  assert.equal(count(c.at(-1)), 3);
  assert.equal(count(c.at(-2)), 1);
  advance(c.w, 1);
  assert.equal(count(c.at(-1)) + count(c.at(-2)), 4);
  assert.equal(count(c.at(-2)), 1, 'stable target cannot repeatedly dispense');

  const h = rig();
  put(h.w, h.at(-1), 'hopper', { facing: 3, down: false, powered: false });
  put(h.w, h.at(-2), 'chest');
  h.w.chests.set(key(...h.at(-1)), [
    { item: 'cobble', count: 2 },
    ...Array(4).fill(null),
  ]);
  h.w.chests.set(key(...h.at(-2)), Array(27).fill(null));
  pulse(h.w, h.at(1));
  tick(h.w, 0.1);
  h.w.hoppers.tick(0.05, null);
  assert.equal(h.w.chests.get(key(...h.at(-1)))[0].count, 2);
  tick(h.w, 0.1);
  h.w.hoppers.tick(0.05, null);
  assert.equal(h.w.chests.get(key(...h.at(-1)))[0].count, 1);
  assert.equal(h.w.chests.get(key(...h.at(-2)))[0].count, 1);
});

test('container inventory stays separate, while a real comparator state transition can trigger a pulse', () => {
  const { w, origin, at } = rig();
  put(w, at(1), 'comparator', { facing: 3, output: 0, subtract: false });
  put(w, at(2), 'chest');
  w.chests.set(key(...at(2)), Array(27).fill(null));
  advance(w, 0.2);
  w.chests.get(key(...at(2)))[0] = { item: 'cobble', count: 64 };
  tick(w);
  tick(w, 0.1);
  assert.equal(w.state(...at(1)).output, 1);
  assert.equal(w.state(...origin).powered, false);
  tick(w, 0.1);
  assert.equal(w.state(...origin).powered, true);
});

test('pending and active phases survive validated saves and freeze while unloaded without replay', () => {
  for (const active of [false, true]) {
    const { w, origin, at } = rig(7);
    pulse(w, at(1));
    if (active) tick(w, 0.1);
    tick(w, 0.04);
    const saved = currentSave(w);
    validateSave(saved);
    const restored = new World(w.seed, w.dimension, saved.dimensions.overworld);
    assert.equal(!!restored.state(...origin).powered, active);
    const remaining = restored.redstone.timers.get(key(...origin));
    restored.ensureAround(80, 80, 0);
    tick(restored, 100);
    assert.equal(restored.redstone.timers.get(key(...origin)), remaining);
    restored.ensureAround(origin[0], origin[2], 1);
    tick(restored, remaining - 0.001);
    assert.equal(!!restored.state(...origin).powered, active);
    tick(restored, 0.001);
    assert.equal(!!restored.state(...origin).powered, !active);
    advance(restored, 0.4);
    assert.equal(restored.state(...origin).powered, false);
    assert.equal(restored.redstone.timers.has(key(...origin)), false);
    validateSave(currentSave(restored));
  }
});

test('removal cancels a pending pulse and piston motion resets and re-arms the moved observer', () => {
  const { w, origin, at } = rig();
  pulse(w, at(1));
  w.set(...origin, null);
  tick(w, 1);
  assert.equal(w.redstone.timers.has(key(...origin)), false);
  assert.equal(w.state(...at(-1)).powered, false);
  put(w, origin, 'observer', { facing: 1, powered: false });
  put(w, at(1), 'piston', { facing: 3, powered: false });
  const supply = [at(1)[0], 40, at(1)[2] + 1];
  put(w, supply, 'lever', { powered: true });
  tick(w);
  tick(w, 0.1);
  assert.equal(w.get(...at(-1)), 'observer');
  assert.equal(w.state(...at(-1)).powered, false);
  assert.equal(w.redstone.timers.has(key(...at(-1))), true);
  tick(w, 0.1);
  assert.equal(w.state(...at(-1)).powered, true);
  tick(w, 0.1);
  assert.equal(w.state(...at(-1)).powered, false);
  validateSave(currentSave(w));
});

test('invalid observer timers, direction and active states are rejected by the production save parser', () => {
  const { w, origin, at } = rig();
  pulse(w, at(1));
  const valid = currentSave(w);
  validateSave(valid);
  for (const time of [0, -1, 0.10001, Infinity, NaN]) {
    const bad = structuredClone(valid);
    bad.dimensions.overworld.redstoneTimers = [[key(...origin), time]];
    assert.throws(() => validateSave(bad));
  }
  const badDirection = structuredClone(valid);
  badDirection.dimensions.overworld.blockStates.find(
    ([k]) => k === key(...origin),
  )[1].facing = 8;
  assert.throws(() => validateSave(badDirection));
  const stuck = structuredClone(valid);
  stuck.dimensions.overworld.redstoneTimers = [];
  stuck.dimensions.overworld.blockStates.find(
    ([k]) => k === key(...origin),
  )[1].powered = true;
  assert.throws(() => validateSave(stuck));
});
