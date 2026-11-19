import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RECIPES, DIRECTIONS, key } from '../src/core.js';
import { placements } from '../src/craft-shapes.js';
import {
  recipeCells,
  craftingMatches,
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
  consumeCrafting,
} from '../src/crafting.js';
import { PlayerInventory } from '../src/inventory.js';
import { connectTrack, planTrack, ports } from '../src/rail-track.js';
import {
  cartPosition,
  Minecarts,
  stepCart,
  validCarts,
} from '../src/minecarts.js';
import { WorldLibrary } from '../src/world-library.js';
import { World } from '../src/world.js';
import {
  validateSave,
  upgradeInventorySave,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
} from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import { newFurnace, tickFurnace } from '../src/furnaces.js';
test('every legal placement gives exactly its intended product and spends one per cell', () => {
  for (const r of RECIPES) {
    const cost = Object.fromEntries(
      Object.entries(
        r.pattern
          .filter(Boolean)
          .reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {}),
      ),
    );
    assert.deepEqual(cost, r.cost, r.id);
    for (const size of r.station ? [7] : [4, 7]) {
      let checked = 0;
      for (const layout of placements(r.pattern, size)) {
        const grid = layout.map((item) => (item ? { item, count: 1 } : null)),
          ms = craftingMatches(grid, size === 7);
        assert.deepEqual(
          ms.map((m) => m.recipe.id),
          [r.id],
          r.id,
        );
        consumeCrafting(grid, ms[0]);
        assert.deepEqual(
          grid
            .filter(Boolean)
            .reduce(
              (a, s) => ((a[s.item] = (a[s.item] || 0) + s.count), a),
              {},
            ),
          r.returns || {},
        );
        checked++;
      }
      assert.ok(checked, r.id);
    }
  }
});
test('portable mixed wood, first pick, stone pick, empty furnace ring and first iron', () => {
  const bag = new PlayerInventory(),
    small = newCraftingGrid(4),
    large = newCraftingGrid(7);
  const make = (id, g) => {
    const i = RECIPES.findIndex((r) => r.id === id);
    assert.ok(fillCraftingRecipe(bag, g, RECIPES[i]).ok, id);
    assert.ok(quickCraft(bag, g, i, g.length === 7, 1).count, id);
  };
  bag.insert('wood', 3);
  make('planks', small);
  make('workbench', small);
  make('planks', small);
  make('planks', small);
  make('stick', small);
  assert.equal(
    fillCraftingRecipe(
      bag,
      small,
      RECIPES.find((r) => r.id === 'pick1'),
    ).ok,
    false,
  );
  make('pick1', large);
  bag.insert('cobbledDeepslate', 3);
  make('pick2', large);
  bag.insert('cobble', 6);
  make('furnace', large);
  const furnace = newFurnace();
  furnace.input = { item: 'rawIron', count: 1 };
  furnace.fuel = { item: 'coal', count: 1 };
  for (let i = 0; i < 400; i++) tickFurnace(furnace, 0.1);
  assert.deepEqual(furnace.output, { item: 'ingot', count: 1 });
  const board = recipeCells(
    RECIPES.find((r) => r.id === 'workbench'),
    4,
  ).map((s, i) => ({
    ...s,
    item: i % 2 ? 'sprucePlanks' : 'birchPlanks',
    count: 3,
  }));
  assert.equal(craftingMatches(board, false)[0].recipe.id, 'workbench');
  consumeCrafting(board, craftingMatches(board, false)[0]);
  assert.ok(board.every((s) => s.count === 2));
});
test('six headings, a connected bend and slope; detector lights a lamp and hopper unloads the cart', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 2);
  const lay = (p, id = 'rail', face = 0) => {
    const pair = planTrack(w, p, id, face);
    w.set(...p, id);
    w.setState(...p, { facing: face, open: false, track: pair });
    connectTrack(w, p, pair);
  };
  for (let i = 0; i < 6; i++) {
    const p = [i * 5, 55, 7];
    assert.deepEqual(
      planTrack(w, p, 'rail', i).sort(),
      [i, (i + 3) % 6].sort(),
    );
  }
  const route = [
    [0, 44, 0],
    [1, 44, 0],
    [2, 44, 0],
    [2, 45, 1],
    [2, 45, 2],
    [2, 45, 3],
  ];
  route.forEach((p, i) =>
    lay(p, i === 4 ? 'detectorRail' : 'rail', i > 2 ? 1 : 0),
  );
  assert.deepEqual(ports(w, route[2]).sort(), [1, 3]);
  const carts = new Minecarts(new THREE.Scene()),
    c = carts.spawn(route[0], 'chestCart', 0, w);
  c.cargo[0] = { item: 'rawIron', count: 3 };
  c.speed = 5;
  stepCart(w, c, 0.09);
  const underway = structuredClone(c),
    position = cartPosition(w, c);
  w.clearLoaded();
  carts.update(1, w, new Set());
  assert.deepEqual(c, underway);
  w.ensureAround(0, 0, 1);
  assert.deepEqual(cartPosition(w, c), position);
  const restored = new Minecarts(new THREE.Scene());
  restored.load([underway]);
  const resumed = restored.records[0];
  stepCart(w, resumed, 0.04);
  stepCart(w, c, 0.04);
  assert.deepEqual(c, resumed);
  assert.equal(c.cargo[0].count, 3);
  w.set(3, 45, 2, 'redstoneLamp');
  let lit = false;
  for (let i = 0; i < 500; i++) {
    carts.update(0.01, w, new Set());
    w.redstone.tick(0.01, [], () => true);
    lit ||= !!w.state(3, 45, 2).powered;
  }
  assert.deepEqual(c.p, route.at(-1));
  assert.ok(lit, 'cart actually lit the adjacent lamp');
  assert.ok(cartPosition(w, c)[1] >= 45);
  w.set(2, 44, 3, 'hopper');
  w.setState(2, 44, 3, { facing: 0, open: false, down: true });
  w.set(2, 43, 3, 'chest');
  w.chests.set(key(2, 43, 3), Array(27).fill(null));
  for (let i = 0; i < 7; i++) w.hoppers.tick(0.41, null, carts);
  assert.equal(w.chests.get(key(2, 43, 3))[0]?.count, 3);
  assert.equal(c.cargo[0], null);
  const save = currentSave(w),
    dim = save.dimensions.overworld;
  dim.carts = structuredClone(carts.records);
  assert.ok(validateSave(save));
  const loaded = new Minecarts(new THREE.Scene());
  loaded.load(dim.carts);
  assert.deepEqual(loaded.records, carts.records);
  assert.equal(validCarts(dim.carts, 'missing'), false);
});

