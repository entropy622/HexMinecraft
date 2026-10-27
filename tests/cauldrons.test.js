import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { axialToWorld } from '../src/core.js';
import { Weather, WeatherColumns } from '../src/weather.js';
import { tickCauldrons, cauldronContact } from '../src/cauldrons.js';
import { cauldronAction } from '../src/cauldron-data.js';
import { buildingMesh } from '../src/building-graphics.js';
import { miningStats } from '../src/mining.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';

// Failure classes were recorded before implementation in cauldrons-verification.md.
// Browser scenarios cover the user entry; these expand geometry and scheduling inputs.
function room(dimension = 'overworld') {
  const w = new World(624, dimension, { load: false });
  w.generateChunk(0, 0);
  for (let q = 0; q < 8; q++)
    for (let r = 0; r < 8; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y < 64; y++) w.set(q, y, r, null);
    }
  return w;
}
function feed(w, liquid = 'water', q = 1, tip = 44, length = 2, r = 1) {
  w.set(q, 40, r, 'cauldron');
  for (let y = tip; y < tip + length; y++) {
    w.set(q, y, r, 'pointedDripstone');
    w.setState(q, y, r, { facing: 0, open: false, upper: true });
  }
  w.set(q, tip + length, r, 'stone');
  assert.equal(w.fluids.source(q, tip + length + 1, r, liquid), true);
  return { q, r, tip, source: tip + length + 1 };
}
function tick(w, dt = 1, rain = 0) {
  const weather = new Weather({ kind: rain ? 'rain' : 'clear', rain }),
    columns = new WeatherColumns();
  columns.update(1, w);
  return tickCauldrons(w, dt, weather, columns);
}
test('bottles respect three actual levels, buckets replace whole contents and incompatible items do not mix', () => {
  for (const type of [
    'cauldron',
    'waterCauldron1',
    'waterCauldron2',
    'waterCauldron3',
    'lavaCauldron',
  ]) {
    assert.deepEqual(cauldronAction(type, 'waterBucket'), {
      type: 'waterCauldron3',
      item: 'bucket',
    });
    assert.deepEqual(cauldronAction(type, 'lavaBucket'), {
      type: 'lavaCauldron',
      item: 'bucket',
    });
    for (const item of ['glowBucket', 'milkBucket', 'awkwardPotion', 'stone'])
      assert.equal(cauldronAction(type, item), null);
    assert.equal(miningStats(type, 'pick1').harvest, true);
    assert.equal(miningStats(type, 'wood').harvest, false);
  }
  assert.equal(cauldronAction('waterCauldron2', 'bucket'), null);
  assert.equal(cauldronAction('waterCauldron3', 'waterBottle'), null);
  assert.equal(cauldronAction('lavaCauldron', 'glassBottle'), null);
  assert.equal(cauldronAction('lavaCauldron', 'waterBottle'), null);
  let type = 'cauldron';
  for (const expected of [
    'waterCauldron1',
    'waterCauldron2',
    'waterCauldron3',
  ]) {
    const action = cauldronAction(type, 'waterBottle');
    assert.equal(action.item, 'glassBottle');
    assert.equal(action.type, expected);
    type = action.type;
  }
  for (const expected of ['waterCauldron2', 'waterCauldron1', 'cauldron']) {
    const action = cauldronAction(type, 'glassBottle');
    assert.equal(action.item, 'waterBottle');
    assert.equal(action.type, expected);
    type = action.type;
  }
});
test('real cavity collision and rendered liquid heights remain separate, including rim and outside contacts', () => {
  const w = room(),
    material = new THREE.MeshBasicMaterial();
  for (const [type, height, liquid] of [
    ['cauldron', 0.3125, null],
    ['waterCauldron1', 0.5625, 'water'],
    ['waterCauldron2', 0.75, 'water'],
    ['waterCauldron3', 0.9375, 'water'],
    ['lavaCauldron', 0.9375, 'lava'],
  ]) {
    w.set(0, 40, 0, type);
    assert.equal(w.pointSolid(0, 40.7, 0), false);
    assert.equal(w.pointSolid(0.72, 40.7, 0), true);
    assert.equal(w.groundAt(0, 0, 40, 41), 40.3125);
    const mesh = buildingMesh(
      w,
      0,
      40,
      0,
      { x: 0, z: 0 },
      { uv: (_, u, v) => [u, v] },
      material,
    );
    mesh.updateMatrixWorld();
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 42, 0),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh);
    assert.ok(Math.abs(hits[0].point.y - 40 - height) < 1e-5);
    assert.equal(cauldronContact(w, 0, 40.3125, 0)?.liquid || null, liquid);
    assert.equal(cauldronContact(w, 0.75, 41, 0), null);
    assert.equal(cauldronContact(w, 1.4, 40.32, 0), null);
    assert.equal(cauldronContact(w, 0, 40.1, 0), null);
    mesh.geometry.dispose();
  }
  material.dispose();
});
test('water fills level by level, lava fills once, only the closest receiver collects and dt gates random opportunities', (t) => {
  t.mock.method(Math, 'random', () => 0.001);
  const w = room();
  feed(w);
  feed(w, 'lava', 4);
  assert.deepEqual(tick(w, 0), []);
  tick(w);
  assert.equal(w.get(1, 40, 1), 'waterCauldron1');
  assert.equal(w.get(4, 40, 1), 'cauldron');
  Math.random = () => 0;
  tick(w);
  tick(w);
  assert.equal(w.get(1, 40, 1), 'waterCauldron3');
  assert.equal(w.get(4, 40, 1), 'lavaCauldron');
  assert.deepEqual(tick(w), []);
  w.set(1, 40, 1, 'cauldron');
  w.set(1, 42, 1, 'cauldron');
  tick(w);
  assert.equal(w.get(1, 40, 1), 'cauldron');
  assert.equal(w.get(1, 42, 1), 'waterCauldron1');
});
test('source identity, support, orientation, disconnected chains, obstacles, distance and incompatible contents reject collection', (t) => {
  t.mock.method(Math, 'random', () => 0);
  for (const failure of [
    'no source',
    'flow',
    'upward',
    'unsupported',
    'merged',
    'blocked',
    'liquid gap',
    'far',
    'glow',
    'wrong contents',
  ]) {
    const w = room(),
      f = feed(
        w,
        failure === 'glow' ? 'glow' : 'lava',
        1,
        failure === 'far' ? 52 : 44,
      );
    if (failure === 'no source' || failure === 'flow')
      w.fluids.scoop(1, f.source, 1);
    if (failure === 'flow') {
      w.fluids.source(1, f.source + 1, 1, 'lava');
      for (let i = 0; i < 12; i++) w.fluids.step(0.5);
      assert.equal(w.fluids.get(1, f.source, 1)?.source, false);
    }
    if (failure === 'upward')
      w.setState(1, 44, 1, { facing: 0, open: false, upper: false });
    if (failure === 'unsupported') w.set(1, f.source - 1, 1, null);
    if (failure === 'merged') {
      w.set(1, 43, 1, 'pointedDripstone');
      w.setState(1, 43, 1, { facing: 0, open: false, upper: false });
    }
    if (failure === 'blocked') w.set(1, 42, 1, 'glass');
    if (failure === 'liquid gap') w.fluids.source(1, 42, 1, 'water');
    if (failure === 'wrong contents') w.set(1, 40, 1, 'waterCauldron1');
    const before = w.get(1, 40, 1);
    tick(w);
    assert.equal(w.get(1, 40, 1), before, failure);
  }
});
test('rain and snow collect different contents only in exposed overworld columns', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const w = room();
  w.set(1, 40, 1, 'cauldron');
  tick(w);
  assert.equal(w.get(1, 40, 1), 'cauldron');
  tick(w, 1, 1);
  assert.equal(w.get(1, 40, 1), 'waterCauldron1');
  w.set(1, 42, 1, 'glass');
  tick(w, 1, 1);
  assert.equal(w.get(1, 40, 1), 'waterCauldron1');
  w.set(1, 42, 1, null);
  w.fluids.source(1, 42, 1, 'water');
  tick(w, 1, 1);
  assert.equal(w.get(1, 40, 1), 'waterCauldron1');
  for (const dimension of ['nether', 'end']) {
    const other = room(dimension);
    other.set(1, 40, 1, 'cauldron');
    tick(other, 1, 1);
    assert.equal(other.get(1, 40, 1), 'cauldron');
  }
  for (const biome of ['沙漠', '雪原']) {
    let q = 8;
    while (q < 1000 && w.biome(q, 0) !== biome) q++;
    assert.ok(q < 1000);
    w.generateChunk(Math.floor(q / 8), 0);
    for (let y = 41; y < 64; y++) w.set(q, y, 0, null);
    w.set(q, 40, 0, 'cauldron');
    tick(w, 1, 1);
    assert.equal(
      w.get(q, 40, 0),
      biome === '雪原' ? 'powderSnowCauldron1' : 'cauldron',
      biome,
    );
  }
});
test('comparators read each content level directly and through a solid block without becoming full-strength sources', () => {
  const w = room();
  for (const gap of [false, true]) {
    w.set(2, 40, 1, 'comparator');
    w.setState(2, 40, 1, { facing: 0, open: false, output: 0 });
    for (const [type, expected] of [
      ['cauldron', 0],
      ['waterCauldron1', 1],
      ['waterCauldron2', 2],
      ['waterCauldron3', 3],
      ['lavaCauldron', 3],
      ['powderSnowCauldron1', 1],
      ['powderSnowCauldron2', 2],
      ['powderSnowCauldron3', 3],
    ]) {
      w.set(gap ? 0 : 1, 40, 1, type);
      if (gap) w.set(1, 40, 1, 'stone');
      for (let i = 0; i < 4; i++) w.redstone.tick(0.1, [], () => true);
      assert.equal(w.state(2, 40, 1).output, expected, `${gap} ${type}`);
    }
  }
});
test('negative-coordinate receivers retain one authoritative content state across unload, save and restore', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const w = room();
  w.generateChunk(-1, -1);
  feed(w, 'water', -1, 44, 3, -1);
  tick(w);
  assert.equal(w.get(-1, 40, -1), 'waterCauldron1');
  const saved = currentSave(w);
  assert.ok(validateSave(saved));
  w.unloadChunk(-1, -1);
  tick(w);
  w.generateChunk(-1, -1);
  assert.equal(w.get(-1, 40, -1), 'waterCauldron1');
  const restored = new World(624, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  restored.generateChunk(-1, -1);
  assert.equal(restored.get(-1, 40, -1), 'waterCauldron1');
  for (const bad of ['waterCauldron0', 'waterCauldron4', 'lavaCauldron1']) {
    const invalid = structuredClone(saved);
    invalid.dimensions.overworld.edits.find(([k]) => k === '5,40,5')[1] = bad;
    assert.throws(() => validateSave(invalid));
  }
  const p = axialToWorld(-1, -1);
  assert.equal(cauldronContact(restored, p.x, 40.32, p.z)?.liquid, 'water');
});
