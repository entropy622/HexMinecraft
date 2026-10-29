import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, chunkKey } from '../src/world.js';
import { axialToWorld } from '../src/core.js';
import { buildingParts, insidePart } from '../src/building-shapes.js';
import { buildingMesh } from '../src/building-graphics.js';
import { partSpan } from '../src/shape-columns.js';
import {
  pointedSupport,
  pointedTip,
  tickDripstone,
  spikeAtFeet,
  spikeLandingDamage,
} from '../src/dripstone.js';
import { validateSave } from '../src/save.js';
import { validFalling } from '../src/gravity.js';
import { currentSave } from './fixtures/current-save.js';

// Failure modes are listed in docs/dripstone-verification.md. Real world,
// geometry raycasts, physics and serializers are used throughout.
function room() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 2);
  for (let q = -3; q <= 3; q++)
    for (let r = -3; r <= 3; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 55; y++) w.set(q, y, r, null);
    }
  return w;
}
function put(w, q, y, r, down) {
  w.set(q, y, r, 'pointedDripstone');
  w.setState(q, y, r, { facing: 0, open: false, upper: down });
}

test('tapered meshes, point tests and support spans agree for both orientations', () => {
  const w = room(),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const down of [false, true]) {
    put(w, 0, 40, 0, down);
    const part = buildingParts(w, 0, 40, 0, true)[0],
      mesh = buildingMesh(
        w,
        0,
        40,
        0,
        { x: 0, z: 0 },
        { uv: (_, u, v) => [u, v] },
        material,
      );
    mesh.updateMatrixWorld();
    let checked = 0;
    for (let x = -0.25; x <= 0.25; x += 0.025)
      for (let z = -0.25; z <= 0.25; z += 0.025) {
        const span = partSpan(x, z, part),
          hits = new THREE.Raycaster(
            new THREE.Vector3(x, 42, z),
            new THREE.Vector3(0, -1, 0),
          ).intersectObject(mesh);
        assert.equal(!!span, hits.length > 0, `${down}: ${x},${z}`);
        if (!span) continue;
        checked++;
        assert.ok(Math.abs(hits[0].point.y - 40 - span[1]) < 1e-5);
        assert.equal(insidePart(x, (span[0] + span[1]) / 2, z, part), true);
        assert.equal(insidePart(x, span[1] + 0.01, z, part), false);
      }
    assert.ok(checked > 50);
    assert.equal(w.columnSolid(0.65, 0, 40, 41), false);
    mesh.geometry.dispose();
  }
  material.dispose();
});

test('natural dripstone and source pockets are deterministic, anchored, and editable after streaming', () => {
  const a = new World(624, 'overworld', { load: false }),
    b = new World(624, 'overworld', { load: false }),
    c = a.caves(0, 0, 160).find((c) => c.kind === 'dripstone');
  assert.ok(c);
  const chunks = [];
  for (let q = Math.floor(c.q / 8) - 2; q <= Math.floor(c.q / 8) + 2; q++)
    for (let r = Math.floor(c.r / 8) - 2; r <= Math.floor(c.r / 8) + 2; r++)
      chunks.push([q, r]);
  chunks.forEach(([q, r]) => a.generateChunk(q, r));
  chunks.reverse().forEach(([q, r]) => b.generateChunk(q, r));
  assert.deepEqual(a.blocks, b.blocks);
  assert.deepEqual(a.naturalStates, b.naturalStates);
  assert.deepEqual(
    [...a.fluids.chunks].sort().map(([k, v]) => [k, [...v].sort()]),
    [...b.fluids.chunks].sort().map(([k, v]) => [k, [...v].sort()]),
  );
  assert.ok(a.dripstoneCells.size > 10);
  for (const k of a.dripstoneCells) {
    const [q, y, r] = k.split(',').map(Number);
    assert.ok(pointedSupport(a, q, y, r, !!a.state(q, y, r).upper), k);
  }
  const k = [...a.dripstoneCells][0],
    [q, y, r] = k.split(',').map(Number);
  a.set(q, y, r, null);
  const ck = chunkKey(q, r).split(',').map(Number);
  a.unloadChunk(...ck);
  a.generateChunk(...ck);
  assert.equal(a.get(q, y, r), undefined);
  assert.ok(validateSave(currentSave(a)));
});