test('v16: return seven slots and cursor once, including full-pack named gear and shulker contents', () => {
  const legacy = currentSave();
  legacy.version = 16;
  const named = {
      item: 'pick2',
      count: 1,
      wear: { value: 24, work: 1, name: '井下', enchant: { efficiency: 1 } },
    },
    box = { item: 'shulkerBox', count: 1, contents: Array(27).fill(null) };
  box.contents[0] = { item: 'coal', count: 9 };
  legacy.inventory.slots = Array.from({ length: 36 }, () => ({
    item: 'stone',
    count: 64,
  }));
  legacy.inventory.slots[4].count = 60;
  legacy.crafting = [
    { item: 'stone', count: 6 },
    named,
    null,
    null,
    null,
    null,
    null,
  ];
  legacy.inventory.cursor = box;
  const before = JSON.stringify(legacy),
    next = upgradeInventorySave(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(next.inventory.slots[4].count, 64);
  assert.deepEqual(next.crafting, {
    kind: 'personal',
    slots: Array(4).fill(null),
  });
  assert.equal(next.inventory.cursor, null);
  const drops = next.dimensions.overworld.drops;
  assert.deepEqual(
    drops.map((d) => d.count),
    [2, 1, 1],
  );
  assert.deepEqual(drops[1].wear.pick2, [named.wear]);
  assert.deepEqual(drops[2].contents, box.contents);
  const store = new Map([[LEGACY_SAVE_KEY, before]]),
    storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      get length() {
        return store.size;
      },
      key: (i) => [...store.keys()][i],
    };
  const lib = new WorldLibrary(storage);
  lib.write(next);
  lib.fresh();
  lib.write({ ...next, creative: true });
  assert.deepEqual(
    lib.entries().map((w) => w.creative),
    [false, true],
  );
  assert.equal(store.get(LEGACY_SAVE_KEY), before);
  assert.notEqual(lib.key, SAVE_KEY);
});
test('powered rails start a stopped cart and brake it after the circuit turns off', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  const p = [0, 47, 0];
  w.set(...p, 'poweredRail');
  w.set(-1, 47, 0, 'lever');
  w.setState(-1, 47, 0, { facing: 0, open: false, powered: true });
  w.redstone.tick(0.1, [], () => true);
  assert.equal(w.state(...p).powered, true);
  const c = {
    kind: 'minecart',
    id: 'test',
    p,
    t: 0.2,
    exit: 1,
    speed: 0,
    cargo: null,
  };
  stepCart(w, c, 0.15);
  assert.ok(c.speed > 0);
  w.setState(-1, 47, 0, { facing: 0, open: false, powered: false });
  w.redstone.tick(0.1, [], () => true);
  assert.equal(w.state(...p).powered, false);
  stepCart(w, c, 0.2);
  assert.equal(c.speed, 0);
});

test('natural mine ruins seed real cargo once and leave player-modified corridors untouched', async () => {
  const { seedMineRails } = await import('../src/rail-mineshaft.js');
  const w = new World(624, 'overworld', { load: false });
  const mine = w.structures(0, 0, 320).find((s) => s.kind === 'mine');
  assert.ok(mine);
  w.ensureAround(mine.q, mine.r, 3);
  const c = new Minecarts(new THREE.Scene());
  const col = mine.mine.paths[0].points[3],
    wall = [col.q, col.floor, col.r];
  w.set(...wall, 'brick');
  const cells = seedMineRails(w, c, mine);
  assert.ok(cells.length >= 3);
  assert.equal(w.get(...wall), 'brick');
  assert.equal(c.records.length, 1);
  assert.ok(c.records[0].cargo.some((s) => s?.item === 'rawIron'));
  assert.deepEqual(seedMineRails(w, c, mine), []);
  w.set(...cells[0], null);
  assert.deepEqual(seedMineRails(w, c, mine), []);
  assert.equal(w.get(...cells[0]), undefined);
});

test('a third arm cannot steal a live connection; lift and relay toward it to select the bend', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  const origin = [0, 45, 0];
  for (const d of [0, 2, 3]) {
    const [q, r] = DIRECTIONS[d];
    w.set(q, 45, r, 'rail');
    w.setState(q, 45, r, { facing: d, open: false, track: [d, (d + 3) % 6] });
  }
  w.set(...origin, 'rail');
  w.setState(...origin, { facing: 0, open: false, track: [0, 3] });
  assert.deepEqual(planTrack(w, origin, 'rail', 2), [0, 3]);
  w.set(...origin, null);
  assert.deepEqual(planTrack(w, origin, 'rail', 2), [0, 2]);
});
