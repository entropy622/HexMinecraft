import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { DIRECTIONS, axialToWorld, key } from '../src/core.js';
import { findFloor } from '../src/grounding.js';
import { touchesWeb } from '../src/cobwebs.js';
import { miningStats, miningRate } from '../src/mining.js';
import { miningLoot } from '../src/mining-loot.js';
import { Survival, validSurvival } from '../src/survival.js';
import { Fauna } from '../src/fauna.js';

// Failure classes are specified before implementation in mineshafts-verification.md.
function reachable(w, s) {
  const start = [s.q, s.y + 1, s.r],
    queue = [start],
    seen = new Set([key(...start)]);
  for (let i = 0; i < queue.length; i++) {
    const [q, y, r] = queue[i];
    for (const [dq, dr] of DIRECTIONS) {
      const col = s.mine.columns.get(`${q + dq},${r + dr}`);
      if (!col) continue;
      const p = axialToWorld(col.q, col.r),
        floor = findFloor(w, p.x, p.z, y, {
          step: 1.05,
          drop: 1.05,
          height: 1.8,
          radius: 0.24,
          wet: true,
        });
      if (floor === null) continue;
      const k = key(col.q, floor, col.r);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([col.q, floor, col.r]);
    }
  }
  return seen;
}

test('natural mine exits and loot are walkable across seeds and negative chunk seams', () => {
  let count = 0;
  for (const seed of [624, 129, 404]) {
    const search = new World(seed, 'overworld', { load: false }),
      mines = search
        .structures(0, 0, 320)
        .filter((s) => s.kind === 'mine')
        .slice(0, 2);
    for (const s of mines) {
      const w = new World(seed, 'overworld', { load: false });
      w.ensureAround(s.q, s.r, 4);
      const seen = reachable(w, s),
        exit = s.mine.entrance.at(-1);
      assert.ok(
        seen.has(key(exit.q, exit.floor + 1, exit.r)),
        `${seed}/${s.id}: exit`,
      );
      for (const p of s.mine.loot) {
        assert.equal(w.get(p.q, p.y, p.r), 'chest');
        assert.equal(w.solid(p.q, p.y + 1, p.r), false);
        assert.ok(
          DIRECTIONS.some(([dq, dr]) => seen.has(key(p.q + dq, p.y, p.r + dr))),
          `${seed}/${s.id}: chest`,
        );
      }
      assert.equal(
        w.get(s.mine.nest.q, s.mine.nest.y, s.mine.nest.r),
        'spawner',
      );
      assert.ok(s.mine.paths.length >= 3);
      count++;
    }
  }
  assert.ok(count >= 5);
});

test('streaming order preserves the generated mine and saved mining/placement edits', () => {
  const a = new World(624, 'overworld', { load: false }),
    b = new World(624, 'overworld', { load: false }),
    s = a.structures(0, 0, 160).find((s) => s.kind === 'mine'),
    chunks = new Set();
  for (const p of s.mine.columns.values())
    chunks.add(`${Math.floor(p.q / 8)},${Math.floor(p.r / 8)}`);
  const order = [...chunks].map((k) => k.split(',').map(Number));
  for (const [q, r] of order) a.generateChunk(q, r);
  for (const [q, r] of [...order].reverse()) b.generateChunk(q, r);
  for (const p of s.mine.columns.values())
    for (let y = p.floor; y <= p.ceiling + 1; y++)
      assert.equal(
        a.get(p.q, y, p.r),
        b.get(p.q, y, p.r),
        `seam ${p.q},${y},${p.r}`,
      );
  const web = [...a.blocks]
      .find(([, t]) => t === 'cobweb')[0]
      .split(',')
      .map(Number),
    chest = s.mine.loot[0];
  a.set(...web, null);
  a.set(chest.q, chest.y, chest.r, 'brick');
  const restored = new World(624, 'overworld', {
    load: false,
    ...JSON.parse(JSON.stringify(a.serialize())),
  });
  for (const [q, r] of order) restored.generateChunk(q, r);
  assert.equal(restored.get(...web), undefined);
  assert.equal(restored.get(chest.q, chest.y, chest.r), 'brick');
});

