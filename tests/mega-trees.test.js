import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, DIRECTIONS, key } from '../src/core.js';
import { megaTreeCells, megaTreeRoots, treeCells } from '../src/tree-layout.js';
import { saplingGroup, saplingGrowthPlan } from '../src/farming.js';
import { World } from '../src/world.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';
const neighbours = ([q, y, r]) => [
  ...DIRECTIONS.map(([a, c]) => [q + a, y, r + c]),
  [q, y - 1, r],
  [q, y + 1, r],
];
function planted(species = 'jungle', rotation = 0) {
  const blocks = new Map(),
    liquids = new Map(),
    roots = megaTreeRoots(-3, 10, -7, rotation).map((p) => key(...p));
  const crops = new Map(
    roots.map((k, i) => [
      k,
      {
        kind: species === 'jungle' ? 'jungleSapling' : 'spruceSapling',
        age: i * 20,
      },
    ]),
  );
  roots.forEach((k) => blocks.set(k, 'grass'));
  const world = {
    seed: 624,
    maxY: 64,
    persistentLeaves: new Set(),
    loaded: () => true,
    get: (...p) => blocks.get(key(...p)),
    fluids: { get: (...p) => liquids.get(key(...p)) },
  };
  return { world, crops, roots, blocks, liquids };
}
test('mega jungle branches and both giant conifer crowns retain four connected trunks and leaf support across hex rotations', () => {
  const heights = { jungle: new Set(), spruce: new Set() },
    crowns = new Set();
  for (const species of ['jungle', 'spruce'])
    for (let q = -12; q <= 12; q += 3)
      for (let rotation = 0; rotation < 3; rotation++) {
        const cells = megaTreeCells(species, q, 10, -7, 624, rotation),
          byKey = new Map(cells.map((c) => [key(...c.slice(0, 3)), c]));
        assert.deepEqual(
          cells,
          megaTreeCells(species, q, 10, -7, 624, rotation),
        );
        assert.equal(cells.length, byKey.size);
        assert.ok(cells.length < 2000);
        const logs = cells.filter((c) => BLOCKS[c[3]].log),
          roots = megaTreeRoots(q, 10, -7, rotation),
          height = roots.map(
            ([a, , c]) => logs.filter((p) => p[0] === a && p[2] === c).length,
          );
        assert.deepEqual(height, [
          height[0],
          height[0] - 1,
          height[0] - 1,
          height[0] - 1,
        ]);
        assert.ok(
          height[0] >= (species === 'jungle' ? 10 : 13) &&
            height[0] <= (species === 'jungle' ? 31 : 29),
        );
        heights[species].add(height[0]);
        const connected = new Set(),
          queue = [roots[0]];
        for (let i = 0; i < queue.length; i++) {
          const p = queue[i],
            k = key(...p);
          if (connected.has(k) || !BLOCKS[byKey.get(k)?.[3]]?.log) continue;
          connected.add(k);
          queue.push(...neighbours(p));
        }
        assert.equal(connected.size, logs.length, 'Detached branch');
        const reach = new Map(logs.map((c) => [key(...c.slice(0, 3)), 0])),
          leaves = logs.map((c) => c.slice(0, 3));
        for (let i = 0; i < leaves.length; i++) {
          const p = leaves[i],
            distance = reach.get(key(...p));
          if (distance === 6) continue;
          for (const n of neighbours(p)) {
            const k = key(...n);
            if (reach.has(k) || !BLOCKS[byKey.get(k)?.[3]]?.foliage) continue;
            reach.set(k, distance + 1);
            leaves.push(n);
          }
        }
        for (const c of cells) {
          assert.ok(reach.has(key(...c.slice(0, 3))), 'Unsupported leaf');
          if (c[4]) assert.ok(c[4] >= 1 && c[4] <= 3);
        }
        if (species === 'jungle') {
          if (height[0] > 15)
            assert.ok(
              cells.some((c) => c[4]),
              'Missing jungle branches',
            );
        } else
          crowns.add(
            10 +
              height[0] -
              Math.min(
                ...cells.filter((c) => BLOCKS[c[3]].foliage).map((c) => c[1]),
              ) >
              10
              ? 'long'
              : 'short',
          );
      }
  assert.ok(heights.jungle.size > 4 && heights.spruce.size > 4);
  assert.deepEqual([...crowns].sort(), ['long', 'short']);
});
test('every corner detects the same four equal-species saplings; missing, mixed and different-level groups retain single growth', () => {
  for (const species of ['jungle', 'spruce'])
    for (let rotation = 0; rotation < 3; rotation++) {
      const { world, crops, roots } = planted(species, rotation),
        group = saplingGroup(crops, roots[0]);
      assert.ok(group);
      for (const root of roots) {
        assert.deepEqual(saplingGroup(crops, root), group);
        const p = saplingGrowthPlan(world, crops, root, () => false);
        assert.ok(p?.mega);
        assert.deepEqual(p.roots, roots);
      }
      crops.delete(roots[3]);
      assert.equal(saplingGroup(crops, roots[0]), null);
      assert.equal(
        saplingGrowthPlan(world, crops, roots[0], () => false).mega,
        false,
      );
      crops.set(roots[3], {
        kind: species === 'jungle' ? 'spruceSapling' : 'jungleSapling',
        age: 0,
      });
      assert.equal(saplingGroup(crops, roots[0]), null);
      crops.set(roots[3], {
        kind: species === 'jungle' ? 'jungleSapling' : 'spruceSapling',
        age: 0,
      });
      const p = roots[3].split(',').map(Number);
      crops.set(key(p[0], p[1] + 1, p[2]), crops.get(roots[3]));
      crops.delete(roots[3]);
      assert.equal(saplingGroup(crops, roots[0]), null);
    }
  const oak = planted();
  for (const p of oak.crops.values()) p.kind = 'sapling';
  assert.equal(saplingGroup(oak.crops, oak.roots[0]), null);
  assert.equal(
    saplingGrowthPlan(oak.world, oak.crops, oak.roots[0], () => false).mega,
    false,
  );
});
test('a complete blocked giant tree preserves every root and rejects liquid, entities, unknown chunks, soil and ceiling before any mutation', () => {
  const { world, crops, roots, blocks, liquids } = planted(),
    plan = saplingGrowthPlan(world, crops, roots[0], () => false),
    cell = plan.cells.find((c) => c[4]),
    p = cell.slice(0, 3),
    k = key(...p),
    before = [...crops];
  const blocked = () => {
    assert.equal(
      saplingGrowthPlan(world, crops, roots[0], () => false),
      null,
    );
    assert.deepEqual([...crops], before);
  };
  blocks.set(k, 'glass');
  blocked();
  blocks.delete(k);
  liquids.set(k, { type: 'water' });
  blocked();
  liquids.clear();
  assert.equal(
    saplingGrowthPlan(world, crops, roots[0], (...n) => key(...n) === k),
    null,
  );
  assert.deepEqual([...crops], before);
  world.loaded = (a, c) => a !== p[0] || c !== p[2];
  blocked();
  world.loaded = () => true;
  blocks.set(roots[2], 'stone');
  blocked();
  blocks.set(roots[2], 'grass');
  world.maxY = 15;
  blocked();
  world.maxY = 64;
  blocks.set(k, 'leaves');
  assert.ok(saplingGrowthPlan(world, crops, roots[0], () => false));
  world.persistentLeaves.add(k);
  blocked();
  world.persistentLeaves.clear();
  blocks.delete(k);
  const ground = key(p[0], p[1] - 1, p[2]);
  crops.set(ground, { kind: 'wheat', age: 0 });
  assert.equal(
    saplingGrowthPlan(world, crops, roots[0], () => false),
    null,
  );
  crops.delete(ground);
  assert.deepEqual([...crops], before);
  assert.ok(saplingGrowthPlan(world, crops, roots[0], () => false));
});
test('real giant tree edits and branch axes survive v16 validation and chunk streaming without making leaves persistent', () => {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(-3, -7, 2);
  const cells = megaTreeCells('jungle', -3, 12, -7, 624, 2);
  for (const [q, y, r, type, axis = 0] of cells) {
    w.set(q, y, r, type);
    if (axis) w.setState(q, y, r, { facing: 0, open: false, axis });
  }
  assert.equal(w.persistentLeaves.size, 0);
  const save = validateSave(currentSave(w)),
    other = new World(save.seed, 'overworld', {
      ...save.dimensions.overworld,
      load: false,
    });
  other.ensureAround(-3, -7, 2);
  for (const [q, y, r, type, axis = 0] of cells) {
    assert.equal(other.get(q, y, r), type);
    if (axis) assert.equal(other.state(q, y, r).axis, axis);
  }
  assert.equal(other.persistentLeaves.size, 0);
});
