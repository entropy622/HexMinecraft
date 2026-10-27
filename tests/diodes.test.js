import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS, RECIPES } from '../src/core.js';
import { VoxelLight } from '../src/voxel-light.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';

// Input directions, seams, phase boundaries, pulse stretching/filtering,
// simultaneous transitions, loaded time, burnout, persistence and corrupt
// records are specified in docs/diodes-verification.md before implementation.
function fixture() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 3);
  for (let q = -20; q <= 20; q++)
    for (let r = -8; r <= 8; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
    }
  return w;
}
function put(w, q, r, type, state = {}) {
  w.set(q, 40, r, type);
  w.setState(q, 40, r, { facing: 0, open: false, ...state });
}
const tick = (w, dt = 0) => w.redstone.tick(dt, [], () => true);
function advance(w, seconds) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.01)
    tick(w, Math.min(0.01, remaining));
}

test('repeaters restore 15 only from rear input in every hex direction across a seam', () => {
  for (let facing = 0; facing < 6; facing++) {
    const w = fixture(),
      [dq, dr] = DIRECTIONS[facing],
      q = -8,
      r = 0;
    put(w, q, r, 'repeater', { facing, delay: 1 });
    put(w, q - dq, r - dr, 'redstoneWire');
    put(w, q - 2 * dq, r - 2 * dr, 'lever', { powered: true });
    put(w, q + dq, r + dr, 'redstoneWire');
    put(w, q + 2 * dq, r + 2 * dr, 'redstoneWire');
    tick(w);
    advance(w, 0.09);
    assert.equal(w.redstone.power(q + dq, 40, r + dr), 0);
    advance(w, 0.01);
    assert.equal(w.redstone.power(q + dq, 40, r + dr), 15);
    assert.equal(w.redstone.power(q + 2 * dq, 40, r + 2 * dr), 14);
    w.set(q - dq, 40, r - dr, null);
    w.set(q - 2 * dq, 40, r - 2 * dr, null);
    put(w, q + 2 * dq, r + 2 * dr, 'lever', { powered: true });
    tick(w);
    advance(w, 0.1);
    assert.equal(
      w.state(q, 40, r).powered,
      false,
      'front power must not feed back',
    );
    assert.equal(w.redstone.locked(q, 40, r), false);
  }
});

test('four delays extend short on pulses and suppress shorter off gaps', () => {
  for (let delay = 1; delay <= 4; delay++) {
    const w = fixture(),
      duration = delay * 0.1;
    put(w, -1, 0, 'lever', { powered: true });
    put(w, 0, 0, 'repeater', { delay });
    put(w, 1, 0, 'redstoneWire');
    tick(w);
    advance(w, duration * 0.3);
    w.redstone.activate(-1, 40, 0);
    tick(w);
    advance(w, duration * 0.7);
    assert.equal(
      w.redstone.power(1, 40, 0),
      15,
      'short input must still emerge',
    );
    advance(w, duration - 0.01);
    assert.equal(w.redstone.power(1, 40, 0), 15);
    advance(w, 0.01);
    assert.equal(w.redstone.power(1, 40, 0), 0);
    w.redstone.activate(-1, 40, 0);
    tick(w);
    advance(w, duration);
    w.redstone.activate(-1, 40, 0);
    tick(w);
    advance(w, duration * 0.4);
    w.redstone.activate(-1, 40, 0);
    tick(w);
    advance(w, duration);
    assert.equal(w.redstone.power(1, 40, 0), 15, 'short off gap must not leak');
  }
});

