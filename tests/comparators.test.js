import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS, key, RECIPES } from '../src/core.js';
import { PlayerInventory, stackSize } from '../src/inventory.js';
import { miningStats } from '../src/mining.js';
import { miningLoot } from '../src/mining-loot.js';
import { newFurnace, tickFurnace } from '../src/furnaces.js';
import { newBrewing, tickBrewing } from '../src/brewing.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
} from '../src/crafting.js';

// Failure list and production-first browser scenario precede these numeric,
// timing, streaming and corrupt-save cases: docs/comparators-verification.md.
function fixture() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 3);
  for (let q = -12; q <= 12; q++)
    for (let r = -6; r <= 6; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
    }
  return w;
}
function put(w, q, r, type, state = {}) {
  w.set(q, 40, r, type);
  w.setState(q, 40, r, { facing: 0, open: false, ...state });
}
function chest(w, q, r, level, type = 'chest') {
  put(w, q, r, type);
  const slots = Array(27).fill(null);
  for (
    let i = 0;
    i < (level ? Math.ceil(((level - 1) * 27) / 14) || 1 : 0);
    i++
  )
    slots[i] = { item: 'stone', count: 64 };
  w.chests.set(key(q, 40, r), slots);
  return slots;
}
const tick = (w, dt = 0) => w.redstone.tick(dt, [], () => true);
function advance(w, seconds) {
  for (let left = seconds; left > 1e-8; left -= 0.01)
    tick(w, Math.min(0.01, left));
}
const output = (w, q = 0, r = 0) => w.state(q, 40, r).output || 0;

test('every analog strength crosses a seam in all six directions without a boost or reverse output', () => {
  for (let facing = 0; facing < 6; facing++) {
    const w = fixture(),
      q = -8,
      r = 0,
      [dq, dr] = DIRECTIONS[facing];
    put(w, q, r, 'comparator', { facing });
    put(w, q + dq, r + dr, 'redstoneWire');
    put(w, q + 2 * dq, r + 2 * dr, 'redstoneWire');
    for (let level = 0; level <= 15; level++) {
      chest(w, q - dq, r - dr, level);
      tick(w);
      advance(w, 0.1);
      assert.equal(output(w, q, r), level);
      assert.equal(w.redstone.power(q + dq, 40, r + dr), level);
      assert.equal(
        w.redstone.power(q + 2 * dq, 40, r + 2 * dr),
        Math.max(0, level - 1),
      );
      assert.equal(w.redstone.outputTo(q, 40, r, [q - dq, 40, r - dr]), 0);
      for (let i = 0; i < 6; i++)
        if (i !== facing) {
          const [a, b] = DIRECTIONS[i];
          assert.equal(w.redstone.outputTo(q, 40, r, [q + a, 40, r + b]), 0);
        }
    }
  }
});

test('compare equality, subtract saturation and the maximum of two directed side inputs use live inventories', () => {
  const w = fixture();
  put(w, 0, 0, 'comparator');
  put(w, 0, 1, 'comparator', { facing: 4 });
  put(w, 1, -1, 'comparator', { facing: 2 });
  for (const [back, left, right] of [
    [0, 0, 0],
    [1, 0, 0],
    [10, 7, 4],
    [10, 10, 7],
    [10, 11, 4],
    [7, 4, 10],
    [15, 15, 15],
  ]) {
    chest(w, -1, 0, back);
    chest(w, 0, 2, left);
    chest(w, 2, -2, right);
    tick(w);
    advance(w, 0.2);
    assert.equal(output(w), back >= Math.max(left, right) ? back : 0);
    w.redstone.activate(0, 40, 0);
    tick(w);
    advance(w, 0.1);
    assert.equal(output(w), Math.max(0, back - Math.max(left, right)));
    w.redstone.activate(0, 40, 0);
    tick(w);
    advance(w, 0.1);
  }
  // A side chest and a powered solid are not comparator side signal sources.
  w.set(0, 40, 1, null);
  w.set(1, 40, -1, null);
  chest(w, 0, 1, 15);
  put(w, 1, -1, 'stone');
  put(w, 2, -2, 'lever', { powered: true, mount: 'wall', facing: 2 });
  chest(w, -1, 0, 7);
  tick(w);
  advance(w, 0.2);
  assert.equal(output(w), 7);
});

