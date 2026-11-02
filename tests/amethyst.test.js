import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { BLOCKS, RECIPES, canCraft } from '../src/core.js';
import { AMETHYST_STAGES } from '../src/amethyst-data.js';
import { amethystOffset, geodeBlock } from '../src/geodes.js';
import {
  growAmethyst,
  tickAmethyst,
  amethystSupport,
} from '../src/amethyst.js';
import { miningLoot } from '../src/mining-loot.js';
import { miningStats } from '../src/mining.js';
import { VoxelLight } from '../src/voxel-light.js';
import { blockLight } from '../src/light-data.js';
import { actuatePiston } from '../src/pistons.js';
import { buildingParts } from '../src/building-shapes.js';
import { stackSize } from '../src/inventory.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';

test('natural geodes keep layered cavities, real budding attachments and chunk-order stability', () => {
  const make = () => new World(624, 'overworld', { load: false }),
    world = make(),
    geode = world.geodes(0, 0, 180).find((g) => g.q < 0 && g.r < 0);
  assert.ok(geode);
  const chunks = [];
  for (
    let q = Math.floor((geode.q - 9) / 8);
    q <= Math.floor((geode.q + 9) / 8);
    q++
  )
    for (
      let r = Math.floor((geode.r - 9) / 8);
      r <= Math.floor((geode.r + 9) / 8);
      r++
    )
      chunks.push([q, r]);
  for (const chunk of chunks) world.generateChunk(...chunk);
  const reverse = make();
  for (const chunk of chunks.toReversed()) reverse.generateChunk(...chunk);
  const sample = (w) =>
    [...w.blocks]
      .filter(([k]) => {
        const [q, y, r] = k.split(',').map(Number);
        return geodeBlock(w, geode, q, y, r) !== undefined;
      })
      .sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(sample(world), sample(reverse));
  const types = sample(world).map(([, type]) => type);
  for (const type of [
    'smoothBasalt',
    'calcite',
    'amethystBlock',
    'buddingAmethyst',
  ])
    assert.ok(types.includes(type));
  assert.equal(world.get(geode.q, geode.y, geode.r), undefined);
  assert.ok(world.amethystCells.size > 0);
  for (const k of world.amethystCells) {
    const [q, y, r] = k.split(',').map(Number),
      face = world.state(q, y, r).facing,
      [a, b, c] = amethystOffset(face);
    assert.equal(world.get(q - a, y - b, r - c), 'buddingAmethyst');
    assert.equal(reverse.state(q, y, r).facing, face);
  }
  const [edited] = sample(world).find(([, t]) => t === 'buddingAmethyst'),
    point = edited.split(',').map(Number),
    cq = Math.floor(point[0] / 8),
    cr = Math.floor(point[2] / 8);
  world.set(...point, 'planks');
  world.unloadChunk(cq, cr);
  world.generateChunk(cq, cr);
  assert.equal(world.get(...point), 'planks');
  assert.equal(
    new World(624, 'nether', { load: false }).geodes(0, 0, 300).length,
    0,
  );
  assert.equal(
    new World(624, 'end', { load: false }).geodes(0, 0, 300).length,
    0,
  );
});

test('budding grows through four oriented stages, preserves water and persists through strict v16 reload', () => {
  const w = new World(624, 'overworld', { load: false });
  w.generateChunk(0, 0);
  w.set(3, 50, 3, 'buddingAmethyst');
  for (let face = 0; face < 8; face++) {
    const [a, b, c] = amethystOffset(face),
      target = [3 + a, 50 + b, 3 + c];
    w.set(...target, null);
    if (face === 6)
      w.fluids.write(...target, {
        type: 'water',
        source: true,
        level: 0,
        falling: false,
      });
    for (const stage of AMETHYST_STAGES) {
      assert.ok(growAmethyst(w, 3, 50, 3, face));
      assert.equal(w.get(...target), stage);
      assert.equal(w.state(...target).facing, face);
      assert.equal(amethystSupport(w, ...target, face), true);
      assert.ok(buildingParts(w, ...target).length > 0);
    }
    assert.equal(growAmethyst(w, 3, 50, 3, face), null);
  }
  assert.equal(w.fluids.get(3, 51, 3).type, 'water');
  const save = currentSave(w);
  validateSave(save);
  const restored = new World(624, 'overworld', {
    ...save.dimensions.overworld,
    load: false,
  });
  restored.generateChunk(0, 0);
  assert.equal(restored.get(3, 51, 3), 'amethystCluster');
  assert.equal(restored.state(3, 51, 3).facing, 6);
  assert.equal(restored.fluids.get(3, 51, 3).type, 'water');
  w.set(3, 50, 3, null);
  const fallen = tickAmethyst(w, 0);
  assert.equal(fallen.changed.length, 8);
  assert.equal(
    fallen.drops.reduce((s, item) => s + item.count, 0),
    16,
  );
});

