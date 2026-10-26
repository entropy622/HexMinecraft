import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS, axialToWorld, RECIPES } from '../src/core.js';
import { VoxelLight } from '../src/voxel-light.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';

// Failure modes: infinite loops sustaining themselves, attenuation lost at a
// chunk seam, wires through solid ceilings, weak power feeding another wire,
// unloaded timers expiring, saved buttons sticking, plates triggered overhead,
// and a blocked door swallowing the next power edge.
function fixture() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 3);
  for (let q = -18; q <= 18; q++)
    for (let r = -3; r <= 3; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
    }
  return w;
}
function put(w, q, type, r = 0, y = 40, state = {}) {
  w.set(q, y, r, type);
  w.setState(q, y, r, { facing: 0, open: false, ...state });
}
function tick(w, dt = 0.05, actors = [], operate = () => true) {
  return w.redstone.tick(dt, actors, operate);
}

test('six-way wires attenuate across negative chunk seams and lose loop power', () => {
  const w = fixture();
  put(w, -17, 'lever');
  for (let q = -16; q <= 0; q++) put(w, q, 'redstoneWire');
  w.redstone.activate(-17, 40, 0);
  tick(w);
  assert.equal(w.redstone.power(-16, 40, 0), 15);
  assert.equal(w.redstone.power(-8, 40, 0), 7);
  assert.equal(w.redstone.power(-2, 40, 0), 1);
  assert.equal(w.redstone.power(-1, 40, 0), 0);
  for (const [dq, dr] of DIRECTIONS) put(w, 5 + dq, 'redstoneWire', dr);
  put(w, 5, 'lever');
  w.redstone.activate(5, 40, 0);
  tick(w);
  for (const [dq, dr] of DIRECTIONS)
    assert.equal(w.redstone.power(5 + dq, 40, dr), 15);
  w.redstone.activate(5, 40, 0);
  tick(w);
  for (const [dq, dr] of DIRECTIONS)
    assert.equal(w.redstone.power(5 + dq, 40, dr), 0);
  put(w, -9, 'lever', 1);
  w.redstone.activate(-9, 40, 1);
  tick(w);
  assert.equal(w.redstone.power(-8, 40, 0), 15);
  w.set(-9, 40, 1, null);
  tick(w);
  assert.equal(w.redstone.power(-8, 40, 0), 7);
});

test('wire steps need headroom and solids relay strong but not weak wire power', () => {
  const w = fixture();
  put(w, 0, 'lever');
  put(w, 1, 'redstoneWire');
  put(w, 2, 'stone');
  put(w, 2, 'redstoneWire', 0, 41);
  put(w, 3, 'redstoneWire');
  w.redstone.activate(0, 40, 0);
  tick(w);
  assert.equal(w.redstone.power(2, 41, 0), 14);
  assert.equal(w.redstone.power(3, 40, 0), 13);
  put(w, 1, 'stone', 0, 41);
  tick(w);
  assert.equal(w.redstone.power(2, 41, 0), 0);
  // A wall-mounted lever strongly powers its supporting full block.
  put(w, -5, 'lever', 0, 40, { mount: 'wall', facing: 0 });
  put(w, -4, 'stone');
  put(w, -3, 'redstoneWire');
  put(w, -2, 'stone');
  put(w, -1, 'redstoneLamp');
  put(w, -2, 'redstoneWire', 1);
  w.redstone.activate(-5, 40, 0);
  tick(w);
  assert.equal(w.redstone.power(-3, 40, 0), 15);
  assert.equal(w.redstone.power(-2, 40, 1), 0);
  assert.equal(w.state(-1, 40, 0).powered, true);
});

test('buttons, living pressure plates and timers survive saves and freeze unloaded', () => {
  const w = fixture();
  put(w, 0, 'stoneButton');
  put(w, 1, 'redstoneWire');
  put(w, 2, 'redstoneLamp');
  w.redstone.activate(0, 40, 0);
  tick(w, 0.25);
  assert.equal(w.state(2, 40, 0).powered, true);
  assert.equal(w.redstone.activate(0, 40, 0), false);
  assert.equal(w.redstone.timers.get('0,40,0'), 0.75);
  const saved = w.serialize();
  const copy = new World(624, 'overworld', { ...saved, load: false });
  copy.ensureAround(0, 0, 3);
  tick(copy, 0.74);
  assert.equal(copy.state(0, 40, 0).powered, true);
  tick(copy, 0.02);
  assert.equal(copy.state(0, 40, 0).powered, false);
  assert.equal(copy.state(2, 40, 0).powered, false);
  w.unloadChunk(0, 0);
  tick(w, 5);
  assert.equal(w.redstone.timers.get('0,40,0'), 0.75);
  w.generateChunk(0, 0);
  tick(w, 0.76);
  assert.equal(w.state(0, 40, 0).powered, false);
  put(w, 4, 'stonePressurePlate');
  put(w, 5, 'redstoneLamp');
  const p = axialToWorld(4, 0);
  const actor = { x: p.x, y: 40, z: p.z, radius: 0.24 };
  tick(w, 0.1, [{ ...actor, y: 41 }]);
  assert.equal(!!w.state(5, 40, 0).powered, false);
  tick(w, 0.1, [actor]);
  assert.equal(w.state(5, 40, 0).powered, true);
  tick(w, 0.49);
  assert.equal(w.state(5, 40, 0).powered, true);
  tick(w, 0.02);
  assert.equal(w.state(5, 40, 0).powered, false);
  w.set(4, 40, 0, null);
  assert.equal(w.redstone.timers.has('4,40,0'), false);
});

