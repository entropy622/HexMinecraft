import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { BLOCKS, RECIPES, axialToWorld } from '../src/core.js';
import { DYES } from '../src/dye-data.js';
import {
  WOOL_TYPES,
  woolItem,
  naturalSheepColor,
  offspringColor,
} from '../src/wool-data.js';
import { Fauna, validFauna } from '../src/fauna.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  newCraftingGrid,
  fillCraftingRecipe,
  quickCraft,
  craftingMatches,
} from '../src/crafting.js';
import { miningLoot } from '../src/mining-loot.js';
import { miningStats } from '../src/mining.js';
import { VoxelLight } from '../src/voxel-light.js';
import { Redstone } from '../src/redstone.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';

// Failure classes were listed before product edits in sheep-wool-verification.md.
function craft(recipe, stock) {
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  for (const [id, n] of Object.entries(stock)) pack.insert(id, n);
  const fill = fillCraftingRecipe(pack, grid, recipe);
  return {
    pack,
    grid,
    fill,
    result: fill.ok
      ? quickCraft(pack, grid, RECIPES.indexOf(recipe), false, 1)
      : null,
  };
}
function animals() {
  const world = new World(624, 'overworld', { load: false });
  world.ensureAround(0, 0, 0);
  const drops = [],
    f = new Fauna(new THREE.Scene(), null, {
      drop: (id, count) => drops.push({ id, count }),
      moveBlock: (q, y, r, type) => {
        world.set(q, y, r, type);
        return true;
      },
    });
  f.load(world);
  return { world, f, drops };
}
test('all sixteen wool colors are crafted from every actual wool input with exactly one dye and one block', () => {
  assert.equal(WOOL_TYPES.length, 16);
  for (const color of Object.keys(DYES)) {
    const recipe = RECIPES.find(
      (r) => r.id === woolItem(color) && r.cost[color + 'Dye'],
    );
    for (const input of WOOL_TYPES) {
      const c = craft(recipe, { [input]: 1, [color + 'Dye']: 1 });
      assert.equal(c.result.count, 1, input + ' to ' + color);
      assert.equal(c.pack.count(woolItem(color)), 1);
      assert.equal(c.pack.count(color + 'Dye'), 0);
      assert.ok(c.grid.every((s) => !s));
      if (input !== woolItem(color)) assert.equal(c.pack.count(input), 0);
    }
  }
  const woven = craft(
    RECIPES.find((r) => r.id === 'wool' && r.cost.string),
    { string: 4 },
  );
  assert.equal(woven.pack.count('wool'), 1);
  assert.equal(woven.pack.count('string'), 0);
});
test('wool crafting rejects missing or false materials and a full pack preserves its escrow; old bed and string inputs stay white', () => {
  const recipe = RECIPES.find((r) => r.id === 'blueWool');
  for (const stock of [
    { redWool: 1 },
    { blueDye: 1 },
    { stone: 1, blueDye: 1 },
  ])
    assert.equal(craft(recipe, stock).fill.ok, false);
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  pack.insert('redWool', 1);
  pack.insert('blueDye', 1);
  assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
  pack.insert('stone', pack.slots.length * 64);
  const before = structuredClone(grid);
  assert.equal(quickCraft(pack, grid, RECIPES.indexOf(recipe), false).count, 0);
  assert.deepEqual(grid, before);
  assert.equal(
    craft(
      RECIPES.find((r) => r.id === 'bed'),
      { redWool: 3, planks: 3 },
    ).fill.ok,
    false,
  );
  const colored = newCraftingGrid();
  colored[0] = { item: 'redWool', count: 1 };
  assert.equal(craftingMatches(colored).length, 0);
  const colors = new PlayerInventory();
  colors.insert('redWool', 63);
  colors.insert('blueWool', 2);
  colors.insert('redWool', 2);
  assert.equal(colors.count('redWool'), 65);
  assert.equal(colors.count('blueWool'), 2);
});
test('sixteen wool blocks collide, block light, conduct redstone and retain their exact normal drops and saved identity', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(-1, -1, 1);
  const positions = WOOL_TYPES.map((id, i) => [
    -4 + (i % 4),
    44,
    -4 + Math.floor(i / 4),
    id,
  ]);
  for (const [q, y, r, id] of positions) w.set(q, y, r, id);
  const field = new VoxelLight(w);
  field.update(0, true);
  const redstone = new Redstone(w);
  for (const [q, y, r, id] of positions) {
    assert.equal(w.solid(q, y, r), true);
    assert.equal(field.cost[field.index(q, y, r)], 16);
    assert.equal(redstone.conductive(q, y, r), true);
    assert.deepEqual(miningLoot(id).stacks, [{ item: id, count: 1 }]);
    assert.equal(miningStats(id, null).harvest, true);
    assert.equal(
      miningStats(id, 'shears').speed / miningStats(id, null).speed,
      5,
    );
    assert.ok(
      Math.abs(
        (BLOCKS[id].hardness * 1.5) / miningStats(id, 'shears').speed - 0.24,
      ) < 1e-6,
    );
  }
  const s = currentSave(w);
  assert.ok(validateSave(s));
  const restored = new World(624, 'overworld', {
    ...w.serialize(),
    load: false,
  });
  restored.ensureAround(-1, -1, 1);
  for (const [q, y, r, id] of positions)
    assert.equal(restored.get(q, y, r), id);
});
test('real sheep interactions dye all colors, shear three matching wool, reject repeat dye and keep sheared or baby deaths from duplicating wool', () => {
  const { f, drops } = animals(),
    sheep = f.spawn('sheep', [0, 40, 0]);
  assert.equal(f.interact(sheep, 'blueDye').consume, 'blueDye');
  for (const color of Object.keys(DYES)) {
    assert.equal(f.interact(sheep, color + 'Dye').consume, color + 'Dye');
    assert.equal(sheep.color, color);
    assert.equal(f.interact(sheep, color + 'Dye').consume, undefined);
  }
  assert.deepEqual(f.interact(sheep, 'shears').give, { blackWool: 3 });
  assert.equal(f.interact(sheep, 'shears').wear, undefined);
  assert.equal(f.interact(sheep, 'redDye').consume, undefined);
  assert.equal(sheep.color, 'black');
  f.hit(sheep, 100, null, true, false, 0, false);
  assert.ok(!drops.some((d) => WOOL_TYPES.includes(d.id)));
  const unshorn = f.spawn('sheep', [0, 40, 0]);
  f.interact(unshorn, 'redDye');
  f.hit(unshorn, 100, null, true, false, 0, false);
  assert.equal(
    drops.filter((d) => d.id === 'redWool').reduce((n, d) => n + d.count, 0),
    1,
  );
  const baby = f.spawn('sheep', [0, 40, 0], 180);
  assert.equal(f.interact(baby, 'blueDye').consume, 'blueDye');
  assert.equal(f.interact(baby, 'shears').give, undefined);
  const before = drops.length;
  f.hit(baby, 100, null, true, false, 0, false);
  assert.equal(drops.length, before);
  const cow = f.spawn('cow', [0, 40, 0]);
  assert.equal(f.interact(cow, 'redDye').consume, undefined);
  assert.equal(cow.color, undefined);
});
test('parent colors use the existing nine dye combinations symmetrically and otherwise inherit only an actual parent', () => {
  for (const [a, b, child] of [
    ['red', 'yellow', 'orange'],
    ['red', 'white', 'pink'],
    ['red', 'blue', 'purple'],
    ['blue', 'white', 'lightBlue'],
    ['green', 'white', 'lime'],
    ['blue', 'green', 'cyan'],
    ['black', 'white', 'gray'],
    ['gray', 'white', 'lightGray'],
    ['purple', 'pink', 'magenta'],
  ]) {
    assert.equal(offspringColor(a, b, 0.1), child);
    assert.equal(offspringColor(b, a, 0.9), child);
  }
  for (const color of Object.keys(DYES))
    assert.equal(offspringColor(color, color, 0.9), color);
  assert.equal(offspringColor('blue', 'yellow', 0), 'blue');
  assert.equal(offspringColor('blue', 'yellow', 0.49999), 'blue');
  assert.equal(offspringColor('blue', 'yellow', 0.5), 'yellow');
  assert.equal(offspringColor('blue', 'yellow', 1), 'yellow');
});
test('natural sheep populations follow the actual temperate, cold and warm color weights including rare pink', () => {
  for (const [biome, expected] of [
    [
      '青翠平原',
      {
        white: 81836,
        black: 5000,
        lightGray: 5000,
        gray: 5000,
        brown: 3000,
        pink: 164,
      },
    ],
    [
      '雪原',
      {
        black: 81836,
        lightGray: 5000,
        gray: 5000,
        white: 5000,
        brown: 3000,
        pink: 164,
      },
    ],
    [
      '沙漠',
      {
        brown: 81836,
        gray: 5000,
        lightGray: 5000,
        white: 5000,
        black: 3000,
        pink: 164,
      },
    ],
  ]) {
    const counts = {};
    for (let i = 0; i < 100000; i++) {
      const color = naturalSheepColor(biome, (i + 0.5) / 100000);
      counts[color] = (counts[color] || 0) + 1;
    }
    assert.deepEqual(counts, expected);
    assert.equal(naturalSheepColor(biome, 1), 'pink');
  }
});
test('native fauna and complete save validation preserve sheep color and reject malformed colors while accepting existing colorless v16 sheep', () => {
  const { f, world } = animals(),
    sheep = f.spawn('sheep', [0, 40, 0]);
  f.interact(sheep, 'redDye');
  f.interact(sheep, 'shears');
  const fauna = f.serialize();
  assert.equal(fauna.mobs[0].color, 'red');
  assert.equal(fauna.mobs[0].wool, 120);
  const saved = currentSave(world);
  saved.dimensions.overworld.fauna = fauna;
  assert.ok(validateSave(saved));
  const absent = structuredClone(fauna);
  delete absent.mobs[0].color;
  assert.equal(validFauna(absent), true);
  for (const color of Object.keys(DYES)) {
    const s = structuredClone(fauna);
    s.mobs[0].color = color;
    assert.equal(validFauna(s), true);
  }
  for (const color of [
    '',
    'constructor',
    '__proto__',
    'rainbow',
    null,
    1,
    [],
    ['red'],
    {},
  ]) {
    const s = structuredClone(fauna);
    s.mobs[0].color = color;
    assert.equal(validFauna(s), false, JSON.stringify(color));
    const complete = structuredClone(saved);
    complete.dimensions.overworld.fauna = s;
    assert.throws(() => validateSave(complete));
  }
  const cow = structuredClone(fauna);
  cow.mobs[0].kind = 'cow';
  assert.equal(validFauna(cow), false);
});

