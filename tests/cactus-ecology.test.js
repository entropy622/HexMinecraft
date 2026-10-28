import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS, axialToWorld, key } from '../src/core.js';
import { pigmentSupport } from '../src/pigment-plants.js';
import { cactusContact, tickCactus } from '../src/cactus.js';
import { buildingParts } from '../src/building-shapes.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';
import { craftingMatches, craftingResult } from '../src/crafting.js';
import { Scene, PerspectiveCamera } from 'three';
import { ItemDrops } from '../src/item-drops.js';
import { Fauna } from '../src/fauna.js';
import { Experience } from '../src/experience.js';
import { woolItem } from '../src/wool-data.js';

// Failure classes precede these checks in cactus-ecology-verification.md.
// The real world/shape/save/crafting modules remain composed together; only
// the external randomness boundary is controlled for isolated tick arithmetic.
function garden(dimension = 'overworld', height = 1, age) {
  const w = new World(624, dimension, { load: false });
  w.generateChunk(0, 0);
  w.set(4, 38, 4, 'sand');
  for (let y = 39; y < 46; y++) w.set(4, y, 4, null);
  for (let i = 0; i < height; i++) w.set(4, 39 + i, 4, 'cactus');
  if (age !== undefined)
    w.setState(4, 38 + height, 4, { facing: 0, open: false, age });
  return w;
}
function tick(w, y = 39, roll = 0.61, dt = 1 / 60) {
  const original = Math.random,
    values = [4.5 / 8, 4.5 / 8, (y + 0.5) / 64, roll];
  let n = 0;
  Math.random = () => values[n++] ?? 0.61;
  try {
    return tickCactus(w, dt);
  } finally {
    Math.random = original;
  }
}

test('age eight uses inclusive 10/25 percent flower chances; failed rolls keep aging', () => {
  for (const height of [1, 2, 3, 5])
    for (const [roll, flower] of [
      [height < 3 ? 0.1 : 0.25, true],
      [height < 3 ? 0.100001 : 0.250001, false],
    ]) {
      const w = garden('overworld', height, 8),
        y = 38 + height;
      tick(w, y, roll);
      assert.equal(w.get(4, y + 1, 4), flower ? 'cactusFlower' : undefined);
      assert.equal(w.state(4, y, 4).age, 9);
    }
});

test('stems grow only on their sixteenth sample below height three and reset the parent', () => {
  for (const dimension of ['overworld', 'nether', 'end']) {
    const w = garden(dimension);
    for (let n = 0; n < 15; n++) tick(w);
    assert.equal(w.state(4, 39, 4).age, 15);
    assert.equal(w.get(4, 40, 4), undefined);
    assert.deepEqual(tick(w), [[4, 40, 4]]);
    assert.equal(w.state(4, 39, 4).age, 0);
    assert.equal(w.state(4, 40, 4).age ?? 0, 0);
    tick(w); // A lower stem is not a growth tip.
    assert.equal(w.state(4, 39, 4).age, 0);
    w.setState(4, 40, 4, { facing: 0, open: false, age: 15 });
    tick(w, 40);
    assert.equal(w.get(4, 41, 4), 'cactus');
    w.setState(4, 41, 4, { facing: 0, open: false, age: 15 });
    tick(w, 41);
    assert.equal(w.get(4, 42, 4), undefined);
    assert.equal(w.state(4, 41, 4).age, 15);
  }
});

test('occupied headroom freezes age; dark roofs and no neighboring water do not inhibit growth', () => {
  const w = garden('nether', 1, 7);
  for (const cover of ['stone', 'cactusFlower']) {
    w.set(4, 40, 4, cover);
    tick(w);
    assert.equal(w.state(4, 39, 4).age, 7);
  }
  w.set(4, 40, 4, null);
  w.set(4, 41, 4, 'stone');
  tick(w);
  assert.equal(w.state(4, 39, 4).age, 8);
  tick(w, 39, 0);
  assert.equal(w.get(4, 40, 4), 'cactusFlower');
  const age = w.state(4, 39, 4).age;
  tick(w);
  assert.equal(w.state(4, 39, 4).age, age);
  for (const dt of [0, -1, NaN, Infinity])
    assert.deepEqual(tick(w, 39, 0, dt), []);
});

