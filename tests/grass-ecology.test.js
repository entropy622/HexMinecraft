import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { VoxelLight } from '../src/voxel-light.js';
import { DIRECTIONS, key } from '../src/core.js';
import { CARPET_BLOCKS } from '../src/carpet-data.js';
import { Weather } from '../src/weather.js';
import { tickGrass } from '../src/grass.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';

// Failure classes were written first in docs/grass-ecology-verification.md.
// Only host randomness is controlled; world/light/shape/save modules stay real.
function pasture(dimension = 'overworld') {
  const world = new World(624, dimension, { load: false });
  world.generateChunk(0, 0);
  world.set(4, 39, 4, 'grass');
  world.set(3, 39, 4, 'dirt');
  return { world, light: new VoxelLight(world), weather: new Weather() };
}
function random(values, run) {
  const original = Math.random;
  let calls = 0;
  Math.random = () => values[calls++] ?? 0.61;
  try {
    return run(() => calls);
  } finally {
    Math.random = original;
  }
}
function step(p, values = [], time = 100, dt = 1 / 60) {
  p.light.update(0, true);
  return random(values, () => tickGrass(p.world, dt, p.light, time, p.weather));
}
const source = [4.5 / 8, 4.5 / 8, 39.5 / 64];
function destination(direction, height) {
  return [(direction + 0.5) / 7, (height + 3.5) / 5];
}

test('all sixteen carpets preserve source grass and admit spreading beneath the destination carpet', () => {
  for (const type of Object.keys(CARPET_BLOCKS)) {
    const p = pasture();
    p.world.set(4, 40, 4, type);
    p.world.set(3, 40, 4, type);
    assert.deepEqual(step(p), [[3, 39, 4]], type);
    assert.equal(p.world.get(4, 39, 4), 'grass', type);
    assert.equal(p.world.get(3, 39, 4), 'grass', type);
    assert.deepEqual(step(p, [3.5 / 8, 4.5 / 8, 39.5 / 64]), [], type);
    assert.equal(p.world.get(3, 39, 4), 'grass', type);
  }
});

test('real grass conversions notify only the facing observer and never replay unloaded or identical edits', () => {
  const p = pasture(),
    w = p.world;
  for (const [q, facing] of [
    [2, 0],
    [5, 3],
  ]) {
    w.set(q, 39, 4, 'observer');
    w.setState(q, 39, 4, { facing, open: false, powered: false });
  }
  w.set(4, 40, 4, 'blueCarpet');
  w.set(3, 40, 4, 'redCarpet');
  assert.deepEqual(step(p), [[3, 39, 4]]);
  assert.equal(w.redstone.timers.get(key(2, 39, 4)), 0.1);
  assert.equal(w.redstone.timers.has(key(5, 39, 4)), false);
  w.redstone.tick(0.1, []);
  assert.equal(w.state(2, 39, 4).powered, true);
  assert.equal(w.state(5, 39, 4).powered, false);
  w.redstone.tick(0.1, []);
  assert.equal(w.state(2, 39, 4).powered, false);
  w.set(4, 40, 4, 'observer');
  assert.deepEqual(step(p), [[4, 39, 4]]);
  assert.equal(w.redstone.timers.get(key(5, 39, 4)), 0.1);
  w.redstone.tick(0.1, []);
  assert.equal(w.state(5, 39, 4).powered, true);
  w.redstone.tick(0.1, []);
  w.set(4, 39, 4, 'dirt');
  assert.equal(w.redstone.timers.size, 0);
  w.ensureAround(80, 80, 0);
  assert.equal(w.loaded(4, 4), false);
  w.set(4, 39, 4, 'grass');
  w.redstone.tick(1, []);
  w.ensureAround(4, 4, 1);
  w.redstone.tick(1, []);
  assert.equal(w.get(4, 39, 4), 'grass');
  assert.equal(w.redstone.timers.size, 0);
  assert.equal(w.state(5, 39, 4).powered, false);
});

