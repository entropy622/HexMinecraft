import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { RECIPES } from '../src/core.js';
import {
  DYES,
  DYE_RECIPES,
  GLASS_TYPES,
  isPigmentPlant,
} from '../src/dye-data.js';
import { PlayerInventory } from '../src/inventory.js';
import {
  fillCraftingRecipe,
  quickCraft,
  newCraftingGrid,
} from '../src/crafting.js';
import { VoxelLight } from '../src/voxel-light.js';
import { DynamicLight } from '../src/dynamic-light.js';
import { Redstone } from '../src/redstone.js';
import { miningLoot } from '../src/mining-loot.js';
import { miningStats } from '../src/mining.js';
import { pigmentSupport } from '../src/pigment-plants.js';
import { newFurnace, tickFurnace, smeltingRecipe } from '../src/furnaces.js';
import { fishingLoot } from '../src/fishing-data.js';
import { ROLES, trade } from '../src/villages.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';

// Input classes were recorded in stained-glass-verification.md before product edits.
function craft(recipe, stock, station = false) {
  const pack = new PlayerInventory(),
    grid = newCraftingGrid();
  for (const [id, n] of Object.entries(stock)) pack.insert(id, n);
  const fill = fillCraftingRecipe(pack, grid, recipe);
  return {
    pack,
    grid,
    fill,
    result: fill.ok
      ? quickCraft(pack, grid, RECIPES.indexOf(recipe), station, 1)
      : null,
  };
}
test('all sixteen dyes convert or mix with real inventory, producing exactly the ingredient count', () => {
  assert.equal(Object.keys(DYES).length, 16);
  for (const recipe of DYE_RECIPES.filter((r) => r.id.endsWith('Dye'))) {
    const c = craft(recipe, recipe.cost);
    assert.equal(c.result.count, recipe.count, recipe.id);
    assert.equal(c.pack.count(recipe.id), recipe.count);
    assert.ok(c.grid.every((s) => !s));
    for (const id of Object.keys(recipe.cost))
      assert.equal(c.pack.count(id), 0);
  }
});
test('all sixteen stained glass recipes pay eight glass and one pigment, require a workbench and reject seven glass', () => {
  for (const color of Object.keys(DYES)) {
    const recipe = RECIPES.find((r) => r.id === color + 'StainedGlass');
    const c = craft(recipe, { glass: 8, [color + 'Dye']: 1 }, true);
    assert.equal(c.result.count, 8);
    assert.equal(c.pack.count(recipe.id), 8);
    assert.equal(c.pack.count('glass') + c.pack.count(color + 'Dye'), 0);
    assert.equal(
      craft(recipe, { glass: 7, [color + 'Dye']: 1 }, true).fill.ok,
      false,
    );
    assert.equal(
      craft(recipe, { glass: 8, [color + 'Dye']: 1 }, false).result.count,
      0,
    );
    assert.equal(
      craft(recipe, { blueStainedGlass: 8, [color + 'Dye']: 1 }, true).fill.ok,
      false,
    );
  }
});
test('a full real pack rejects output without spending the filled glass recipe', () => {
  const recipe = RECIPES.find((r) => r.id === 'redStainedGlass'),
    pack = new PlayerInventory(),
    grid = newCraftingGrid();
  pack.insert('glass', 8);
  pack.insert('redDye', 1);
  assert.equal(fillCraftingRecipe(pack, grid, recipe).ok, true);
  pack.insert('stone', pack.slots.length * 64);
  const before = structuredClone(grid);
  assert.equal(
    quickCraft(pack, grid, RECIPES.indexOf(recipe), true, 1).count,
    0,
  );
  assert.deepEqual(grid, before);
});
test('seventeen actual glass blocks preserve light low bits, remain nonconductive and save their distinct identities', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(-1, -1, 1);
  const positions = GLASS_TYPES.map((type, i) => [
    -4 + (i % 6),
    44,
    -4 + Math.floor(i / 6),
    type,
  ]);
  for (const [q, y, r, type] of positions) w.set(q, y, r, type);
  w.set(-5, 44, -4, 'torch');
  const field = new VoxelLight(w);
  field.update(0, true);
  const lighting = new DynamicLight();
  lighting.upload(field);
  const circuit = new Redstone(w);
  positions.forEach(([q, y, r, type], palette) => {
    const i = field.index(q, y, r),
      p = lighting.data.slice(i * 4, i * 4 + 4);
    assert.equal(field.medium[i], 14);
    assert.equal(field.cost[i], 1);
    for (let c = 0; c < 3; c++) assert.equal(p[c] & 15, field.rgb[c][i], type);
    assert.equal((p[0] >> 4) + ((p[1] >> 4) << 4), palette);
    assert.equal(p[3] >> 4, field.sky[i]);
    assert.equal(circuit.conductive(q, y, r), false);
  });
  const s = currentSave(w);
  assert.ok(validateSave(s));
  const restored = new World(624, 'overworld', {
    ...w.serialize(),
    load: false,
  });
  restored.ensureAround(-1, -1, 1);
  for (const [q, y, r, type] of positions)
    assert.equal(restored.get(q, y, r), type);
  lighting.uniforms.entityLightVolume.value.dispose();
});
test('every glass color has bare-hand breaking and no normal drop, while silk touch retains its exact block', () => {
  for (const type of GLASS_TYPES) {
    assert.equal(miningStats(type, null).kind, null);
    assert.deepEqual(miningLoot(type).stacks, []);
    assert.deepEqual(miningLoot(type, { enchant: { silkTouch: 1 } }).stacks, [
      { item: type, count: 1 },
    ]);
  }
});
test('actual plant support checks sand, stacked cactus, six blocked sides and flower soil', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++)
      for (let y = 40; y <= 44; y++) w.set(q, y, r, null);
  w.set(0, 40, 0, 'sand');
  assert.equal(pigmentSupport(w, 'cactus', 0, 41, 0), true);
  w.set(1, 41, 0, 'stone');
  assert.equal(pigmentSupport(w, 'cactus', 0, 41, 0), false);
  w.set(1, 41, 0, null);
  w.set(0, 41, 0, 'cactus');
  assert.equal(pigmentSupport(w, 'cactus', 0, 42, 0), true);
  assert.equal(pigmentSupport(w, 'poppy', 0, 41, 0), false);
  w.set(0, 40, 0, 'grass');
  assert.equal(pigmentSupport(w, 'poppy', 0, 41, 0), true);
  w.set(0, 40, 0, 'stone');
  assert.equal(pigmentSupport(w, 'dandelion', 0, 41, 0), false);
});
test('natural flowers and desert cactus are chunk-order independent and mined edits survive regeneration', () => {
  const chunks = [-12, -6, 0, 6, 12].flatMap((q) =>
    [-12, -6, 0, 6, 12].map((r) => [q, r]),
  );
  for (const [q, r] of [
    [-12, -12],
    [-1, -1],
    [12, 12],
  ])
    for (const [dq, dr] of [
      [0, 1],
      [1, 0],
      [1, 1],
    ])
      if (!chunks.some(([a, b]) => a === q + dq && b === r + dr))
        chunks.push([q + dq, r + dr]);
  const a = new World(624, 'overworld', { load: false }),
    b = new World(624, 'overworld', { load: false });
  for (const c of chunks) a.generateChunk(...c);
  for (const c of [...chunks].reverse()) b.generateChunk(...c);
  const plants = (w) =>
    [...w.blocks]
      .filter(([, t]) => isPigmentPlant(t))
      .sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(plants(a), plants(b));
  for (const type of ['poppy', 'dandelion', 'cactus'])
    assert.ok(
      plants(a).some(([, t]) => t === type),
      type,
    );
  const [k] = plants(a)[0],
    p = k.split(',').map(Number),
    cq = Math.floor(p[0] / 8),
    cr = Math.floor(p[2] / 8);
  a.set(...p, null);
  a.unloadChunk(cq, cr);
  a.generateChunk(cq, cr);
  assert.equal(a.get(...p), undefined);
});
test('real furnaces, fishing stacks and farmer trades supply the remaining pigments without item loss', () => {
  const f = newFurnace();
  f.input = { item: 'cactus', count: 2 };
  f.fuel = { item: 'coal', count: 1 };
  tickFurnace(f, 10);
  tickFurnace(f, 10);
  assert.deepEqual(f.output, { item: 'greenDye', count: 2 });
  assert.equal(f.xp, 2);
  assert.equal(f.input, null);
  assert.equal(smeltingRecipe('cactus', 'smoker'), null);
  assert.deepEqual(
    fishingLoot({ open: true }, () => 0.995),
    { item: 'inkSac', count: 10, category: '杂物' },
  );
  const w = new World(624, 'overworld', { load: false }),
    inventory = { emerald: 1 };
  const index = ROLES.farmer.trades.findIndex((t) => t.give.cocoaBeans);
  assert.equal(
    trade(
      w,
      { role: 'farmer', village: { id: 'test-farm' } },
      index,
      inventory,
      120,
    ),
    true,
  );
  assert.deepEqual(inventory, { emerald: 0, cocoaBeans: 3 });
  const recipe = DYE_RECIPES.find((r) => r.id === 'brownDye');
  assert.equal(craft(recipe, { cocoaBeans: 1 }).pack.count('brownDye'), 1);
});