test('a strength-one tail is boosted and a real feedback torch clock burns out without hanging', () => {
  const w = fixture();
  put(w, -17, 0, 'lever', { powered: true });
  for (let q = -16; q <= -2; q++) put(w, q, 0, 'redstoneWire');
  put(w, -1, 0, 'repeater', { delay: 1 });
  put(w, 0, 0, 'redstoneWire');
  tick(w);
  advance(w, 0.1);
  assert.equal(w.redstone.power(-2, 40, 0), 1);
  assert.equal(w.redstone.power(0, 40, 0), 15);
  put(w, 4, 0, 'stone');
  put(w, 5, 0, 'redstoneTorch', { facing: 3, mount: 'wall', powered: true });
  w.set(5, 41, 0, 'stone');
  w.set(4, 41, 0, 'redstoneWire');
  put(w, 12, 0, 'redstoneTorch', { powered: true });
  tick(w);
  advance(w, 1.5);
  assert.ok(w.redstone.burnouts.get('5,40,0')?.cooldown > 7.9);
  assert.equal(w.state(5, 40, 0).powered, false);
  assert.equal(w.state(12, 40, 0).powered, true);
  assert.equal(w.redstone.burnouts.has('12,40,0'), false);
});

test('side repeater locking freezes both output states and cancels pending work', () => {
  const w = fixture();
  put(w, -1, 0, 'lever', { powered: true });
  put(w, 0, 0, 'repeater', { delay: 1 });
  put(w, 1, 0, 'redstoneWire');
  put(w, 0, 1, 'repeater', { facing: 4, delay: 1 });
  put(w, 0, 2, 'lever', { powered: true });
  tick(w);
  advance(w, 0.12);
  assert.equal(w.redstone.locked(0, 40, 0), true);
  w.redstone.activate(-1, 40, 0);
  tick(w);
  advance(w, 0.5);
  assert.equal(w.redstone.power(1, 40, 0), 15);
  assert.equal(w.redstone.timers.has('0,40,0'), false);
  w.redstone.activate(0, 40, 2);
  tick(w);
  advance(w, 0.2);
  assert.equal(w.redstone.power(1, 40, 0), 0);
  w.redstone.activate(0, 40, 2);
  tick(w);
  advance(w, 0.1);
  w.redstone.activate(-1, 40, 0);
  tick(w);
  advance(w, 0.5);
  assert.equal(w.redstone.power(1, 40, 0), 0, 'locked off stays off');
  w.redstone.activate(0, 40, 2);
  tick(w);
  advance(w, 0.2);
  assert.equal(w.redstone.power(1, 40, 0), 15);
  put(w, 0, 1, 'redstoneWire');
  tick(w);
  assert.equal(w.redstone.locked(0, 40, 0), false, 'dust cannot lock');
});

test('chained delays add up and pending output freezes unloaded then restores', () => {
  const w = fixture();
  put(w, -1, 0, 'lever', { powered: true });
  put(w, 0, 0, 'repeater', { delay: 2 });
  put(w, 1, 0, 'repeater', { delay: 3 });
  put(w, 2, 0, 'redstoneWire');
  tick(w);
  advance(w, 0.19);
  assert.equal(w.state(0, 40, 0).powered, undefined);
  advance(w, 0.01);
  assert.equal(w.state(0, 40, 0).powered, true);
  advance(w, 0.1);
  const data = JSON.parse(JSON.stringify(currentSave(w)));
  assert.equal(validateSave(data), data);
  const restored = new World(624, 'overworld', {
    load: false,
    ...data.dimensions.overworld,
  });
  restored.ensureAround(90, 0, 1);
  tick(restored, 20);
  assert.ok(Math.abs(restored.redstone.timers.get('1,40,0') - 0.2) < 1e-7);
  restored.ensureAround(0, 0, 3);
  advance(restored, 0.19);
  assert.equal(restored.redstone.power(2, 40, 0), 0);
  advance(restored, 0.01);
  assert.equal(restored.redstone.power(2, 40, 0), 15);
});

