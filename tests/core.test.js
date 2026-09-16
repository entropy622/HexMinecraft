import test from 'node:test';
import assert from 'node:assert/strict';
import {
  World,
  DIRECTIONS,
  axialToWorld,
  worldToAxial,
  hexDistance,
  RECIPES,
  craft,
  canCraft,
  validateSave,
} from '../src/core.js';
test('axial coordinates round-trip across positive and negative cells', () => {
  for (let q = -35; q <= 35; q++)
    for (let r = -35; r <= 35; r++) {
      const p = axialToWorld(q, r);
      assert.deepEqual(worldToAxial(p.x, p.z), { q: q || 0, r: r || 0 });
    }
});
test('each hexagon has six equally spaced adjacent cells', () => {
  for (const [q, r] of DIRECTIONS) {
    assert.equal(hexDistance(q, r), 1);
    const p = axialToWorld(q, r);
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - Math.sqrt(3)) < 1e-9);
  }
});
test('world generation is deterministic and seeds change terrain', () => {
  const a = new World(624),
    b = new World(624),
    c = new World(625);
  assert.deepEqual(a.blocks, b.blocks);
  assert.notDeepEqual(a.heights, c.heights);
  assert.equal(a.beacons.length, 3);
  for (const beacon of a.beacons) {
    assert.equal(a.get(beacon.q, beacon.y - 1, beacon.r), 'brick');
    assert.equal(a.get(beacon.q - 3, beacon.y - 1, beacon.r), 'crystal');
  }
  assert.ok([...a.blocks.values()].includes('iron'));
  assert.ok([...a.blocks.values()].includes('coal'));
});
test('edits persist both placement and removal', () => {
  const a = new World(12);
  a.set(0, 1, 0, null);
  a.set(1, 22, 0, 'planks');
  const b = new World(12);
  b.applyEdits([...a.edits]);
  assert.equal(b.get(0, 1, 0), undefined);
  assert.equal(b.get(1, 22, 0), 'planks');
  assert.deepEqual(a.blocks, b.blocks);
});
test('crafting consumes exact costs, honors station and progression, and is atomic', () => {
  const inv = { wood: 10, stone: 10 };
  assert.equal(craft(RECIPES[0], inv), true);
  assert.equal(inv.wood, 8);
  assert.equal(inv.planks, 8);
  const pick = RECIPES.find((r) => r.id === 'pick2'),
    before = { ...inv };
  assert.equal(craft(pick, inv, 0, true), false);
  assert.deepEqual(inv, before);
  assert.equal(craft(pick, inv, 1, false), false);
  assert.deepEqual(inv, before);
  assert.equal(craft(pick, inv, 1, true), true);
  assert.equal(inv.stone, 5);
  assert.equal(inv.wood, 6);
  assert.equal(canCraft(pick, inv, 2), false);
});
test('seven-slot honeycomb ingredient counts match actual recipe costs', () => {
  for (const r of RECIPES) {
    assert.equal(r.pattern.length, 7);
    const counted = {};
    for (const id of r.pattern) if (id) counted[id] = (counted[id] || 0) + 1;
    assert.deepEqual(counted, r.cost);
  }
});
const valid = () => ({
  version: 1,
  seed: 624,
  edits: [['1,2,3', 'stone']],
  inventory: { wood: 4 },
  position: [0, 10, 0],
  activated: [0],
  tool: 1,
  creative: false,
});
test('save validator rejects corrupt or unbounded data', () => {
  assert.equal(validateSave(valid()).seed, 624);
  for (const override of [
    { version: 2 },
    { seed: -1 },
    { edits: [['0,0,0', null]] },
    { edits: [['NaN,2,3', 'stone']] },
    { edits: [['1,99,3', 'stone']] },
    { inventory: { wood: -1 } },
    { inventory: { script: 1 } },
    { position: [Infinity, 0, 0] },
    { activated: [0, 0] },
    { health: 999 },
    { tool: 10 },
    { hotbar: ['stone'] },
  ])
    assert.throws(() => validateSave({ ...valid(), ...override }));
});