test('two real grazing sheep cannot both regenerate from the same consumed grass block', () => {
  const { f, world } = animals(),
    p = axialToWorld(1, 1);
  for (let q = 0; q <= 3; q++)
    for (let r = 0; r <= 3; r++) {
      world.set(q, 39, r, 'stone');
      for (let y = 40; y <= 43; y++) world.set(q, y, r, null);
    }
  world.set(1, 39, 1, 'grass');
  const a = f.spawn('sheep', [p.x, 40, p.z]),
    b = f.spawn('sheep', [p.x + 0.1, 40, p.z]);
  f.interact(a, 'blueDye');
  f.interact(b, 'redDye');
  f.interact(a, 'shears');
  f.interact(b, 'shears');
  const saved = f.serialize();
  for (const sheep of saved.mobs) sheep.wool = 0.01;
  f.load(world, saved);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(p.x - 3, 41.65, p.z);
  f.update(0.02, 120, camera, null, true);
  const grown = f.serialize().mobs.filter((m) => m.kind === 'sheep');
  assert.equal(world.get(1, 39, 1), 'dirt');
  assert.equal(grown.filter((m) => m.wool === 0).length, 1);
  assert.equal(grown.filter((m) => m.wool > 0).length, 1);
  assert.deepEqual(grown.map((m) => m.color).sort(), ['blue', 'red']);
  f.update(0.5, 120.5, camera, null, true);
  assert.equal(
    f.serialize().mobs.filter((m) => m.kind === 'sheep' && m.wool === 0).length,
    1,
  );
});