test('six-sided cactus survival separates solidity, optical transparency, thin carpets and liquids', () => {
  const w = garden();
  for (const [dq, dr] of DIRECTIONS) {
    for (const type of [
      'stone',
      'glass',
      'blueStainedGlass',
      'stoneSlab',
      'fence',
      'gate',
      'cobweb',
      'pointedDripstone',
    ]) {
      w.set(4 + dq, 39, 4 + dr, type);
      assert.equal(pigmentSupport(w, 'cactus', 4, 39, 4), false, type);
    }
    for (const type of ['blueCarpet', 'poppy', 'redstoneWire', 'ladder']) {
      w.set(4 + dq, 39, 4 + dr, type);
      assert.equal(pigmentSupport(w, 'cactus', 4, 39, 4), true, type);
    }
    w.set(4 + dq, 39, 4 + dr, null);
    for (const type of ['water', 'glow', 'lava']) {
      w.fluids.source(4 + dq, 39, 4 + dr, type);
      assert.equal(pigmentSupport(w, 'cactus', 4, 39, 4), type !== 'lava');
      w.fluids.write(4 + dq, 39, 4 + dr, null);
    }
  }
  w.fluids.source(4, 40, 4, 'water');
  assert.equal(pigmentSupport(w, 'cactus', 4, 39, 4), false);
  w.fluids.write(4, 40, 4, null);
  for (const below of [
    'dirt',
    'grass',
    'farmland',
    'stone',
    'sand',
    'cactus',
  ]) {
    w.set(4, 38, 4, below);
    assert.equal(
      pigmentSupport(w, 'cactus', 4, 39, 4),
      ['sand', 'cactus'].includes(below),
    );
  }
});

test('flower opportunity is suppressed by solid/lava sides or overhead liquid, but stems still grow then fail support', () => {
  const w = garden('overworld', 1, 8);
  w.set(5, 40, 4, 'glass');
  tick(w, 39, 0);
  assert.equal(w.get(4, 40, 4), undefined);
  assert.equal(w.state(4, 39, 4).age, 9);
  w.setState(4, 39, 4, { facing: 0, open: false, age: 15 });
  tick(w);
  assert.equal(w.get(4, 40, 4), 'cactus');
  assert.equal(pigmentSupport(w, 'cactus', 4, 40, 4), false);
  assert.equal(w.state(4, 39, 4).age, 0);
});

test('flower survival accepts cactus/farmland/center-supported top faces without side clearance', () => {
  const w = garden();
  w.set(5, 40, 4, 'stone');
  for (const type of [
    'cactus',
    'farmland',
    'stone',
    'glass',
    'fence',
    'stoneSlab',
    'hopper',
    'blueCarpet',
  ]) {
    w.set(4, 39, 4, type);
    if (type === 'stoneSlab')
      w.setState(4, 39, 4, { facing: 0, open: false, upper: true });
    assert.equal(
      pigmentSupport(w, 'cactusFlower', 4, 40, 4),
      !['hopper', 'blueCarpet'].includes(type),
      type,
    );
  }
  w.set(4, 39, 4, 'stoneSlab');
  w.setState(4, 39, 4, { facing: 0, open: false, upper: false });
  assert.equal(pigmentSupport(w, 'cactusFlower', 4, 40, 4), false);
  w.set(4, 39, 4, null);
  assert.equal(pigmentSupport(w, 'cactusFlower', 4, 40, 4), false);
  w.fluids.source(4, 39, 4, 'water');
  assert.equal(pigmentSupport(w, 'cactusFlower', 4, 40, 4), false);
});

test('all six sides and the inset top contact real cylindrical bodies, without hurting nearby safe space', () => {
  const w = garden(),
    p = axialToWorld(4, 4);
  assert.equal(w.groundAt(p.x, p.z, 39, 41), 39.9375);
  assert.equal(cactusContact(w, p.x, 39.9375, p.z, 1.8, 0.24), true);
  assert.equal(cactusContact(w, p.x, 40, p.z, 1.8, 0.24), false);
  for (const [dq, dr] of DIRECTIONS) {
    const d = axialToWorld(dq, dr),
      length = Math.hypot(d.x, d.z);
    for (const radius of [0.125, 0.24, 0.45]) {
      const distance = Math.sqrt(3) / 2 + radius - 0.001,
        x = p.x + (d.x / length) * distance,
        z = p.z + (d.z / length) * distance;
      assert.equal(cactusContact(w, x, 39.1, z, 0.3, radius), true);
      assert.equal(
        cactusContact(
          w,
          x + (d.x / length) * 0.01,
          39.1,
          z + (d.z / length) * 0.01,
          0.3,
          radius,
        ),
        false,
      );
    }
  }
  w.set(4, 39, 4, 'cactusFlower');
  assert.deepEqual(buildingParts(w, 4, 39, 4, true), []);
  assert.equal(cactusContact(w, p.x, 39.1, p.z, 0.3, 0.24), false);
  w.set(5, 39, 5, 'cactus');
  assert.equal(
    cactusContact(w, p.x + Math.sqrt(3) * 0.495, 39.1, p.z + 0.495, 3.5, 1.3),
    true,
  );
  assert.equal(
    cactusContact(w, p.x + Math.sqrt(3) * 0.495, 39.1, p.z + 0.495, 3.5, 0.9),
    false,
  );
});