test('clusters distinguish hand, pickaxe, Fortune and Silk Touch while budding is destroyed by pistons', () => {
  const loot = (type, options) => miningLoot(type, options).stacks;
  assert.deepEqual(loot('amethystCluster'), [
    { item: 'amethystShard', count: 2 },
  ]);
  assert.deepEqual(loot('amethystCluster', { tool: 'pick' }), [
    { item: 'amethystShard', count: 4 },
  ]);
  assert.deepEqual(
    loot('amethystCluster', {
      tool: 'pick',
      enchant: { fortune: 3 },
      random: () => 0.999,
    }),
    [{ item: 'amethystShard', count: 16 }],
  );
  for (const stage of AMETHYST_STAGES)
    assert.deepEqual(loot(stage, { enchant: { silkTouch: 1 } }), [
      { item: stage, count: 1 },
    ]);
  for (const stage of AMETHYST_STAGES.slice(0, 3))
    assert.deepEqual(loot(stage), []);
  assert.deepEqual(
    loot('buddingAmethyst', { tool: 'pick', enchant: { silkTouch: 1 } }),
    [],
  );
  assert.deepEqual(loot('tintedGlass'), [{ item: 'tintedGlass', count: 1 }]);
  assert.equal(miningStats('amethystBlock', null).harvest, false);
  assert.equal(miningStats('amethystCluster', null).harvest, true);
  const w = new World(624, 'overworld', { load: false });
  w.generateChunk(0, 0);
  w.set(3, 50, 3, 'piston');
  w.setState(3, 50, 3, { facing: 0, open: false });
  w.set(4, 50, 3, 'buddingAmethyst');
  const result = actuatePiston(w, 3, 50, 3, true);
  assert.ok(result);
  assert.notEqual(w.get(4, 50, 3), 'buddingAmethyst');
  assert.notEqual(w.get(5, 50, 3), 'buddingAmethyst');
  assert.equal(result.broken.length, 0);
});

test('tinted glass transmits the view but blocks skylight without consuming an RGB glass palette entry', () => {
  const w = new World(624, 'overworld', { load: false });
  for (let q = 0; q < 2; q++) for (let r = 0; r < 2; r++) w.generateChunk(q, r);
  for (let q = 5; q <= 9; q++)
    for (let r = 5; r <= 9; r++)
      for (let y = 49; y <= 54; y++)
        w.set(
          q,
          y,
          r,
          y === 49 || q === 5 || q === 9 || r === 5 || r === 9
            ? 'stone'
            : y === 54
              ? 'glass'
              : null,
        );
  const field = new VoxelLight(w);
  field.update(0, true);
  assert.ok(field.sky[field.index(7, 52, 7)] > 0);
  for (let q = 6; q < 9; q++)
    for (let r = 6; r < 9; r++) w.set(q, 54, r, 'tintedGlass');
  field.update(0, true);
  assert.equal(field.sky[field.index(7, 52, 7)], 0);
  assert.equal(blockLight(w, 7, 54, 7) & 31, 16);
  assert.equal((blockLight(w, 7, 54, 7) >>> 5) & 15, 0);
  assert.ok(BLOCKS.tintedGlass.opacity > 0 && BLOCKS.tintedGlass.opacity < 1);
});

test('amethyst recipes keep their actual costs and spyglasses occupy one inventory slot each', () => {
  const inventory = { amethystShard: 4, glass: 1, copperIngot: 2 };
  const recipes = new Map(
    RECIPES.filter((r) =>
      ['amethystBlock', 'tintedGlass', 'spyglass'].includes(r.id),
    ).map((r) => [r.id, r]),
  );
  assert.deepEqual(recipes.get('spyglass').cost, {
    amethystShard: 1,
    copperIngot: 2,
  });
  assert.equal(recipes.get('tintedGlass').count, 2);
  for (const recipe of recipes.values())
    assert.ok(canCraft(recipe, inventory, 4, true));
  assert.equal(canCraft(recipes.get('spyglass'), inventory, 4, false), false);
  assert.equal(stackSize('spyglass'), 1);
  assert.equal(stackSize('amethystShard'), 64);
});

test('attachments use real complete cut faces while partial or unloaded support is not invented', () => {
  const w = new World(624, 'overworld', { load: false });
  w.generateChunk(0, 0);
  w.set(3, 49, 3, 'planksSlab');
  assert.equal(amethystSupport(w, 3, 50, 3, 6), false);
  w.setState(3, 49, 3, { facing: 0, open: false, upper: true });
  assert.equal(amethystSupport(w, 3, 50, 3, 6), true);
  w.set(3, 49, 3, 'planksStairs');
  w.setState(3, 49, 3, { facing: 0, open: false, upper: true });
  assert.equal(amethystSupport(w, 3, 50, 3, 6), true);
  w.setState(3, 49, 3, { facing: 0, open: false, upper: false });
  assert.equal(amethystSupport(w, 3, 50, 3, 6), false);
  w.set(3, 49, 3, 'fence');
  assert.equal(amethystSupport(w, 3, 50, 3, 6), false);
  assert.equal(amethystSupport(w, 8, 50, 3, 3), null);
});
