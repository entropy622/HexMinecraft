import test from 'node:test';
import assert from 'node:assert/strict';
import { Survival, Freezing } from '../src/survival.js';
import { World } from '../src/world.js';
import { cauldronAction } from '../src/cauldron-data.js';
import { powderContact, powderSupport } from '../src/powder-snow.js';
import { axialToWorld } from '../src/core.js';
import { miningLoot } from '../src/mining-loot.js';

// Failure modes were written before implementation in the verification record:
// threshold/pulse timing, frame partitioning, thaw/protection/pause; container
// levels; deterministic negative seams; and real fluid removal without drops.
test('freezing uses elapsed exposure and delayed pulses, thaws and pauses independently of frame partition', () => {
  for (const count of [20, 200, 600]) {
    const frost = new Freezing();
    let damage = 0;
    for (let i = 0; i < count; i++) damage += frost.tick(10 / count, true);
    assert.equal(damage, 1);
    assert.equal(frost.time, 7);
    assert.ok(Math.abs(frost.pulse - 1) < 1e-6);
    assert.equal(frost.tick(0, true), 0);
    assert.equal(frost.time, 7);
    assert.equal(frost.tick(2, false), 0);
    assert.equal(frost.time, 3);
    assert.equal(frost.pulse, 0);
    frost.reset();
    assert.equal(frost.time, 0);
  }
  const s = new Survival(),
    vitals = { health: 20, hunger: 10 };
  assert.deepEqual(s.tick(7, vitals, { powder: true, insulated: false }), []);
  assert.deepEqual(s.tick(1, vitals, { powder: true, insulated: false }), []);
  assert.deepEqual(s.tick(1, vitals, { powder: true, insulated: false }), [
    [1, 'freeze'],
  ]);
  assert.deepEqual(s.tick(1, vitals, { powder: true, insulated: true }), []);
  assert.equal(s.frost.time, 5);
});

test('powder snow cauldrons retain three levels and buckets exchange a full volume without bottle access', () => {
  for (const level of [1, 2, 3]) {
    const type = `powderSnowCauldron${level}`;
    assert.deepEqual(
      cauldronAction(type, 'bucket'),
      level === 3 ? { type: 'cauldron', item: 'powderSnowBucket' } : null,
    );
    for (const bottle of ['glassBottle', 'waterBottle'])
      assert.equal(cauldronAction(type, bottle), null);
    assert.deepEqual(cauldronAction(type, 'powderSnowBucket'), {
      type: 'powderSnowCauldron3',
      item: 'bucket',
    });
  }
  assert.deepEqual(cauldronAction('waterCauldron2', 'powderSnowBucket'), {
    type: 'powderSnowCauldron3',
    item: 'bucket',
  });
  assert.deepEqual(cauldronAction('powderSnowCauldron2', 'waterBucket'), {
    type: 'waterCauldron3',
    item: 'bucket',
  });
  assert.deepEqual(
    miningLoot('powderSnow', { tool: 'shovel', enchant: { silkTouch: 1 } }),
    { stacks: [], xp: 0 },
  );
});

test('naturally generated powder patches are deterministic at negative seams and do not become solid body walls', () => {
  const world = new World(624, 'overworld', { load: false });
  let site;
  for (let q = -96; q < 0 && !site; q += 8)
    for (let r = -96; r <= 96; r += 8) {
      if (world.biome(q, r) !== '雪原') continue;
      world.generateChunk(Math.floor(q / 8), Math.floor(r / 8));
      site = [...world.blocks].find(
        ([k, t]) => t === 'powderSnow' && Number(k.split(',')[0]) < 0,
      );
      if (site) break;
    }
  assert.ok(site, 'A real snowy seed must contain an accessible powder patch');
  const [q, y, r] = site[0].split(',').map(Number),
    p = axialToWorld(q, r);
  assert.equal(world.solid(q, y, r), false);
  assert.equal(world.pointSolid(p.x, y + 0.5, p.z), false);
  assert.ok(
    powderContact(world, p.x, y + 0.1, p.z, 1).some(
      (c) => c.join(',') === site[0],
    ),
  );
  assert.equal(powderSupport(world, p.x, y + 0.9, p.z, y + 1.01), true);
  assert.equal(powderSupport(world, p.x, y + 0.1, p.z, y + 0.5), false);
  const cq = Math.floor(q / 8),
    cr = Math.floor(r / 8);
  world.unloadChunk(cq, cr);
  world.generateChunk(cq, cr);
  assert.equal(world.get(q, y, r), 'powderSnow');
  world.set(q, y, r, 'stone');
  world.unloadChunk(cq, cr);
  world.generateChunk(cq, cr);
  assert.equal(world.get(q, y, r), 'stone');
});

test('real fluid placement removes powder snow without web loot and leaves ordinary snow solid', () => {
  for (const type of ['water', 'lava', 'glow']) {
    const w = new World(624, 'overworld', { load: false });
    w.generateChunk(0, 0);
    w.fluids.load(0, 0);
    w.set(0, 40, 0, 'powderSnow');
    assert.equal(w.fluids.source(0, 40, 0, type), true);
    assert.equal(w.get(0, 40, 0), undefined);
    assert.equal(w.fluids.get(0, 40, 0).type, type);
    assert.ok(w.fluids.blockChanges.has('0,40,0'));
    assert.equal(w.fluids.washedWebs.size, 0);
    w.set(1, 40, 0, 'snow');
    assert.equal(w.solid(1, 40, 0), true);
    assert.equal(w.fluids.source(1, 40, 0, type), false);
  }
});
