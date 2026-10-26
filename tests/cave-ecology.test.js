import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, chunkKey } from '../src/world.js';
import { axialToWorld } from '../src/core.js';
import {
  canHang,
  harvestCavePlant,
  tickCavePlants,
} from '../src/cave-plants.js';
import { batClear, spawnCaveBats, updateBat } from '../src/bats.js';
import { Fauna } from '../src/fauna.js';
import { VoxelLight } from '../src/voxel-light.js';
import { validateSave } from '../src/save.js';
import { currentSave } from './fixtures/current-save.js';

// Failure modes are listed in docs/cave-ecology-verification.md. These exercise
// chunk/physics/serialization boundaries that UI alone cannot cover quickly.
function room() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  for (let q = -3; q <= 3; q++)
    for (let r = -3; r <= 3; r++)
      for (let y = 20; y <= 52; y++) w.set(q, y, r, null);
  return w;
}
function chain(w, q = 0, r = 0) {
  w.set(q, 45, r, 'stone');
  w.set(q, 44, r, 'caveVines');
  w.set(q, 43, r, 'caveVinesBerries');
  w.set(q, 42, r, 'caveVinesBerries');
}
test('harvest preserves a chain; unsupported or flooded vines drop fruit once and restore edits', () => {
  const w = room();
  chain(w);
  assert.equal(harvestCavePlant(w, 0, 43, 0, true).drops.length, 1);
  assert.equal(w.get(0, 42, 0), 'caveVinesBerries');
  assert.equal(harvestCavePlant(w, 0, 43, 0, true).drops.length, 0);
  w.set(0, 45, 0, null);
  const result = tickCavePlants(w, 0);
  assert.equal(result.changed.length, 3);
  assert.equal(result.drops.length, 1);
  assert.equal(tickCavePlants(w, 0).drops.length, 0);
  chain(w, 1);
  assert.ok(w.fluids.source(1, 43, 0, 'water'));
  const flooded = tickCavePlants(w, 0);
  assert.equal(w.get(1, 44, 0), 'caveVines');
  assert.equal(w.get(1, 43, 0), undefined);
  assert.equal(flooded.drops.length, 2);
  const copy = new World(624, 'overworld', { ...w.serialize(), load: false });
  copy.ensureAround(0, 0, 1);
  assert.equal(copy.get(0, 43, 0), undefined);
  assert.equal(copy.get(1, 44, 0), 'caveVines');
  assert.ok(validateSave(currentSave(w)));
});
test('growth respects attachment faces, maximum length, obstructions and unloaded chunks', () => {
  const w = room();
  chain(w);
  w.set(2, 45, 0, 'planksSlab');
  w.setState(2, 45, 0, { upper: true });
  assert.equal(canHang(w, 2, 44, 0, true), false);
  w.setState(2, 45, 0, { upper: false });
  assert.equal(canHang(w, 2, 44, 0, true), true);
  w.set(2, 45, 0, 'ladder');
  assert.equal(canHang(w, 2, 44, 0, true), false);
  const random = Math.random;
  Math.random = () => 0;
  try {
    const growth = tickCavePlants(w, 1);
    assert.ok(growth.changed.some((p) => p.q === 0 && p.y === 41));
    w.set(0, 40, 0, 'stone');
    assert.equal(tickCavePlants(w, 1).changed.length, 0);
    w.set(1, 51, 0, 'stone');
    for (let y = 50; y >= 25; y--) w.set(1, y, 0, 'caveVines');
    assert.equal(tickCavePlants(w, 1).changed.length, 0);
    assert.equal(w.get(1, 24, 0), undefined);
    const ck = chunkKey(0, 0).split(',').map(Number);
    w.unloadChunk(...ck);
    const edits = [...w.edits];
    tickCavePlants(w, 1000);
    assert.deepEqual([...w.edits], edits);
    w.generateChunk(...ck);
    assert.equal(w.get(1, 25, 0), 'caveVines');
  } finally {
    Math.random = random;
  }
});
test('berries transport colored light; harvesting removes it and flowers emit none', () => {
  const w = room();
  chain(w);
  w.set(0, 42, 0, null);
  w.set(1, 44, 0, 'sporeBlossom');
  const field = new VoxelLight(w);
  field.update(0, true);
  const sample = () => field.rgb.map((c) => c[field.index(0, 42, 0)]);
  assert.deepEqual(sample(), [13, 9, 4]);
  harvestCavePlant(w, 0, 43, 0, true);
  field.update(0, true);
  assert.deepEqual(sample(), [0, 0, 0]);
});