test('natural age persistence records its block, notifies facing observers, and never replays unloaded time', () => {
  const w = garden();
  w.edits.delete(key(4, 39, 4));
  w.set(3, 39, 4, 'observer');
  w.setState(3, 39, 4, { facing: 0, open: false, powered: false });
  w.redstone.timers.clear();
  w.setState(4, 39, 4, { facing: 0, open: false, age: 0 });
  assert.equal(w.redstone.timers.size, 0);
  tick(w);
  assert.equal(w.redstone.timers.get(key(3, 39, 4)), 0.1);
  assert.equal(w.edits.get(key(4, 39, 4)), 'cactus');
  const save = currentSave(w);
  assert.equal(validateSave(save), save);
  const restored = new World(save.seed, 'overworld', {
    ...save.dimensions.overworld,
    load: false,
  });
  restored.generateChunk(0, 0);
  assert.equal(restored.state(4, 39, 4).age, 1);
  restored.unloadChunk(0, 0);
  tick(restored);
  restored.generateChunk(0, 0);
  assert.equal(restored.state(4, 39, 4).age, 1);
  restored.set(4, 39, 4, 'stone');
  assert.equal(restored.blockStates.has(key(4, 39, 4)), false);

  w.setState(4, 39, 4, { facing: 0, open: false, age: 15 });
  w.redstone.timers.clear();
  tick(w);
  assert.equal(w.redstone.timers.get(key(3, 39, 4)), 0.1);
  assert.equal(w.state(4, 39, 4).age, 0);
  assert.equal(w.get(4, 40, 4), 'cactus');
  w.setState(4, 40, 4, { facing: 0, open: false, age: 8 });
  tick(w, 40, 0);
  assert.equal(w.get(4, 41, 4), 'cactusFlower');
  assert.equal(validateSave(currentSave(w)).version, 16);
  w.unloadChunk(0, 0);
  w.generateChunk(0, 0);
  assert.equal(w.get(4, 41, 4), 'cactusFlower');
  assert.equal(w.state(4, 39, 4).age, 0);
  assert.equal(w.state(4, 40, 4).age, 9);
});

test('save validation rejects every malformed or foreign cactus age and accepts all sixteen ages', () => {
  for (const age of [
    ...Array(16).keys(),
    -1,
    16,
    0.5,
    '8',
    null,
    NaN,
    Infinity,
  ]) {
    const save = currentSave(garden());
    save.dimensions.overworld.blockStates.push([
      key(4, 39, 4),
      { facing: 0, open: false, age },
    ]);
    if (Number.isInteger(age) && age >= 0 && age <= 15)
      assert.equal(validateSave(save), save);
    else assert.throws(() => validateSave(save));
  }
  const save = currentSave(garden());
  save.dimensions.overworld.edits.push([key(3, 39, 4), 'stone']);
  save.dimensions.overworld.blockStates.push([
    key(3, 39, 4),
    { facing: 0, open: false, age: 0 },
  ]);
  assert.throws(() => validateSave(save));
});

test('an untouched generated desert tip gains a valid persistent age without a preexisting edit', () => {
  const w = new World(624, 'overworld', { load: false });
  let position;
  for (const cq of [-12, -6, 0, 6, 12]) {
    for (const cr of [-12, -6, 0, 6, 12]) {
      w.generateChunk(cq, cr);
      position = [...w.blocks]
        .filter(([, t]) => t === 'cactus')
        .map(([k]) => k.split(',').map(Number))
        .find(
          ([q, y, r]) =>
            q > cq * 8 &&
            q < cq * 8 + 7 &&
            r > cr * 8 &&
            r < cr * 8 + 7 &&
            !w.get(q, y + 1, r),
        );
      if (position) break;
    }
    if (position) break;
  }
  assert.ok(position);
  const [q, y, r] = position,
    cq = Math.floor(q / 8),
    cr = Math.floor(r / 8);
  for (const ck of [...w.chunks.keys()])
    if (ck !== `${cq},${cr}`) w.unloadChunk(...ck.split(',').map(Number));
  assert.equal(w.edits.has(key(q, y, r)), false);
  const original = Math.random,
    values = [(q - cq * 8 + 0.5) / 8, (r - cr * 8 + 0.5) / 8, (y + 0.5) / 64];
  Math.random = () => values.shift() ?? 0.61;
  try {
    tickCactus(w, 1 / 60);
  } finally {
    Math.random = original;
  }
  assert.equal(w.state(q, y, r).age, 1);
  const saved = validateSave(currentSave(w)),
    restored = new World(saved.seed, 'overworld', {
      ...saved.dimensions.overworld,
      load: false,
    });
  restored.generateChunk(cq, cr);
  assert.equal(restored.get(q, y, r), 'cactus');
  assert.equal(restored.state(q, y, r).age, 1);
});