test('the real piston scheduler moves every glass identity and its next light-volume palette follows the moved block', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 0);
  w.set(2, 44, 2, 'piston');
  w.setState(2, 44, 2, { facing: 0 });
  w.set(2, 43, 3, 'stone');
  w.set(2, 44, 3, 'lever');
  const field = new VoxelLight(w),
    lighting = new DynamicLight();
  for (const type of GLASS_TYPES) {
    w.set(3, 44, 2, type);
    w.set(4, 44, 2, null);
    w.setState(2, 44, 3, { powered: true });
    w.redstone.tick(0);
    w.redstone.tick(0.12);
    assert.equal(w.get(3, 44, 2), 'pistonHead');
    assert.equal(w.get(4, 44, 2), type);
    assert.equal(field.update(0.3), true);
    lighting.upload(field);
    const i = field.index(4, 44, 2),
      bytes = lighting.data;
    assert.equal(
      (bytes[i * 4] >> 4) + ((bytes[i * 4 + 1] >> 4) << 4),
      GLASS_TYPES.indexOf(type),
    );
    w.setState(2, 44, 3, { powered: false });
    w.redstone.tick(0);
    w.redstone.tick(0.12);
    assert.equal(w.get(3, 44, 2), undefined);
  }
  lighting.uniforms.entityLightVolume.value.dispose();
});