test('bat body clearance rejects water and solids and ambience reuses its GPU resources on reset', async () => {
  const w = room(),
    p = new THREE.Vector3(0, 40, 0);
  assert.equal(batClear(w, p), true);
  w.set(0, 40, 0, 'stone');
  assert.equal(batClear(w, p), false);
  w.set(0, 40, 0, null);
  w.fluids.source(0, 40, 0, 'water');
  assert.equal(batClear(w, p), false);
  const { CaveAmbience } = await import('../src/cave-ambience.js');
  const scene = new THREE.Scene(),
    particles = new CaveAmbience(scene),
    camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 40, 0);
  w.set(1, 42, 0, 'sporeBlossom');
  particles.frame(0.1, 0, w, camera);
  assert.equal(particles.geometry.drawRange.count, 16);
  const geometry = particles.geometry;
  particles.clear();
  assert.equal(geometry.drawRange.count, 0);
  w.clearLoaded();
  particles.frame(0.1, 1, w, camera);
  assert.equal(particles.geometry, geometry);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(scene.children.length, 1);
  particles.geometry.dispose();
  particles.material.dispose();
});
test('cave bats roost, wake, fly without crossing solid/fluid boundaries and never persist or grant loot', () => {
  const w = new World(624, 'overworld', { load: false }),
    c = w.caves(0, 0, 160).find((c) => c.kind === 'lush');
  w.ensureAround(c.q, c.r, 3);
  const p = axialToWorld(c.q, c.r),
    camera = new THREE.PerspectiveCamera();
  camera.position.set(p.x, c.floor + 2.6, p.z);
  const drops = [],
    xp = [],
    f = new Fauna(new THREE.Scene(), null, {
      drop: (...v) => drops.push(v),
      experience: (v) => xp.push(v),
    });
  f.load(w);
  spawnCaveBats(f, camera);
  assert.equal(f.active.length, 2);
  assert.ok(f.active.every((m) => m.resting));
  spawnCaveBats(f, camera);
  assert.equal(f.active.length, 2);
  assert.equal(f.serialize().mobs.length, 0);
  const bat = f.active[0],
    start = bat.mesh.position.clone();
  camera.position.copy(start).add(new THREE.Vector3(1, -0.3, 0));
  updateBat(f, bat, 0.05, 0, camera);
  assert.equal(bat.resting, false);
  let excursion = 0;
  for (let i = 0; i < 800; i++) {
    bat.think -= 0.05;
    bat.flee = Math.max(0, bat.flee - 0.05);
    updateBat(f, bat, 0.05, i * 0.05, camera);
    assert.ok(batClear(w, bat.mesh.position));
    excursion = Math.max(excursion, start.distanceTo(bat.mesh.position));
  }
  assert.ok(excursion > 0.5);
  // A real narrow chamber makes the roost transition repeatable while keeping
  // collision and generated-world geometry in use. Random is a host boundary.
  camera.position.set(p.x + 50, 30, p.z + 50);
  const random = Math.random;
  let seed = 821;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    bat.flee = 0;
    bat.think = 0;
    for (let i = 0; i < 2000 && !bat.resting; i++) {
      bat.think -= 0.05;
      updateBat(f, bat, 0.05, i * 0.05, camera);
    }
  } finally {
    Math.random = random;
  }
  assert.ok(bat.resting, 'quiet bat returns to a ceiling');
  assert.ok(f.interact(bat, 'apple').message.includes('蝙蝠'));
  f.hit(bat, 100, null, true);
  assert.deepEqual(drops, []);
  assert.equal(
    xp.reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(f.serialize().mobs.length, 0);
  for (const m of [...f.active]) f.remove(m);
});
