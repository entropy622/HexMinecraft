import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DIRECTIONS, key } from '../src/core.js';
import {
  placeVine,
  setVineFaces,
  supportedVineFaces,
  tickVines,
  spreadVine,
  treeVines,
  decorateJungleTree,
} from '../src/vines.js';
import { treeCells, megaTreeCells } from '../src/tree-layout.js';
import { buildingParts } from '../src/building-shapes.js';
import { miningLoot } from '../src/mining-loot.js';
import { miningStats } from '../src/mining.js';
import { actuatePiston } from '../src/pistons.js';
import { currentSave } from './fixtures/current-save.js';
import { validateSave } from '../src/save.js';

function garden() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  return w;
}
function wall(w, q, y, r, face = 0) {
  const [dq, dr] = DIRECTIONS[face];
  w.set(q + dq, y, r + dr, 'stone');
  assert.equal(placeVine(w, q, y, r, face), true);
}

test('six walls and ceiling share one noncolliding vine cell; changing one support prunes only that face', () => {
  const w = garden();
  for (let side = 0; side < 6; side++) wall(w, 0, 40, 0, side);
  w.set(0, 41, 0, 'jungleLeaves');
  assert.equal(placeVine(w, 0, 40, 0, 6), true);
  assert.equal(w.state(0, 40, 0).faces, 127);
  assert.equal(placeVine(w, 0, 40, 0, 0), false);
  assert.equal(buildingParts(w, 0, 40, 0).length, 7);
  assert.deepEqual(buildingParts(w, 0, 40, 0, true), []);
  assert.equal(w.pointSolid(0, 40.5, 0), false);
  assert.equal(w.groundAt(0, 0, 39.9, 40.9), null);
  w.set(1, 40, 0, null);
  w.set(0, 41, 0, null);
  assert.deepEqual(tickVines(w, 0).drops, []);
  assert.equal(w.state(0, 40, 0).faces, 62);
  assert.equal(placeVine(w, 0, 39, 0, 6), false);
});

test('hanging faces inherit from above; a lower independent wall survives a cut, and unloaded support is preserved', () => {
  const w = garden();
  wall(w, 0, 44, 0);
  for (let y = 43; y >= 40; y--) assert.equal(placeVine(w, 0, y, 0, 0), true);
  w.set(1, 42, 0, 'stone');
  w.set(0, 44, 0, null);
  const cut = tickVines(w, 0);
  assert.equal(w.get(0, 43, 0), undefined);
  assert.equal(w.get(0, 42, 0), 'vine');
  assert.equal(w.get(0, 40, 0), 'vine');
  assert.deepEqual(cut.drops, []);
  w.set(1, 42, 0, null);
  tickVines(w, 0);
  assert.equal(w.get(0, 40, 0), undefined);
  wall(w, 7, 40, 0);
  w.unloadChunk(1, 0);
  assert.equal(supportedVineFaces(w, 7, 40, 0, 1), 1);
  assert.deepEqual(tickVines(w, 0).changed, []);
  w.set(8, 40, 0, null);
  w.generateChunk(1, 0);
  tickVines(w, 0);
  assert.equal(w.get(7, 40, 0), undefined);
});

test('actual vines spread up, sideways and down while the density cap permits hanging growth', () => {
  const w = garden();
  wall(w, 0, 43, 0);
  w.set(1, 44, 0, 'stone');
  assert.equal(spreadVine(w, 0, 43, 0, 6, () => 0).length, 1);
  assert.equal(w.get(0, 44, 0), 'vine');
  assert.equal(spreadVine(w, 0, 43, 0, 7, () => 0).length, 1);
  w.set(2, 43, -1, 'stone');
  assert.equal(spreadVine(w, 0, 43, 0, 5, () => 0).length, 1);
  assert.equal(w.state(1, 43, -1).faces, 1);
  const dense = garden();
  wall(dense, 0, 40, 0);
  for (const [q, r] of [
    [-3, 0],
    [-2, 2],
    [0, -3],
    [0, 3],
  ])
    wall(dense, q, 40, r);
  dense.set(1, 41, 0, 'stone');
  assert.deepEqual(
    spreadVine(dense, 0, 40, 0, 6, () => 0),
    [],
  );
  assert.equal(spreadVine(dense, 0, 40, 0, 7, () => 0).length, 1);
  const clock = garden();
  wall(clock, 0, 40, 0);
  assert.deepEqual(tickVines(clock, 0, () => 0).changed, []);
  assert.equal(tickVines(clock, 0.1, () => 0).changed.length, 1);
  assert.equal(clock.get(0, 39, 0), 'vine');
  assert.equal(clock.get(0, 38, 0), undefined);
  clock.unloadChunk(0, 0);
  tickVines(clock, 10000, () => 0);
  clock.generateChunk(0, 0);
  assert.equal(clock.get(0, 39, 0), 'vine');
  assert.equal(clock.get(0, 38, 0), undefined);
});