test('all six hex faces and the same column admit y -3 through +1, with no wider jumps', () => {
  for (const [direction, [dq, dr]] of [
    [0, [0, 0]],
    ...DIRECTIONS.map((d, i) => [i + 1, d]),
  ])
    for (const dy of [-3, -2, -1, 0, 1]) {
      if (direction === 0 && [0, -1].includes(dy)) continue;
      const p = pasture(),
        w = p.world;
      w.set(3, 39, 4, null);
      w.set(4 + dq, 39 + dy, 4 + dr, 'dirt');
      const values = [
        ...source,
        ...Array.from({ length: 4 }, () => destination(direction, dy)).flat(),
      ];
      const changed = step(p, values);
      // Same-column dirt immediately above the source occludes it.
      if (direction === 0 && dy === 1) {
        assert.equal(w.get(4, 39, 4), 'dirt');
        continue;
      }
      assert.deepEqual(
        changed,
        [[4 + dq, 39 + dy, 4 + dr]],
        `${direction}/${dy}`,
      );
      assert.equal(w.get(4 + dq, 39 + dy, 4 + dr), 'grass');
    }
  const p = pasture();
  for (const pos of [
    [2, 39, 4],
    [3, 35, 4],
    [3, 41, 4],
  ])
    p.world.set(...pos, 'dirt');
  step(p);
  for (const pos of [
    [2, 39, 4],
    [3, 35, 4],
    [3, 41, 4],
  ])
    assert.equal(p.world.get(...pos), 'dirt');
});

test('cover state controls survival; darkness alone and transparent/partial covers do not kill grass', () => {
  const cases = [
    [null, {}, true],
    ['stone', {}, false],
    ['snow', {}, false],
    ['glass', {}, true],
    ['leaves', {}, true],
    ['torch', {}, true],
    ['fence', {}, true],
    ['observer', { powered: false }, false],
    ['door', {}, true],
    ['planksSlab', { upper: false }, false],
    ['planksSlab', { upper: true }, true],
    ['planksSlab', { upper: true, double: true }, false],
    ['planksStairs', { upper: false }, false],
    ['planksStairs', { upper: true }, true],
    ['trapdoor', { upper: false, open: false }, false],
    ['trapdoor', { upper: true, open: false }, true],
    ['trapdoor', { upper: false, open: true }, true],
  ];
  for (const [type, state, survives] of cases) {
    const p = pasture('nether');
    p.world.set(4, 40, 4, type);
    p.world.setState(4, 40, 4, { facing: 0, open: false, ...state });
    step(p);
    assert.equal(
      p.world.get(4, 39, 4),
      survives ? 'grass' : 'dirt',
      `${type}/${JSON.stringify(state)}`,
    );
  }
  const p = pasture();
  p.world.set(4, 40, 4, 'planksSlab');
  p.world.setState(4, 40, 4, { upper: true });
  step(p);
  assert.equal(p.world.get(4, 39, 4), 'grass');
  p.world.setState(4, 40, 4, { upper: false });
  step(p);
  assert.equal(p.world.get(4, 39, 4), 'dirt');
});

test('source light 8/9 boundary uses placed light, permits a dark destination and ignores held light', () => {
  const p = pasture('nether');
  p.world.generateChunk(0, 1);
  p.world.set(4, 40, 10, 'torch');
  p.light.update(0, true);
  const level = () =>
    Math.max(...p.light.baseRGB.map((c) => c[p.light.index(4, 40, 4)]));
  assert.equal(level(), 8);
  assert.deepEqual(step(p), []);
  p.world.set(4, 40, 10, null);
  p.world.set(4, 40, 9, 'torch');
  p.world.set(3, 36, 4, 'dirt');
  p.world.set(3, 37, 4, 'leaves');
  p.light.update(0, true);
  assert.equal(level(), 9);
  const target = p.light.index(3, 37, 4);
  assert.ok(Math.max(...p.light.baseRGB.map((c) => c[target])) < 4);
  step(p, [
    ...source,
    ...Array.from({ length: 4 }, () => destination(4, -3)).flat(),
  ]);
  assert.equal(p.world.get(3, 36, 4), 'grass');
  p.world.set(4, 40, 9, null);
  p.world.set(3, 39, 4, 'dirt');
  p.light.update(0, true);
  p.light.setHeld('torch', { x: Math.sqrt(3) * 6, y: 40, z: 6 });
  p.light.update(1);
  assert.ok(
    Math.max(...p.light.rgb.map((c) => c[p.light.index(4, 40, 4)])) >= 9,
  );
  assert.deepEqual(
    random([], () => tickGrass(p.world, 1 / 60, p.light, 100, p.weather)),
    [],
  );
  assert.equal(p.world.get(3, 39, 4), 'dirt');
});