test('door edges preserve manual overrides and retry blocked operations', () => {
  const w = fixture();
  put(w, 0, 'lever');
  put(w, 1, 'door');
  put(w, 1, 'doorTop', 0, 41);
  let blocked = true,
    calls = 0;
  const operate = (q, y, r, open) => {
    calls++;
    if (blocked) return false;
    w.setState(q, y, r, { ...w.state(q, y, r), open });
    return true;
  };
  w.redstone.activate(0, 40, 0);
  tick(w, 0.05, [], operate);
  assert.equal(w.state(1, 40, 0).open, false);
  blocked = false;
  tick(w, 0.05, [], operate);
  assert.equal(w.state(1, 40, 0).open, true);
  w.setState(1, 40, 0, { ...w.state(1, 40, 0), open: false });
  tick(w, 0.05, [], operate);
  assert.equal(w.state(1, 40, 0).open, false);
  assert.equal(calls, 2);
  w.redstone.activate(0, 40, 0);
  tick(w, 0.05, [], operate);
  assert.equal(w.state(1, 40, 0).powered, false);
});

test('lamp light is transported only while powered, including across a reload', () => {
  const w = fixture();
  put(w, 0, 'lever');
  put(w, 1, 'redstoneLamp');
  const field = new VoxelLight(w);
  field.update(0, true);
  const sample = () =>
    field.rgb.map((channel) => channel[field.index(1, 41, 0)]);
  assert.deepEqual(sample(), [0, 0, 0]);
  w.redstone.activate(0, 40, 0);
  tick(w);
  field.update(0, true);
  assert.deepEqual(sample(), [14, 12, 8]);
  const copy = new World(624, 'overworld', { ...w.serialize(), load: false });
  copy.ensureAround(0, 0, 3);
  tick(copy);
  assert.equal(copy.state(1, 40, 0).powered, true);
  w.redstone.activate(0, 40, 0);
  tick(w);
  field.update(0, true);
  assert.deepEqual(sample(), [0, 0, 0]);
});

test('opening an output that breaks its supporting wire invalidates the network', () => {
  const w = fixture();
  put(w, 0, 'lever');
  put(w, 1, 'redstoneWire');
  put(w, 2, 'redstoneLamp');
  put(w, 1, 'trapdoor', 1);
  const operate = (q, y, r, open) => {
    w.setState(q, y, r, { ...w.state(q, y, r), open });
    if (open) w.set(1, 40, 0, null);
    return true;
  };
  w.redstone.activate(0, 40, 0);
  tick(w, 0.05, [], operate);
  tick(w, 0.05, [], operate);
  assert.equal(w.redstone.power(1, 40, 0), 0);
  assert.equal(w.state(2, 40, 0).powered, false);
});

test('survival component recipes consume actual slots and lamp needs a workbench', () => {
  for (const id of [
    'lever',
    'stoneButton',
    'stonePressurePlate',
    'redstoneLamp',
  ]) {
    const pack = new PlayerInventory(),
      grid = newCraftingGrid();
    const index = RECIPES.findIndex((r) => r.id === id),
      recipe = RECIPES[index];
    for (const [item, count] of Object.entries(recipe.cost))
      pack.insert(item, count);
    assert.ok(fillCraftingRecipe(pack, grid, recipe).ok);
    if (id === 'redstoneLamp')
      assert.equal(quickCraft(pack, grid, index, false, 1).count, 0);
    assert.equal(quickCraft(pack, grid, index, true, 1).count, 1);
    assert.equal(pack.count(id), 1);
    for (const item of Object.keys(recipe.cost))
      assert.equal(pack.count(item), 0);
    assert.ok(grid.every((s) => s === null));
  }
});

test('current save rejects corrupt circuit state and orphaned or unbounded timers', () => {
  const w = fixture();
  put(w, 0, 'stoneButton', 0, 40, { mount: 'wall', facing: 0 });
  w.redstone.activate(0, 40, 0);
  const saved = currentSave(w);
  assert.equal(validateSave(saved), saved);
  const corruptions = [
    (d) => (d.blockStates.find(([k]) => k === '0,40,0')[1].powered = 'true'),
    (d) => (d.blockStates.find(([k]) => k === '0,40,0')[1].mount = 'roof'),
    (d) => (d.redstoneTimers[0][1] = -1),
    (d) => (d.redstoneTimers[0][1] = Infinity),
    (d) => (d.redstoneTimers[0][1] = 2),
    (d) => d.redstoneTimers.push([...d.redstoneTimers[0]]),
    (d) => (d.redstoneTimers[0][0] = '1,40,0'),
    (d) => (d.redstoneTimers = []),
    (d) => delete d.redstoneTimers,
  ];
  for (const corrupt of corruptions) {
    const copy = structuredClone(saved);
    corrupt(copy.dimensions.overworld);
    assert.throws(() => validateSave(copy));
  }
});