test('storage capacities, blocked lids, stale records and real furnace/brewing slot consumption are measured', () => {
  const w = fixture();
  put(w, 0, 0, 'comparator');
  const slots = chest(w, -1, 0, 0);
  const settle = () => {
    tick(w);
    advance(w, 0.1);
    return output(w);
  };
  assert.equal(settle(), 0);
  slots[0] = { item: 'stone', count: 1 };
  assert.equal(settle(), 1);
  for (const item of ['stone', 'bucket', 'sword']) {
    slots.fill(null);
    for (let i = 0; i < 9; i++) slots[i] = { item, count: stackSize(item) };
    assert.equal(settle(), 5, item);
  }
  slots.fill({ item: 'stone', count: 64 });
  assert.equal(settle(), 15);
  w.set(-1, 41, 0, 'stone');
  assert.equal(settle(), 0);
  put(w, -1, 0, 'shulkerBox');
  assert.equal(settle(), 15);
  w.set(-1, 40, 0, null);
  assert.equal(settle(), 0, 'stale map must not be read');
  w.set(-1, 41, 0, null);
  put(w, -1, 0, 'furnace');
  const f = newFurnace();
  w.furnaces.set('-1,40,0', f);
  f.fuel = { item: 'lavaBucket', count: 1 };
  assert.equal(settle(), 5);
  f.input = { item: 'netherQuartzOre', count: 1 };
  tickFurnace(f, 0.05);
  assert.equal(f.fuel.item, 'bucket');
  assert.equal(settle(), 1);
  for (let i = 0; i < 101; i++) tickFurnace(f, 0.1);
  assert.equal(f.output.item, 'netherQuartz');
  assert.equal(settle(), 1);
  f.fuel = f.output = null;
  assert.equal(settle(), 0, 'burn time and XP are not inventory');
  put(w, -1, 0, 'brewingStand');
  const b = newBrewing();
  w.brewing.set('-1,40,0', b);
  b.bottles = ['waterBottle', 'waterBottle', 'waterBottle'];
  b.ingredient = { item: 'netherWart', count: 64 };
  b.fuelStock = 64;
  assert.equal(settle(), 15);
  tickBrewing(b, 0.05);
  assert.equal(settle(), 14, 'fuel becomes internal charges');
  b.bottles = [null, null, null];
  b.ingredient = null;
  b.fuelStock = 0;
  assert.equal(settle(), 0, 'charges and progress do not occupy slots');
});

test('one conductive rear block reads storage, analog strong power survives and weak power cannot relay into wire', () => {
  const w = fixture();
  put(w, 0, 0, 'comparator');
  chest(w, -2, 0, 7);
  put(w, -1, 0, 'stone');
  put(w, 1, 0, 'redstoneWire');
  const settle = () => {
    tick(w);
    advance(w, 0.2);
    return output(w);
  };
  assert.equal(settle(), 7);
  put(w, -1, 0, 'glass');
  assert.equal(settle(), 0);
  put(w, -1, 0, 'stone');
  chest(w, -3, 0, 15);
  put(w, -2, 0, 'stone');
  assert.equal(settle(), 0, 'two solids do not expose remote inventory');
  chest(w, -2, 0, 7);
  put(w, -1, -1, 'lever', { powered: true, mount: 'wall', facing: 1 });
  assert.equal(settle(), 15, 'full strong power overrides through-read');
  w.set(-1, 40, -1, null);
  put(w, 1, 0, 'stone');
  put(w, 2, 0, 'redstoneWire');
  put(w, 3, 0, 'comparator');
  put(w, 4, 0, 'redstoneWire');
  put(w, 5, 0, 'repeater');
  put(w, 6, 0, 'redstoneWire');
  assert.equal(settle(), 7);
  advance(w, 0.2);
  assert.equal(w.redstone.power(2, 40, 0), 7);
  assert.equal(output(w, 3), 7);
  assert.equal(w.redstone.power(4, 40, 0), 7);
  assert.equal(w.redstone.power(6, 40, 0), 15);
  // Wire at q2 weakly powers this off-axis block, which cannot seed q2,r2.
  put(w, 2, 1, 'stone');
  put(w, 2, 2, 'redstoneWire');
  settle();
  assert.equal(w.redstone.power(2, 40, 2), 0);
});

test('transitions consume one delay per stage and a live subtract feedback loop stays bounded', () => {
  const w = fixture();
  chest(w, -1, 0, 10);
  put(w, 0, 0, 'comparator');
  put(w, 1, 0, 'comparator');
  put(w, 2, 0, 'redstoneWire');
  tick(w);
  advance(w, 0.09);
  assert.equal(output(w), 0);
  advance(w, 0.01);
  assert.equal(output(w), 10);
  assert.equal(output(w, 1), 0);
  tick(w, 1);
  assert.equal(output(w, 1), 10, 'coarse step cannot skip a pending stage');
  w.set(1, 40, 0, null);
  w.set(2, 40, 0, null);
  for (const [q, r, facing] of [
    [0, 0, 0],
    [1, 0, 2],
    [0, 1, 4],
  ])
    put(w, q, r, 'comparator', { facing, subtract: true, output: 0 });
  chest(w, -1, 0, 15);
  chest(w, 2, -1, 15);
  chest(w, 0, 2, 15);
  tick(w);
  const observed = [];
  for (let i = 0; i < 12; i++) {
    advance(w, 0.1);
    observed.push(output(w));
  }
  assert.deepEqual(observed, [15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0]);
  assert.equal(w.redstone.timers.size, 3);
});