test('day/night and rain/thunder attenuate sky while true block light remains usable', () => {
  const p = pasture();
  assert.deepEqual(step(p, [], 400), []);
  assert.equal(p.world.get(4, 39, 4), 'grass');
  p.world.set(4, 40, 5, 'torch');
  assert.deepEqual(step(p, [], 400), [[3, 39, 4]]);
  p.world.set(3, 39, 4, 'dirt');
  p.world.set(4, 40, 5, null);
  // Several leaf layers transmit sky but reduce it to the propagation boundary.
  for (let y = 41; y <= 42; y++)
    for (let q = 0; q < 8; q++)
      for (let r = 0; r < 8; r++) p.world.set(q, y, r, 'leaves');
  p.light.update(0, true);
  assert.equal(p.light.sky[p.light.index(4, 40, 4)], 9);
  p.weather.rain = p.weather.storm = 1;
  assert.deepEqual(step(p), []);
  p.weather.rain = p.weather.storm = 0;
  assert.deepEqual(step(p), [[3, 39, 4]]);
});

test('Nether and End have no gameplay skylight; actual placed block light enables grass spreading', () => {
  for (const dimension of ['nether', 'end']) {
    const p = pasture(dimension);
    p.light.update(0, true);
    assert.equal(
      Math.max(
        ...p.light.baseRGB.map((channel) => channel[p.light.index(4, 40, 4)]),
      ),
      0,
    );
    assert.deepEqual(step(p), [], `${dimension} without a lamp`);
    assert.equal(p.world.get(4, 39, 4), 'grass');
    assert.equal(p.world.get(3, 39, 4), 'dirt');
    p.world.set(4, 40, 5, 'torch');
    assert.deepEqual(step(p), [[3, 39, 4]], `${dimension} with a placed torch`);
    p.world.set(3, 39, 4, 'dirt');
    p.world.set(4, 40, 5, null);
    assert.deepEqual(step(p), [], `${dimension} after torch removal`);
    assert.equal(p.world.get(3, 39, 4), 'dirt');
  }
});

test('full fluid kills sources; flowing water survives but every destination fluid forbids spread', () => {
  for (const type of ['water', 'lava', 'glow']) {
    const p = pasture();
    p.world.fluids.source(4, 40, 4, type);
    step(p);
    assert.equal(p.world.get(4, 39, 4), 'dirt');
    assert.equal(p.world.fluids.get(4, 40, 4).type, type);
    const target = pasture();
    target.world.fluids.source(3, 40, 4, type);
    step(target);
    assert.equal(target.world.get(3, 39, 4), 'dirt');
  }
  const p = pasture();
  p.world.fluids.write(4, 40, 4, {
    type: 'water',
    source: false,
    level: 3,
    falling: false,
  });
  step(p);
  assert.equal(p.world.get(4, 39, 4), 'grass');
  p.world.fluids.write(4, 40, 4, {
    type: 'water',
    source: false,
    level: 3,
    falling: true,
  });
  step(p);
  assert.equal(p.world.get(4, 39, 4), 'dirt');
});

