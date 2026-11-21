import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { NearStream } from '../src/near-stream.js';
import { opticalPacket } from '../src/light-stream.js';
import { VoxelLight } from '../src/voxel-light.js';
import { DynamicLight } from '../src/dynamic-light.js';

async function workerModule(path) {
  let result;
  const worker = {
    postMessage(data) {
      result = structuredClone(data);
    },
  };
  globalThis.self = worker;
  await import(path);
  return (data) => {
    worker.onmessage({ data });
    return result;
  };
}

test('streamed negative chunks merge in-flight edits and discard departed results', async () => {
  try {
    const run = await workerModule('../src/near-worker.js');
    for (const dimension of ['overworld', 'nether', 'end']) {
      const world = new World(624, dimension, { load: false });
      const expected = new World(624, dimension, { load: false });
      const job = { seed: 624, dimension, cq: -2, cr: 1, exclusions: [] };
      const stream = new NearStream(world);
      stream.ready = run(job);
      stream.step();
      assert.equal(world.chunks.size, 0);
      stream.ready = run(job);
      for (const w of [world, expected]) w.set(-11, 35, 13, 'glowstone');
      stream.wanted.add('-2,1');
      stream.step();
      expected.generateChunk(-2, 1);
      for (const name of [
        'blocks',
        'naturalStates',
        'treeLeaves',
        'treeLogs',
        'buildings',
        'spawners',
        'chorusPending',
        'columns',
      ])
        assert.deepEqual(world[name], expected[name], name);
      assert.equal(world.get(-11, 35, 13), 'glowstone');
      world.blocks.delete('-11,35,13');
      assert.equal(world.get(-11, 35, 13), undefined);
    }
  } finally {
    delete globalThis.self;
  }
});

test('worker transport matches static RGB, held light, liquid depth and packed texture', async () => {
  try {
    const run = await workerModule('../src/light-worker.js');
    const world = new World(624, 'overworld', { load: false });
    world.ensureAround(-1, -1, 0);
    world.set(-4, 43, -4, 'glowstone');
    world.fluids.source(-5, 43, -4, 'water');
    const field = new VoxelLight(world);
    field.setHeld('torch', { x: -6, y: 47, z: -6 });
    field.update(0, true);
    const texture = new DynamicLight();
    texture.upload(field);
    const ck = '-1,-1';
    run({ k: ck, packet: opticalPacket(world, ck) });
    const data = run({
      solve: true,
      dimension: world.dimension,
      center: world.center,
      revision: world.lightRevision,
      held: field.heldSource,
    });
    for (const name of [
      'cost',
      'medium',
      'sky',
      'baseRGB',
      'rgb',
      'leafAmbient',
    ])
      assert.deepEqual(data.field[name], field[name], name);
    assert.deepEqual(data.packed, texture.data);
    assert.ok(data.changed.includes(ck));
    assert.deepEqual(
      run({
        solve: true,
        center: world.center,
        dimension: world.dimension,
        held: field.heldSource,
      }).changed,
      [],
    );
  } finally {
    delete globalThis.self;
  }
});

test('localized leaf support agrees with a complete rebuild at a chunk seam', () => {
  const world = new World(624, 'end', { load: false });
  world.ensureAround(8, 0, 1);
  world.set(7, 53, 0, 'wood');
  for (let q = 8; q <= 14; q++) world.set(q, 53, 0, 'leaves');
  world.leafDecay.rebuild();
  const compare = () => {
    const copy = new world.leafDecay.constructor(world);
    copy.rebuild();
    while (world.leafDecay.step()) {}
    assert.deepEqual(world.leafDecay.distance, copy.distance);
    assert.deepEqual(world.leafDecay.uncertain, copy.uncertain);
    assert.deepEqual(
      new Set(world.leafDecay.pending.keys()),
      new Set(copy.pending.keys()),
    );
  };
  world.leafDecay.stream();
  compare();
  world.set(7, 53, 0, null);
  compare();
});
