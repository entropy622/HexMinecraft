import test from 'node:test';
import assert from 'node:assert/strict';
import { World, chunkKey } from '../src/world.js';
import { axialToWorld, key } from '../src/core.js';
import { granular } from '../src/ignition-data.js';

const callbacks = { canPlace: () => true, drop: () => {} };

function naturalShelf() {
  const world = new World(624, 'overworld', { load: false });
  world.ensureAround(-120, 4, 3);
  for (const [k, type] of world.blocks) {
    if (!granular(type)) continue;
    const cell = k.split(',').map(Number),
      [q, y, r] = cell,
      p = axialToWorld(q, r),
      support = world.groundAt(p.x, p.z, y - 1, y);
    if (y > 2 && (support === null || support < y - 0.01))
      return { world, cell, type };
  }
  assert.fail('seed 624 no longer has a natural unsupported shelf');
}

test('natural sand and gravel wait for a neighboring block update before falling', () => {
  const { world, cell, type } = naturalShelf(),
    before = new Map(world.blocks),
    [q, y, r] = cell;
  assert.equal(world.gravity.pending.size, 0);
  for (let n = 0; n < 40; n++) world.gravity.tick(0.05, callbacks);
  assert.deepEqual(world.blocks, before);
  assert.equal(world.gravity.active.length, 0);
  world.set(q + 1, y, r, 'torch');
  assert.ok(world.gravity.pending.has(key(...cell)));
  world.gravity.tick(0.05, callbacks);
  assert.equal(world.get(...cell), undefined);
  assert.ok(
    world.gravity.active.some((b) => b.q === q && b.r === r && b.type === type),
  );
});

test('placed columns and natural adjacent shelves cascade without waiting for another player action', () => {
  const world = new World(624, 'overworld', { load: false });
  world.ensureAround(0, 0, 1);
  for (const q of [2, 3])
    for (let y = 40; y <= 42; y++) world.set(q, y, 2, 'gravel', false);
  assert.equal(world.gravity.pending.size, 0);
  world.set(1, 40, 2, 'torch');
  for (let n = 0; n < 12; n++) world.gravity.tick(0.05, callbacks);
  for (const q of [2, 3])
    for (let y = 40; y <= 42; y++) assert.equal(world.get(q, y, 2), undefined);
  assert.equal(
    world.gravity.active.filter((b) => b.type === 'gravel').length,
    6,
  );
  world.set(4, 45, 2, 'sand');
  world.gravity.tick(0.05, callbacks);
  assert.equal(world.get(4, 45, 2), undefined);
  assert.ok(world.gravity.active.some((b) => b.type === 'sand' && b.q === 4));
});

test('unprocessed neighbor edits replay on chunk return and falling entities survive native world snapshots', () => {
  const { world, cell, type } = naturalShelf(),
    [q, y, r] = cell,
    chunk = chunkKey(q, r).split(',').map(Number);
  world.set(q + 1, y, r, 'torch');
  world.unloadChunk(...chunk);
  world.gravity.tick(1, callbacks);
  world.generateChunk(...chunk);
  assert.ok(world.gravity.pending.has(key(...cell)));
  world.gravity.tick(0.05, callbacks);
  const moving = world.gravity.active.find(
    (b) => b.q === q && b.r === r && b.type === type,
  );
  assert.ok(moving);
  const copy = new World(world.seed, world.dimension, {
    ...world.serialize(),
    load: false,
  });
  copy.generateChunk(...chunk);
  assert.ok(
    copy.gravity.active.some((b) => b.q === q && b.r === r && b.type === type),
  );
  assert.equal(copy.get(...cell), undefined);
  for (let n = 0; n < 100; n++) copy.gravity.tick(0.05, callbacks);
  assert.equal(
    copy.gravity.active.some((b) => b.q === q && b.r === r && b.type === type),
    false,
  );
});

test('a saved state update also wakes a natural shelf after an unprocessed unload', () => {
  const { world, cell } = naturalShelf(),
    chunk = chunkKey(cell[0], cell[2]).split(',').map(Number);
  world.setState(...cell, { facing: 1, open: false });
  assert.equal(world.edits.has(key(...cell)), false);
  world.unloadChunk(...chunk);
  world.gravity.tick(1, callbacks);
  const copy = new World(world.seed, world.dimension, {
    ...world.serialize(),
    load: false,
  });
  copy.generateChunk(...chunk);
  assert.ok(copy.gravity.pending.has(key(...cell)));
  copy.gravity.tick(0.05, callbacks);
  assert.equal(copy.get(...cell), undefined);
});
