import test from 'node:test';
import assert from 'node:assert/strict';
import { World, chunkKey } from '../src/world.js';
import { DIRECTIONS } from '../src/core.js';
import { miningStats } from '../src/mining.js';
import { miningLoot } from '../src/mining-loot.js';
import { pointedSupport } from '../src/dripstone.js';

// Failure modes: a room/ramp cliff, blocked headroom, a missing seam column,
// bedrock excavation, ore-wall replacement, chunk-order dependence, and edits
// getting erased by natural generation after unloading or save restoration.
test('generated cave mouths connect to chambers with headroom and one-block steps', () => {
  let checked = 0;
  const kinds = new Set();
  for (const seed of [624, 129, 404]) {
    const w = new World(seed, 'overworld', { load: false });
    for (const c of w.caves(0, 0, 140)) {
      w.ensureAround(c.q, c.r, 3);
      for (const k of w.dripstoneCells) {
        const [q, y, r] = k.split(',').map(Number);
        assert.ok(
          pointedSupport(w, q, y, r, !!w.state(q, y, r).upper),
          `seed ${seed}: unsupported natural spike ${k}`,
        );
      }
      for (let tick = 0; tick < 80; tick++)
        w.gravity.tick(0.05, { canPlace: () => true, drop: () => {} });
      const end = c.path.at(-1),
        queue = [[c.q, c.floor + 1, c.r]],
        seen = new Set();
      let reached = false;
      for (let i = 0; i < queue.length && i < 20000; i++) {
        const [q, y, r] = queue[i];
        if (q === end.q && r === end.r && y >= end.floor) {
          reached = true;
          break;
        }
        for (const [dq, dr] of DIRECTIONS)
          for (const dy of [0, 1, -1]) {
            const nq = q + dq,
              ny = y + dy,
              nr = r + dr,
              id = `${nq},${ny},${nr}`;
            if (
              seen.has(id) ||
              ny < 2 ||
              Math.abs(nq - c.q) > 24 ||
              Math.abs(nr - c.r) > 24
            )
              continue;
            if (
              !w.solid(nq, ny - 1, nr) ||
              w.solid(nq, ny, nr) ||
              w.solid(nq, ny + 1, nr)
            )
              continue;
            // A step up must also leave room above the departure cell.
            if (dy > 0 && w.solid(q, y + 2, r)) continue;
            seen.add(id);
            queue.push([nq, ny, nr]);
          }
      }
      assert.ok(reached, `seed ${seed}: ${c.q},${c.r} has no walkable route`);
      for (const p of c.path) assert.equal(w.get(p.q, 0, p.r), 'bedrock');
      assert.ok([...w.blocks.values()].some((t) => t.endsWith('Ore')));
      kinds.add(c.kind);
      checked++;
    }
  }
  assert.ok(checked >= 15);
  assert.deepEqual([...kinds].sort(), ['dripstone', 'limestone', 'lush']);
});

test('cave materials obey harvesting rules and survive chunk-order changes, edits and restoration', () => {
  const a = new World(624, 'overworld', { load: false }),
    b = new World(624, 'overworld', { load: false }),
    c = a.caves(0, 0, 140).find((c) => c.kind === 'lush'),
    chunks = [];
  for (let q = Math.floor(c.q / 8) - 3; q <= Math.floor(c.q / 8) + 3; q++)
    for (let r = Math.floor(c.r / 8) - 3; r <= Math.floor(c.r / 8) + 3; r++)
      chunks.push([q, r]);
  chunks.forEach(([q, r]) => a.generateChunk(q, r));
  chunks.reverse().forEach(([q, r]) => b.generateChunk(q, r));
  assert.deepEqual(a.blocks, b.blocks);
  assert.equal(a.get(c.q, c.floor, c.r), 'mossBlock');
  for (const type of ['mossBlock', 'calcite', 'tuff']) {
    const stats = miningStats(type, 'pick1');
    assert.ok(stats.harvest);
    assert.equal(
      miningLoot(type, { harvest: stats.harvest }).stacks[0].item,
      type,
    );
  }
  assert.equal(miningStats('calcite', null).harvest, false);
  assert.equal(miningStats('tuff', null).harvest, false);
  assert.equal(miningStats('mossBlock', 'hoe').kind, 'hoe');
  a.set(c.q, c.floor, c.r, 'calcite');
  a.set(c.q + 1, c.floor, c.r, null);
  const edits = [...a.edits];
  a.unloadChunk(...chunkKey(c.q, c.r).split(',').map(Number));
  a.generateChunk(...chunkKey(c.q, c.r).split(',').map(Number));
  const restored = new World(624, 'overworld', { load: false, edits });
  restored.ensureAround(c.q, c.r, 3);
  assert.equal(a.get(c.q, c.floor, c.r), 'calcite');
  assert.equal(restored.get(c.q, c.floor, c.r), 'calcite');
  assert.equal(restored.get(c.q + 1, c.floor, c.r), undefined);
  for (const dimension of ['nether', 'end'])
    assert.deepEqual(
      new World(624, dimension, { load: false }).caves(c.q, c.r, 160),
      [],
    );
});
