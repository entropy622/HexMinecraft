import test from 'node:test';
import assert from 'node:assert/strict';
import { World, DIMENSIONS, chunkKey } from '../src/world.js';
import { World as LegacyWorld, HOTBAR, RECIPES } from '../src/core.js';
import { validateSave, migrateSave } from '../src/save.js';

test('streamed generation is deterministic across chunk order and negative seams', () => {
  for (const dimension of Object.keys(DIMENSIONS)) {
    const a = new World(624, dimension, { load: false }),
      b = new World(624, dimension, { load: false });
    for (const [q, r] of [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, -1],
    ])
      a.generateChunk(q, r);
    for (const [q, r] of [
      [0, -1],
      [1, 0],
      [0, 0],
      [-1, 0],
    ])
      b.generateChunk(q, r);
    assert.deepEqual(a.blocks, b.blocks);
    assert.equal(chunkKey(-1, -9), '-1,-2');
  }
});
test('all dimensions generate far beyond the old world boundary with bounded resident chunks', () => {
  for (const dimension of Object.keys(DIMENSIONS)) {
    const w = new World(129, dimension, { load: false });
    for (const [q, r] of [
      [0, 0],
      [80, -90],
      [-1024, 330],
      [5000, -7000],
      [200000, -50000],
    ]) {
      w.ensureAround(q, r);
      assert.equal(w.chunks.size, 81);
      assert.equal(w.heights.size, 81 * 64);
      assert.ok(w.blocks.size < 81 * 64 * 64);
      assert.ok(w.loaded(q, r));
      if (dimension !== 'end') assert.equal(w.get(q, 0, r), 'bedrock');
    }
    assert.equal(w.loaded(0, 0), false);
  }
});
test('unloading and regenerating preserves mined and placed blocks and isolated dimension edits', () => {
  const w = new World(50, 'overworld', { load: false });
  w.ensureAround(-905, 507, 1);
  w.set(-905, 2, 507, null);
  w.set(-904, 40, 507, 'glass');
  const edits = [...w.edits];
  w.ensureAround(8000, 8000, 1);
  assert.equal(w.get(-904, 40, 507), undefined);
  w.ensureAround(-905, 507, 1);
  assert.equal(w.get(-905, 2, 507), undefined);
  assert.equal(w.get(-904, 40, 507), 'glass');
  const restored = new World(50, 'overworld', { load: false, edits });
  restored.ensureAround(-905, 507, 1);
  assert.deepEqual(restored.blocks, w.blocks);
  const nether = new World(50, 'nether', { load: false });
  nether.ensureAround(-905, 507, 1);
  assert.notEqual(nether.get(-904, 40, 507), 'glass');
});
test('dimensions have distinct terrain, materials, liquids and void islands', () => {
  const dimensions = Object.keys(DIMENSIONS).map((id) => new World(624, id));
  assert.ok([...dimensions[0].blocks.values()].includes('grass'));
  assert.ok([...dimensions[1].blocks.values()].includes('netherrack'));
  assert.ok([...dimensions[1].blocks.values()].includes('glowstone'));
  assert.ok([...dimensions[2].blocks.values()].includes('endstone'));
  assert.ok([...dimensions[2].heights.values()].some((h) => h === 0));
  assert.equal(DIMENSIONS.end.liquid, null);
  assert.deepEqual(RECIPES.find((r) => r.id === 'portal').cost, {
    obsidian: 6,
    crystal: 1,
  });
  assert.deepEqual(RECIPES.find((r) => r.id === 'endportal').cost, {
    pearl: 3,
    ember: 3,
    crystal: 1,
  });
});
const oldSave = () => ({
  version: 1,
  seed: 624,
  edits: [['0,10,0', 'brick']],
  inventory: { wood: 7 },
  tool: 1,
  creative: false,
  position: [0, 13, 0],
  activated: [],
  health: 18,
  hunger: 16,
  time: 204,
  hotbar: [...HOTBAR],
  crops: [],
  chests: [],
  respawn: null,
});
test('legacy saves migrate without losing the original terrain or player edits', () => {
  const old = oldSave(),
    converted = validateSave(old);
  assert.equal(converted.version, 2);
  assert.equal(converted.dimension, 'overworld');
  assert.equal(converted.inventory.wood, 7);
  const d = converted.dimensions.overworld,
    w = new World(converted.seed, 'overworld', { ...d, load: false }),
    legacy = new LegacyWorld(converted.seed);
  legacy.applyEdits(old.edits);
  w.ensureAround(0, 0, 1);
  for (let q = -7; q <= 7; q++)
    for (let r = -7; r <= 7; r++)
      for (let y = 0; y < 32; y++)
        assert.equal(w.get(q, y, r), legacy.get(q, y, r));
  w.ensureAround(1000, 1000, 1);
  assert.ok(w.blocks.size > 0);
  assert.equal(migrateSave(converted), converted);
});
test('version two validation accepts distant saves and rejects malformed dimensions', () => {
  const valid = validateSave(oldSave());
  valid.position = [900000, 22, -500000];
  valid.dimensions.overworld.edits.push(['600000,50,-800000', 'glass']);
  assert.equal(validateSave(valid), valid);
  for (const patch of [
    { dimension: 'fake' },
    { position: [Infinity, 10, 0] },
    { tool: 5 },
    { inventory: { constructor: 3 } },
    { health: 40 },
    {
      dimensions: {
        overworld: { edits: [['--1,2,3', 'stone']], crops: [], chests: [] },
      },
    },
    {
      dimensions: {
        overworld: { edits: [], crops: [['0,99,0', 10]], chests: [] },
      },
    },
  ])
    assert.throws(() => validateSave({ ...valid, ...patch }));
});