test('unsupported chains fall or break once, freeze unloaded, and restore in flight', () => {
  const w = room();
  w.set(0, 48, 0, 'stone');
  for (let y = 45; y <= 47; y++) put(w, 0, y, 0, true);
  const drops = [],
    impacts = [],
    callbacks = {
      canPlace: () => true,
      drop: (...v) => drops.push(v),
      impact: (...v) => impacts.push(v),
    };
  w.gravity.tick(0.05, callbacks);
  assert.equal(
    w.gravity.active.filter((b) => b.type === 'pointedDripstone').length,
    0,
  );
  w.set(0, 48, 0, null);
  w.gravity.tick(0.05, callbacks);
  assert.equal(
    w.gravity.active.filter((b) => b.type === 'pointedDripstone').length,
    3,
  );
  assert.ok(validFalling(w.gravity.serialize()));
  const copy = new World(624, 'overworld', { ...w.serialize(), load: false });
  copy.ensureAround(0, 0, 2);
  assert.ok(validateSave(currentSave(copy)));
  const ck = chunkKey(0, 0).split(',').map(Number),
    frozen = copy.gravity
      .serialize()
      .filter((b) => b.type === 'pointedDripstone');
  copy.unloadChunk(...ck);
  copy.gravity.tick(10, callbacks);
  assert.deepEqual(
    copy.gravity.serialize().filter((b) => b.type === 'pointedDripstone'),
    frozen,
  );
  copy.generateChunk(...ck);
  for (let i = 0; i < 100; i++) copy.gravity.tick(0.1, callbacks);
  assert.equal(
    copy.gravity.active.filter((b) => b.type === 'pointedDripstone').length,
    0,
  );
  assert.equal(drops.filter((v) => v[0] === 'pointedDripstone').length, 3);
  assert.equal(impacts.length, 3);
  assert.ok(impacts.every((v) => v[2] > 0));
  assert.equal(copy.get(0, 40, 0), undefined);
  put(copy, 1, 40, 0, false);
  put(copy, 1, 41, 0, false);
  copy.set(1, 39, 0, null);
  for (let i = 0; i < 4; i++) copy.gravity.tick(0.05, callbacks);
  assert.equal(drops.filter((v) => v[0] === 'pointedDripstone').length, 5);
  assert.equal(copy.get(1, 41, 0), undefined);
  copy.gravity.tick(1, callbacks);
  assert.equal(drops.filter((v) => v[0] === 'pointedDripstone').length, 5);
});

test('recent support loss is processed ahead of a large placed-block gravity backlog', () => {
  const w = room();
  for (let q = -9; q <= 9; q++)
    for (let r = -9; r <= 9; r++) {
      w.set(q, 32, r, 'stone');
      w.set(q, 33, r, 'gravel');
    }
  put(w, 0, 40, 0, false);
  put(w, 0, 41, 0, false);
  w.set(0, 40, 0, null);
  assert.ok(w.gravity.pending.size > 300);
  const drops = [];
  w.gravity.tick(0.01, { canPlace: () => true, drop: (...p) => drops.push(p) });
  assert.equal(w.get(0, 41, 0), undefined);
  assert.equal(drops.filter((p) => p[0] === 'pointedDripstone').length, 1);
});

test('sharp tips hurt real landings, merged columns do not, and partial faces attach correctly', () => {
  const w = room();
  put(w, 0, 40, 0, false);
  const tip = buildingParts(w, 0, 40, 0)[0];
  assert.ok(spikeAtFeet(w, tip.x, 41, tip.z));
  assert.ok(spikeLandingDamage(-9) > 0);
  assert.equal(spikeLandingDamage(-0.4), 0);
  w.set(0, 42, 0, 'stone');
  put(w, 0, 41, 0, true);
  assert.equal(pointedTip(w, 0, 40, 0), false);
  assert.equal(spikeAtFeet(w, 0, 41, 0), false);
  w.set(1, 43, 0, 'planksSlab');
  w.setState(1, 43, 0, { facing: 0, open: false, upper: false });
  assert.equal(pointedSupport(w, 1, 42, 0, true), true);
  assert.equal(pointedSupport(w, 1, 44, 0, false), false);
  w.setState(1, 43, 0, { facing: 0, open: false, upper: true });
  assert.equal(pointedSupport(w, 1, 42, 0, true), false);
  assert.equal(pointedSupport(w, 1, 44, 0, false), true);
});

test('water-fed growth obeys length, body occupancy, fluid paths and loaded simulation', () => {
  const w = room();
  w.set(0, 48, 0, 'dripstoneBlock');
  put(w, 0, 47, 0, true);
  w.fluids.source(0, 49, 0, 'water');
  const random = Math.random;
  Math.random = () => 0;
  try {
    assert.equal(tickDripstone(w, 1, () => true).length, 0);
    assert.equal(tickDripstone(w, 1).length, 1);
    assert.equal(w.get(0, 46, 0), 'pointedDripstone');
    for (let i = 0; i < 20; i++) tickDripstone(w, 1);
    assert.equal(w.get(0, 40, 0), undefined);
    assert.equal(w.get(0, 41, 0), 'pointedDripstone');
    assert.equal(tickDripstone(w, 0).length, 0);
    for (let y = 41; y <= 46; y++) w.set(0, y, 0, null);
    let index = 0;
    Math.random = () => (index++ % 2 ? 0.75 : 0);
    assert.equal(tickDripstone(w, 1).length, 1);
    assert.equal(w.get(0, 40, 0), 'pointedDripstone');
    assert.equal(w.state(0, 40, 0).upper, false);
    w.fluids.source(0, 44, 0, 'water');
    assert.equal(tickDripstone(w, 1).length, 0);
    w.unloadChunk(0, 0);
    const edits = [...w.edits];
    tickDripstone(w, 1e6);
    assert.deepEqual([...w.edits], edits);
  } finally {
    Math.random = random;
  }
});