test('only shears yield one vine; bare hands, silk touch and piston destruction do not duplicate attachments', () => {
  assert.equal(miningStats('vine', 'shears').speed, 2);
  assert.deepEqual(miningLoot('vine').stacks, []);
  assert.deepEqual(
    miningLoot('vine', { enchant: { silkTouch: 1 } }).stacks,
    [],
  );
  assert.deepEqual(miningLoot('vine', { tool: 'shears' }).stacks, [
    { item: 'vine', count: 1 },
  ]);
  const w = garden();
  wall(w, 1, 40, 0);
  w.set(0, 40, 0, 'piston');
  w.setState(0, 40, 0, { facing: 0, open: false });
  const result = actuatePiston(w, 0, 40, 0, true);
  assert.ok(result);
  assert.equal(w.get(1, 40, 0), 'pistonHead');
  assert.equal(result.broken.length, 0);
  assert.equal(w.vineCells.size, 0);
  for (const liquid of ['water', 'lava']) {
    const wet = garden();
    wall(wet, 0, 40, 0);
    placeVine(wet, 0, 39, 0, 0);
    assert.equal(wet.fluids.source(0, 40, 0, liquid), true);
    const washed = tickVines(wet, 0);
    assert.deepEqual(washed.drops, []);
    assert.equal(wet.get(0, 40, 0), undefined);
    assert.equal(wet.get(0, 39, 0), undefined);
  }
});

test('jungle vines are deterministic at positive and negative seams and edited vines stay removed after streaming', () => {
  for (const [cq, cr] of [
    [-21, 4],
    [5, -8],
  ]) {
    const chunks = [
        [cq, cr],
        [cq + 1, cr],
        [cq, cr + 1],
        [cq + 1, cr + 1],
      ],
      a = new World(624, 'overworld', { load: false }),
      b = new World(624, 'overworld', { load: false });
    chunks.forEach((p) => a.generateChunk(...p));
    chunks.toReversed().forEach((p) => b.generateChunk(...p));
    assert.deepEqual(b.blocks, a.blocks);
    assert.deepEqual(b.naturalStates, a.naturalStates);
    assert.deepEqual(b.vineCells, a.vineCells);
    assert.ok(a.vineCells.size > 10);
    assert.deepEqual(tickVines(a, 0).changed, []);
    const position = [...a.vineCells][0].split(',').map(Number);
    a.set(...position, null);
    const restored = new World(624, 'overworld', {
      ...a.serialize(),
      load: false,
    });
    chunks.toReversed().forEach((p) => restored.generateChunk(...p));
    assert.equal(restored.get(...position), undefined);
    assert.equal(restored.vineCells.has(key(...position)), false);
  }
});

test('ordinary and giant jungle trees acquire real vines without replacing their wood, leaves or player blocks', () => {
  for (const make of [treeCells, megaTreeCells]) {
    const w = garden(),
      cells = make('jungle', 0, 30, 0, 624),
      candidates = treeVines(cells, 0, 30, 0, 624);
    assert.ok(candidates.length > 10);
    for (const [q, y, r, type] of cells) w.set(q, y, r, type);
    const obstacle = candidates.find((p) => p[1] < 62);
    w.set(...obstacle.slice(0, 3), 'glass');
    const changed = decorateJungleTree(w, cells, 0, 30, 0);
    assert.ok(changed.length > 10);
    assert.equal(w.get(...obstacle.slice(0, 3)), 'glass');
    for (const [q, y, r, type] of cells) assert.equal(w.get(q, y, r), type);
    for (const k of w.vineCells) assert.equal(w.edits.get(k), 'vine');
    assert.deepEqual(tickVines(w, 0).changed, []);
  }
  assert.deepEqual(treeVines(treeCells('oak', 0, 30, 0), 0, 30, 0, 624), []);
});

test('v16 round-trips all attachment bits and rejects empty, malformed or foreign face masks', () => {
  const w = garden();
  assert.equal(setVineFaces(w, 0, 40, 0, 127), true);
  const save = currentSave(w);
  validateSave(save);
  const restored = new World(624, 'overworld', {
    ...save.dimensions.overworld,
    load: false,
  });
  restored.ensureAround(0, 0, 1);
  assert.equal(restored.state(0, 40, 0).faces, 127);
  assert.ok(restored.vineCells.has('0,40,0'));
  for (const faces of [0, -1, 128, 1.5, '1']) {
    const invalid = structuredClone(save);
    invalid.dimensions.overworld.blockStates.find(
      ([k]) => k === '0,40,0',
    )[1].faces = faces;
    assert.throws(() => validateSave(invalid));
  }
  const foreign = structuredClone(save);
  foreign.dimensions.overworld.edits.find(([k]) => k === '0,40,0')[1] = 'stone';
  assert.throws(() => validateSave(foreign));
});