test('webs have no solid collision, touch the actual body and obey sword/shears/fluid drops', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(-8, -8, 1);
  const p = axialToWorld(-8, -8);
  w.set(-8, 39, -8, 'stone');
  w.set(-8, 40, -8, 'cobweb');
  assert.equal(w.columnSolid(p.x, p.z, 40.02, 41.78), false);
  assert.equal(touchesWeb(w, p.x, 40, p.z, 1.8, 0.24), true);
  assert.equal(touchesWeb(w, p.x, 41.1, p.z, 1.5, 0.24), false);
  assert.equal(touchesWeb(w, p.x + 2, 40, p.z, 1.8, 0.24), false);
  for (const tool of ['sword', 'shears']) {
    const stats = miningStats('cobweb', tool);
    assert.equal(stats.harvest, true);
    assert.ok(Math.abs(4 / miningRate(stats) - 0.4) < 1e-8);
    assert.equal(
      miningLoot('cobweb', { tool }).stacks[0].item,
      tool === 'sword' ? 'string' : 'cobweb',
    );
  }
  const bare = miningStats('cobweb', null);
  assert.equal(4 / miningRate(bare), 20);
  assert.deepEqual(miningLoot('cobweb', { harvest: bare.harvest }).stacks, []);
  assert.equal(w.fluids.source(-8, 40, -8, 'water'), true);
  assert.equal(w.get(-8, 40, -8), undefined);
  assert.deepEqual([...w.fluids.washedWebs], ['-8,40,-8']);
  assert.equal(w.fluids.source(-8, 40, -8, 'water'), false);
  assert.equal(w.fluids.washedWebs.size, 1);
  w.set(-6, 40, -8, 'cobweb');
  w.fluids.source(-6, 40, -8, 'lava');
  assert.equal(w.get(-6, 40, -8), undefined);
  assert.equal(w.fluids.washedWebs.size, 1);
});

test('mine nest spawns cave spiders, light suppresses it and the small body fits a half-height gap', () => {
  const w = new World(624, 'overworld', { load: false }),
    s = w.structures(0, 0, 160).find((s) => s.kind === 'mine');
  w.ensureAround(s.q, s.r, 3);
  const f = new Fauna(new THREE.Scene(), null, {
    damage() {},
    drop() {},
    experience() {},
    notice() {},
  });
  f.load(w);
  const n = s.mine.nest,
    p = axialToWorld(n.q, n.r),
    camera = new THREE.PerspectiveCamera();
  camera.position.set(p.x + 3, n.y + 1.65, p.z);
  const random = Math.random;
  let seed = 702;
  try {
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    f.update(0, 200, camera, [], false);
    const spiders = f.active.filter((m) => m.kind === 'caveSpider');
    assert.ok(spiders.length > 0);
    const count = spiders.length;
    w.set(n.q, n.y + 1, n.r, 'torch');
    f.update(8.1, 200, camera, [], false);
    assert.equal(f.active.filter((m) => m.kind === 'caveSpider').length, count);
    assert.ok(spiders[0].mesh.scale.x < 0.75);
  } finally {
    Math.random = random;
  }
  const c = axialToWorld(s.q, s.r);
  w.set(s.q, 39, s.r, 'stone');
  w.set(s.q, 40, s.r, 'stoneSlab');
  w.setState(s.q, 40, s.r, { facing: 0, open: false, upper: true });
  assert.equal(f.floor(c.x, c.z, 40, 'caveSpider'), 40);
  assert.equal(f.floor(c.x, c.z, 40, 'spider'), null);
});

test('poison damage is partition independent, survives saves, stops at one and milk clears it', () => {
  const a = new Survival(),
    b = new Survival(),
    v = { health: 20, hunger: 20 },
    u = { ...v };
  a.applyEffect('poison', 7);
  b.applyEffect('poison', 7);
  a.tickEffects(2.2, v);
  const restored = new Survival(JSON.parse(JSON.stringify(a.serialize())));
  assert.equal(validSurvival(restored.serialize()), true);
  restored.tickEffects(4.8, v);
  for (let i = 0; i < 700; i++) b.tickEffects(0.01, u);
  assert.equal(v.health, u.health);
  assert.ok(v.health < 20);
  const shielded = new Survival({ absorption: 4, absorptionTime: 120 }),
    hearts = { health: 20, hunger: 20 };
  shielded.applyEffect('poison', 7);
  shielded.tickEffects(2.2, hearts);
  assert.equal(hearts.health, 20);
  assert.ok(shielded.absorption < 4);
  restored.applyEffect('poison', 45, 2);
  restored.tickEffects(45, v);
  assert.equal(v.health, 1);
  restored.applyEffect('poison', 7);
  restored.eat('milkBucket', v);
  restored.tickEffects(4, v);
  assert.equal(v.health, 1);
  assert.deepEqual(restored.effects, {});
});