test('pending analog output, mode and actual chest slots survive save and freeze while unloaded', () => {
  const w = fixture();
  chest(w, -1, 0, 10);
  put(w, 0, 0, 'comparator', { subtract: true, output: 0 });
  put(w, 1, 0, 'redstoneWire');
  tick(w);
  advance(w, 0.04);
  const data = JSON.parse(JSON.stringify(currentSave(w)));
  validateSave(data);
  const restored = new World(624, 'overworld', {
    load: false,
    ...data.dimensions.overworld,
  });
  restored.ensureAround(90, 0, 1);
  tick(restored, 20);
  assert.ok(Math.abs(restored.redstone.timers.get('0,40,0') - 0.06) < 1e-7);
  restored.ensureAround(0, 0, 3);
  advance(restored, 0.05);
  assert.equal(output(restored), 0);
  advance(restored, 0.01);
  assert.equal(output(restored), 10);
  assert.equal(restored.state(0, 40, 0).subtract, true);
  assert.equal(restored.chests.get('-1,40,0').filter(Boolean).length, 18);
  restored.set(0, 40, 0, null);
  assert.equal(restored.redstone.timers.has('0,40,0'), false);
});

test('invalid analog states, modes, unrelated fields and timers cannot enter current saves', () => {
  const w = fixture();
  put(w, 0, 0, 'comparator', { subtract: false, output: 3 });
  const data = currentSave(w);
  validateSave(data);
  const invalid = [
    ...[-1, 16, 0.5].map((value) => (d) => {
      d.blockStates[0][1].output = value;
    }),
    (d) => {
      d.blockStates[0][1].subtract = 'yes';
    },
    (d) => {
      d.blockStates[0][1].powered = true;
    },
    (d) => {
      d.blockStates[0][1].mount = 'wall';
    },
    (d) => {
      d.blockStates[0][1].delay = 1;
    },
    (d) => {
      d.edits.find(([k]) => k === '0,40,0')[1] = 'stone';
    },
    (d) => {
      d.redstoneTimers.push(['0,40,0', 0.101]);
    },
    (d) => {
      d.redstoneTimers.push(['4,40,0', 0.05]);
    },
  ];
  for (const corrupt of invalid) {
    const copy = structuredClone(data);
    corrupt(copy.dimensions.overworld);
    assert.throws(() => validateSave(copy));
  }
});

test('naturally generated quartz supports correct harvesting, enchantments, smelting and actual station crafting', () => {
  for (const seed of [624, 1977]) {
    const w = new World(seed, 'nether');
    const quartz = [...w.blocks]
      .filter(([, type]) => type === 'netherQuartzOre')
      .map(([k]) => k.split(',').map(Number));
    assert.ok(quartz.some(([, y]) => y < 40));
    assert.ok(quartz.some(([, y]) => y >= 48));
  }
  assert.equal(miningStats('netherQuartzOre', null).harvest, false);
  assert.equal(miningStats('netherQuartzOre', 'pick1').harvest, true);
  assert.deepEqual(miningLoot('netherQuartzOre', { harvest: false }), {
    stacks: [],
    xp: 0,
  });
  for (const random of [() => 0, () => 0.999]) {
    const normal = miningLoot('netherQuartzOre', { random });
    assert.equal(normal.stacks[0].item, 'netherQuartz');
    assert.equal(normal.stacks[0].count, 1);
    assert.ok(normal.xp >= 2 && normal.xp <= 5);
  }
  assert.equal(
    miningLoot('netherQuartzOre', {
      enchant: { fortune: 3 },
      random: () => 0.999,
    }).stacks[0].count,
    4,
  );
  assert.deepEqual(
    miningLoot('netherQuartzOre', { enchant: { silkTouch: 1 } }),
    { stacks: [{ item: 'netherQuartzOre', count: 1 }], xp: 0 },
  );
  const f = newFurnace();
  f.input = { item: 'netherQuartzOre', count: 1 };
  f.fuel = { item: 'coal', count: 1 };
  for (let i = 0; i < 101; i++) tickFurnace(f, 0.1);
  assert.deepEqual(f.output, { item: 'netherQuartz', count: 1 });
  assert.equal(f.xp, 0.2);
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  for (const [id, n] of Object.entries({
    wood: 3,
    redstone: 3,
    stone: 3,
    netherQuartz: 1,
  }))
    pack.insert(id, n);
  const craft = (id, station) => {
    const i = RECIPES.findIndex((r) => r.id === id);
    fillCraftingRecipe(pack, grid, RECIPES[i]);
    return quickCraft(pack, grid, i, station, 1).count;
  };
  for (let i = 0; i < 3; i++) assert.equal(craft('redstoneTorch', false), 1);
  assert.equal(craft('comparator', false), 0);
  assert.equal(craft('comparator', true), 1);
  assert.equal(pack.count('comparator'), 1);
  for (const id of [
    'wood',
    'redstone',
    'stone',
    'netherQuartz',
    'redstoneTorch',
  ])
    assert.equal(pack.count(id), 0);
});
