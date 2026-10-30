import test from 'node:test';
import assert from 'node:assert/strict';
import { treeCells } from '../src/tree-layout.js';
import { World } from '../src/world.js';
import { DIRECTIONS, BLOCKS, hexDistance, key } from '../src/core.js';
import { treePlan } from '../src/farming.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';

const neighbors = ([q, y, r]) => [
  ...DIRECTIONS.map(([dq, dr]) => [q + dq, y, r + dr]),
  [q, y - 1, r],
  [q, y + 1, r],
];
test('broadleaf crowns vary in height and silhouette while every branch and leaf has real face-connected support', () => {
  const heights = new Set();
  let branches = 0;
  for (const species of ['oak', 'birch'])
    for (let q = -40; q < 40; q += 3) {
      const cells = treeCells(species, q, 10, -7, 624),
        byKey = new Map(cells.map((c) => [key(...c.slice(0, 3)), c])),
        logs = cells.filter((c) => BLOCKS[c[3]].log),
        connected = new Set(),
        queue = [[q, 10, -7]];
      assert.equal(byKey.size, cells.length);
      assert.deepEqual(cells, treeCells(species, q, 10, -7, 624));
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i],
          k = key(...p);
        if (connected.has(k) || !BLOCKS[byKey.get(k)?.[3]]?.log) continue;
        connected.add(k);
        queue.push(...neighbors(p));
      }
      assert.equal(connected.size, logs.length, 'Detached branch');
      const reach = new Map(logs.map((c) => [key(...c.slice(0, 3)), 0]));
      const leaves = logs.map((c) => c.slice(0, 3));
      for (let i = 0; i < leaves.length; i++) {
        const p = leaves[i],
          distance = reach.get(key(...p));
        if (distance === 6) continue;
        for (const n of neighbors(p)) {
          const k = key(...n);
          if (reach.has(k) || !BLOCKS[byKey.get(k)?.[3]]?.foliage) continue;
          reach.set(k, distance + 1);
          leaves.push(n);
        }
      }
      for (const c of cells) {
        assert.ok(hexDistance(c[0] - q, c[2] + 7) <= 3);
        assert.ok(reach.has(key(...c.slice(0, 3))), 'Unsupported leaf');
        if (c[4]) {
          branches++;
          assert.ok(BLOCKS[c[3]].pillar && c[4] >= 1 && c[4] <= 3);
        }
      }
      if (species === 'oak')
        heights.add(logs.filter((c) => c[0] === q && c[2] === -7).length);
      else assert.ok(logs.length >= 5 && logs.length <= 7);
    }
  assert.ok(branches > 0);
  assert.ok(heights.size >= 5 && heights.has(4) && heights.has(9));
});

test('branched natural trees and axis metadata agree across negative seams and retain saved removals and placed blocks', () => {
  const chunks = [
      [-16, 0],
      [-15, 0],
      [-16, 1],
      [-15, 1],
    ],
    a = new World(624, 'overworld', { load: false }),
    b = new World(624, 'overworld', { load: false });
  chunks.forEach((p) => a.generateChunk(...p));
  [...chunks].reverse().forEach((p) => b.generateChunk(...p));
  assert.deepEqual(a.blocks, b.blocks);
  assert.deepEqual(a.naturalStates, b.naturalStates);
  const branches = [...a.naturalStates].filter(
    ([k, s]) => s.axis && BLOCKS[a.blocks.get(k)]?.log,
  );
  assert.ok(branches.length > 2);
  const [removed, placed, rotated] = branches
    .slice(0, 3)
    .map(([k]) => k.split(',').map(Number));
  a.set(...removed, null);
  a.set(...placed, 'glass');
  a.setState(...rotated, { ...a.state(...rotated), axis: 3 });
  const save = validateSave(currentSave(a)),
    restored = new World(save.seed, 'overworld', {
      ...save.dimensions.overworld,
      load: false,
    });
  chunks.forEach((p) => restored.generateChunk(...p));
  assert.equal(restored.get(...removed), undefined);
  assert.equal(restored.get(...placed), 'glass');
  assert.equal(restored.state(...rotated).axis, 3);
});

test('sapling plans retain branch axes and reject an occupied branch, unloaded crown or world ceiling atomically', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(-122, 8, 1);
  const plan = treePlan(w, -122, 40, 8, () => false, 'oak');
  assert.ok(plan);
  const branch = plan.find((c) => c[4]);
  assert.ok(branch);
  const before = [...w.edits];
  w.set(...branch.slice(0, 3), 'glass');
  assert.equal(
    treePlan(w, -122, 40, 8, () => false, 'oak'),
    null,
  );
  w.set(...branch.slice(0, 3), null);
  assert.equal(
    treePlan(
      w,
      -122,
      40,
      8,
      (q, y, r) => key(q, y, r) === key(...branch.slice(0, 3)),
      'oak',
    ),
    null,
  );
  assert.equal(
    treePlan(w, -122, 60, 8, () => false, 'oak'),
    null,
  );
  const loaded = w.loaded.bind(w);
  w.loaded = (q, r) =>
    q === branch[0] && r === branch[2] ? false : loaded(q, r);
  assert.equal(
    treePlan(w, -122, 40, 8, () => false, 'oak'),
    null,
  );
  assert.equal(w.edits.size, before.length + 1);
});