test('four attempts and competing sources emit a single persisted conversion', () => {
  const p = pasture();
  p.world.set(2, 39, 4, 'grass');
  const values = [
    ...source,
    ...Array.from({ length: 4 }, () => destination(4, 0)).flat(),
    2.5 / 8,
    4.5 / 8,
    39.5 / 64,
    ...Array.from({ length: 4 }, () => destination(1, 0)).flat(),
  ];
  assert.deepEqual(step(p, values, 100, 2 / 60), [[3, 39, 4]]);
  assert.equal(p.world.edits.get('3,39,4'), 'grass');
  const last = pasture();
  assert.deepEqual(
    step(last, [
      ...source,
      ...Array.from({ length: 3 }, () => destination(0, 0)).flat(),
      ...destination(4, 0),
    ]),
    [[3, 39, 4]],
  );
});

test('sampling is bounded to loaded chunks and active duration; invalid/stale fields cannot mutate', () => {
  const p = pasture();
  assert.deepEqual(
    random([], () => tickGrass(p.world, 1, p.light, 100, p.weather)),
    [],
  );
  p.light.update(0, true);
  const other = pasture();
  assert.deepEqual(
    random([], () => tickGrass(other.world, 1, p.light, 100, other.weather)),
    [],
  );
  for (const dt of [0, -1, NaN, Infinity])
    random([], (calls) => {
      assert.deepEqual(tickGrass(p.world, dt, p.light, 100, p.weather), []);
      assert.equal(calls(), 0);
    });
  p.world.set(4, 40, 4, 'stone');
  assert.deepEqual(
    random([], () => tickGrass(p.world, 1, p.light, 100, p.weather)),
    [],
  );
  const revision = p.light.revision;
  assert.notEqual(revision, p.world.lightRevision);
  p.light.update(0, true);
  const lightBefore = p.light.revision;
  random([], (calls) => {
    assert.deepEqual(tickGrass(p.world, 0.5, p.light, 100, p.weather), [
      [4, 39, 4],
    ]);
    assert.ok(
      calls() <= 120,
      'loaded-chunk maintenance exceeds bounded random work',
    );
  });
  assert.equal(p.world.get(4, 39, 4), 'dirt');
  assert.equal(p.light.revision, lightBefore);
  p.world.clearLoaded();
  p.light.update(0, true);
  random([], (calls) => {
    assert.deepEqual(tickGrass(p.world, 1, p.light, 100, p.weather), []);
    assert.equal(calls(), 0);
  });
});

test('negative chunk seams, unload/reload and current v16 serialization retain results', () => {
  const p = pasture();
  p.world.generateChunk(-1, 0);
  p.world.set(0, 39, 4, 'grass');
  p.world.set(-1, 39, 4, 'dirt');
  assert.ok(
    step(p, [
      0.5 / 8,
      4.5 / 8,
      39.5 / 64,
      ...Array.from({ length: 4 }, () => destination(4, 0)).flat(),
    ]).some((v) => v.join() === '-1,39,4'),
  );
  p.world.unloadChunk(-1, 0);
  p.world.generateChunk(-1, 0);
  assert.equal(p.world.get(-1, 39, 4), 'grass');
  p.world.set(-1, 39, 4, 'dirt');
  p.world.unloadChunk(-1, 0);
  const edits = [...p.world.edits];
  step(p, [
    0.5 / 8,
    4.5 / 8,
    39.5 / 64,
    ...Array.from({ length: 4 }, () => destination(4, 0)).flat(),
  ]);
  assert.deepEqual([...p.world.edits], edits);
  p.world.generateChunk(-1, 0);
  assert.equal(p.world.get(-1, 39, 4), 'dirt');
  step(p, [
    0.5 / 8,
    4.5 / 8,
    39.5 / 64,
    ...Array.from({ length: 4 }, () => destination(4, 0)).flat(),
  ]);
  assert.equal(p.world.get(-1, 39, 4), 'grass');
  assert.equal(p.world.solid(-1, 39, 4), true);
  const copy = new World(p.world.seed, 'overworld', {
    ...p.world.serialize(),
    load: false,
  });
  copy.generateChunk(-1, 0);
  assert.equal(copy.get(-1, 39, 4), 'grass');
  assert.ok(validateSave(currentSave(copy)));
});