test('one harvested flower crafts one pink dye through the ordinary recipe matcher', () => {
  const grid = Array(7).fill(null);
  grid[3] = { item: 'cactusFlower', count: 1 };
  const match = craftingMatches(grid, false).find(
    (m) => m.recipe.id === 'pinkDye',
  );
  assert.deepEqual(craftingResult(match), { item: 'pinkDye', count: 1 });
});

test('items touch the cactus before pickup, including fast side/top motion and portable contents', () => {
  const w = garden(),
    p = axialToWorld(4, 4),
    camera = new PerspectiveCamera();
  camera.position.set(p.x, 40, p.z);
  for (const stack of [
    { item: 'diamond', count: 64 },
    { item: 'cactus', count: 3 },
    { item: 'cactusFlower', count: 1 },
    { item: 'pick1', count: 1, wear: 3 },
    { item: 'shulkerBox', count: 1, contents: Array(27).fill(null) },
  ]) {
    const drops = new ItemDrops(new Scene(), null);
    drops.spawnStack(stack, [p.x, 39.5, p.z], [0, 0, 0]);
    assert.equal(drops.serialize().length, 1);
    drops.update(1 / 60, w, camera, () =>
      assert.fail('hazardous items must not reach pickup'),
    );
    assert.deepEqual(drops.serialize(), []);
  }
  for (const [position, velocity] of [
    [
      [p.x - 2, 39.5, p.z],
      [40, 0, 0],
    ],
    [
      [p.x, 40.4, p.z],
      [0, -20, 0],
    ],
  ]) {
    const drops = new ItemDrops(new Scene(), null);
    drops.spawn('diamond', 1, position, {}, velocity);
    drops.update(0.1, w, camera, () => 0);
    assert.deepEqual(drops.serialize(), []);
  }
  const safe = new ItemDrops(new Scene(), null);
  camera.position.set(p.x + 50, 40, p.z);
  safe.spawn('diamond', 1, [p.x + 1.5, 39.5, p.z], {}, [0, 0, 0]);
  safe.update(0.001, w, camera, () => 0);
  assert.equal(safe.serialize()[0].count, 1);
  w.unloadChunk(0, 0);
  const frozen = safe.serialize();
  safe.update(1, w, camera, () => 0);
  assert.deepEqual(safe.serialize(), frozen);
});

test('real mob contact takes one health point, respects its hurt interval, and dies through loot without XP', () => {
  const w = garden(),
    p = axialToWorld(4, 4),
    scene = new Scene(),
    drops = new ItemDrops(scene, null),
    xp = new Experience(scene, () => {}),
    camera = new PerspectiveCamera();
  camera.position.set(p.x + 4, 41, p.z);
  const fauna = new Fauna(scene, null, {
    drop: (item, count, position) => drops.spawn(item, count, position),
    experience: (amount, position) => xp.spawn(amount, position),
    moveBlock: (...args) => w.set(...args),
  });
  fauna.load(w);
  const sheep = fauna.spawn('sheep', [p.x, 39.9375, p.z]);
  fauna.update(0.001, 100, camera, [], false);
  assert.equal(sheep.hp, 7);
  fauna.update(0.001, 100, camera, [], false);
  assert.equal(sheep.hp, 7);
  const snapshot = fauna.serialize();
  snapshot.mobs[0].hp = 1;
  snapshot.mobs[0].position = [p.x, 39.9375, p.z];
  fauna.load(w, snapshot);
  fauna.update(0.001, 100, camera, [], false);
  assert.equal(fauna.serialize().mobs.length, 0);
  assert.deepEqual(
    drops
      .serialize()
      .map((d) => [d.item, d.count])
      .sort(),
    [
      ['meat', 2],
      [woolItem(sheep.color), 1],
    ].sort(),
  );
  assert.deepEqual(xp.records, []);
});

test('headroom fluid and upper-neighbor lava suppress flowers, and unloaded borders cannot tick as air', () => {
  for (const [position, liquid] of [
    [[4, 40, 4], 'water'],
    [[4, 41, 4], 'water'],
    [[5, 40, 4], 'lava'],
  ]) {
    const w = garden('overworld', 1, 8);
    w.fluids.source(...position, liquid);
    tick(w, 39, 0);
    assert.equal(w.get(4, 40, 4), undefined);
    assert.equal(
      w.state(4, 39, 4).age,
      position[1] === 40 && position[0] === 4 ? 8 : 9,
    );
  }
  const w = garden();
  w.set(7, 38, 4, 'sand');
  w.set(7, 39, 4, 'cactus');
  const original = Math.random;
  const values = [7.5 / 8, 4.5 / 8, 39.5 / 64];
  Math.random = () => values.shift() ?? 0;
  try {
    tickCactus(w, 1 / 60);
  } finally {
    Math.random = original;
  }
  assert.equal(w.state(7, 39, 4).age ?? 0, 0);
});