test('torch inverts attachment power, removes red light, burns out and restores its cooldown', () => {
  const w = fixture();
  put(w, 0, 0, 'stone');
  put(w, -1, 0, 'lever');
  put(w, 1, 0, 'redstoneTorch', { facing: 3, mount: 'wall', powered: true });
  put(w, 2, 0, 'redstoneWire');
  const light = new VoxelLight(w);
  light.update(0, true);
  const i = light.index(1, 41, 0);
  assert.ok(light.rgb[0][i] > light.rgb[2][i]);
  tick(w);
  assert.equal(w.redstone.power(2, 40, 0), 15);
  w.redstone.activate(-1, 40, 0);
  tick(w);
  advance(w, 0.09);
  assert.equal(w.state(1, 40, 0).powered, true);
  advance(w, 0.01);
  assert.equal(w.state(1, 40, 0).powered, false);
  light.update(0, true);
  assert.equal(light.rgb[0][i], 0);
  for (let cycle = 1; cycle <= 8; cycle++) {
    w.redstone.activate(-1, 40, 0);
    tick(w);
    advance(w, 0.11);
    if (cycle === 8) break;
    w.redstone.activate(-1, 40, 0);
    tick(w);
    advance(w, 0.11);
  }
  assert.ok(w.redstone.burnouts.get('1,40,0').cooldown > 7.8);
  const data = JSON.parse(JSON.stringify(currentSave(w)));
  validateSave(data);
  const restored = new World(624, 'overworld', {
    load: false,
    ...data.dimensions.overworld,
  });
  const cooldown = restored.redstone.burnouts.get('1,40,0').cooldown;
  restored.ensureAround(90, 0, 1);
  tick(restored, 60);
  assert.equal(restored.redstone.burnouts.get('1,40,0').cooldown, cooldown);
  restored.ensureAround(0, 0, 3);
  advance(restored, cooldown + 0.11);
  assert.equal(restored.state(1, 40, 0).powered, true);
  restored.set(1, 40, 0, null);
  assert.equal(restored.redstone.burnouts.has('1,40,0'), false);
});

test('diode crafting consumes real slots and malformed delay/thermal saves are rejected', () => {
  const w = fixture(),
    pack = new PlayerInventory(),
    grid = newCraftingGrid();
  for (const [id, n] of Object.entries({ wood: 2, redstone: 3, stone: 3 }))
    pack.insert(id, n);
  const craft = (id, station) => {
    const index = RECIPES.findIndex((r) => r.id === id),
      recipe = RECIPES[index];
    fillCraftingRecipe(pack, grid, recipe);
    return quickCraft(pack, grid, index, station, 1);
  };
  assert.equal(craft('redstoneTorch', false).count, 1);
  assert.equal(craft('redstoneTorch', false).count, 1);
  assert.equal(craft('repeater', false).count, 0);
  assert.equal(craft('repeater', true).count, 1);
  assert.equal(pack.count('repeater'), 1);
  put(w, 0, 0, 'repeater', { delay: 4 });
  put(w, 2, 0, 'redstoneTorch', { powered: false });
  w.redstone.burnouts.set('2,40,0', { recent: [3], cooldown: 8 });
  const data = currentSave(w);
  validateSave(data);
  for (const corrupt of [
    (d) => {
      d.blockStates.find(([k]) => k === '0,40,0')[1].delay = 0;
    },
    (d) => {
      d.blockStates.find(([k]) => k === '0,40,0')[1].delay = 4.5;
    },
    (d) => d.redstoneTimers.push(['0,40,0', 0.41]),
    (d) => d.torchBurnouts.push(d.torchBurnouts[0]),
    (d) => {
      d.torchBurnouts[0][0] = '0,40,0';
    },
    (d) => {
      d.torchBurnouts[0][1].cooldown = 9;
    },
    (d) => {
      d.torchBurnouts[0][1].recent = Array(9).fill(1);
    },
    (d) => {
      d.torchBurnouts[0][1].recent = [NaN];
    },
    (d) => {
      d.blockStates.find(([k]) => k === '2,40,0')[1].powered = true;
    },
    (d) => {
      delete d.torchBurnouts;
    },
  ]) {
    const copy = structuredClone(data.dimensions.overworld);
    corrupt(copy);
    assert.throws(() =>
      validateSave({ ...data, dimensions: { overworld: copy } }),
    );
  }
});
