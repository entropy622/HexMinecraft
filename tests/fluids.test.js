import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS } from '../src/core.js';
import { validateSave } from '../src/save.js';
const basin = () => {
  const w = new World(624, 'end', { load: false });
  w.ensureAround(0, 0, 1);
  w.blocks.clear();
  for (let q = -12; q <= 12; q++)
    for (let r = -12; r <= 12; r++)
      if (w.loaded(q, r)) w.set(q, 10, r, 'stone', false);
  w.fluids.active.clear();
  return w;
};
const run = (w, n = 100) => {
  for (let i = 0; i < n; i++) w.fluids.step(0.12, 2000);
};
test('water spreads through all six faces and drains after removing the source', () => {
  const w = basin();
  assert.equal(w.fluids.source(0, 11, 0, 'water'), true);
  run(w);
  for (const [q, r] of DIRECTIONS)
    assert.equal(w.fluids.get(q, 11, r)?.type, 'water');
  assert.equal(w.fluids.get(7, 11, 0)?.level, 7);
  assert.equal(w.fluids.get(8, 11, 0), undefined);
  assert.equal(w.fluids.scoop(1, 11, 0), null);
  assert.equal(w.fluids.scoop(0, 11, 0), 'water');
  run(w, 180);
  assert.equal(
    [...w.fluids.chunks.values()].reduce((n, c) => n + c.size, 0),
    0,
  );
});
test('falling water lands, walls block flow and removing a wall opens a channel', () => {
  const w = basin();
  w.fluids.source(0, 16, 0, 'water');
  run(w);
  assert.equal(w.fluids.get(0, 12, 0)?.falling, true);
  assert.equal(w.fluids.get(1, 15, 0), undefined);
  const b = basin();
  for (const [q, r] of DIRECTIONS) b.set(q, 11, r, 'brick');
  b.fluids.source(0, 11, 0, 'water');
  run(b);
  assert.equal(b.fluids.get(2, 11, 0), undefined);
  b.set(1, 11, 0, null);
  run(b);
  assert.equal(b.fluids.get(2, 11, 0)?.type, 'water');
  b.set(0, 11, 0, 'stone');
  run(b, 180);
  assert.equal(b.fluids.get(2, 11, 0), undefined);
});
test('lava cools to obsidian or stone, luminous coolant makes glowstone', () => {
  for (const [source, coolant, expected] of [
    [true, 'water', 'obsidian'],
    [false, 'water', 'stone'],
    [true, 'glow', 'glowstone'],
  ]) {
    const w = basin();
    w.fluids.write(0, 11, 0, {
      type: 'lava',
      source,
      level: source ? 0 : 1,
      falling: false,
    });
    w.fluids.source(1, 11, 0, coolant);
    run(w, 8);
    assert.equal(w.get(0, 11, 0), expected);
    assert.equal(w.fluids.get(0, 11, 0), undefined);
  }
});
test('liquid snapshots survive streaming and restore, with bounded step work', () => {
  const w = basin();
  for (let q = -5; q <= 14; q++)
    for (let r = -6; r <= 6; r++) w.set(q, 39, r, 'stone');
  w.fluids.source(7, 40, 0, 'glow');
  run(w);
  const before = w.fluids.get(8, 40, 0);
  assert.equal(before?.type, 'glow');
  const data = w.serialize();
  w.ensureAround(100, 100, 1);
  assert.equal(w.fluids.get(7, 40, 0), undefined);
  w.ensureAround(0, 0, 1);
  assert.equal(w.fluids.get(7, 40, 0)?.source, true);
  const restored = new World(624, 'end', { ...data, load: false });
  restored.ensureAround(0, 0, 1);
  assert.deepEqual(restored.fluids.get(8, 40, 0), before);
  assert.ok(w.fluids.step(0.12, 5) <= 5);
});
test('save validator accepts bucket hotbars and rejects invalid liquid state', () => {
  const w = basin();
  w.fluids.source(0, 30, 0, 'water');
  const save = {
    version: 2,
    seed: 624,
    dimension: 'end',
    dimensions: { end: { ...w.serialize(), crops: [], chests: [] } },
    inventory: { bucket: 2 },
    position: [0, 31, 0],
    tool: 0,
    creative: false,
    health: 20,
    hunger: 20,
    time: 100,
    hotbar: Array(9).fill('waterBucket'),
  };
  assert.doesNotThrow(() => validateSave(save));
  save.dimensions.end.fluids = [
    ['0,30,0', { type: 'lava', source: true, level: 9, falling: false }],
  ];
  assert.throws(() => validateSave(save));
});

test('natural seas use collectable sources, preserve removed cells and respect placed blocks', () => {
  const w = new World(624, 'overworld', { load: false });
  let site;
  for (let q = -200; q < 200 && !site; q++)
    for (let r = -200; r < 200; r++)
      if (w.terrainHeight(q, r) <= 5) {
        site = { q, r };
        break;
      }
  assert.ok(site);
  w.ensureAround(site.q, site.r, 1);
  assert.equal(w.fluids.get(site.q, 5, site.r)?.source, true);
  assert.equal(w.fluids.scoop(site.q, 5, site.r), 'water');
  const saved = w.serialize(),
    restored = new World(624, 'overworld', { ...saved, load: false });
  restored.ensureAround(site.q, site.r, 1);
  assert.equal(restored.fluids.get(site.q, 5, site.r), undefined);
  restored.set(site.q, 5, site.r, 'brick');
  run(restored, 20);
  assert.equal(restored.fluids.get(site.q, 5, site.r), undefined);
});
test('viscous lava advances more slowly than water and negative chunk seams reconnect', () => {
  const w = basin(),
    lava = basin();
  w.fluids.source(-1, 11, -1, 'water');
  lava.fluids.source(-1, 11, -1, 'lava');
  run(w, 2);
  run(lava, 2);
  assert.equal(w.fluids.get(0, 11, -1)?.type, 'water');
  assert.equal(lava.fluids.get(0, 11, -1), undefined);
  run(lava, 20);
  assert.equal(lava.fluids.get(0, 11, -1)?.type, 'lava');
});

test('streaming dry neighbors wakes a frozen frontier and void waterfalls do not form a floor', () => {
  const w = new World(624, 'end', { load: false });
  w.ensureAround(0, 0, 0);
  for (let q = 0; q < 24; q++)
    for (let r = -8; r < 16; r++) w.set(q, 39, r, 'stone');
  w.fluids.source(6, 40, 4, 'water');
  run(w, 20);
  assert.equal(w.fluids.get(8, 40, 4), undefined);
  w.ensureAround(8, 0, 1);
  run(w, 60);
  assert.equal(w.fluids.get(8, 40, 4)?.type, 'water');
  const voidWorld = basin();
  voidWorld.blocks.clear();
  voidWorld.fluids.source(0, 4, 0, 'water');
  run(voidWorld, 80);
  assert.equal(voidWorld.fluids.get(0, 1, 0)?.type, 'water');
  assert.equal(voidWorld.fluids.get(1, 1, 0), undefined);
});
