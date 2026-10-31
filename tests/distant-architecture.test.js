import test from 'node:test';
import assert from 'node:assert/strict';
import { DistantField, DISTANT_TYPES } from '../src/distant-field.js';
import { decodeDetail } from '../src/distant-detail.js';
import { distantMesh } from '../src/distant-mesh.js';
import { World } from '../src/world.js';
import { BLOCKS } from '../src/core.js';

function fine(tile) {
  const result = new Map(),
    h = tile.detailHeight;
  for (let i = 0; i < tile.fineDetails.length; i += 2) {
    const cell = tile.fineDetails[i],
      word = tile.fineDetails[i + 1],
      column = Math.floor(cell / h),
      q = tile.tq * 32 + Math.floor(column / 40),
      r = tile.tr * 32 + (column % 40);
    result.set(`${q},${cell % h},${r}`, {
      type: DISTANT_TYPES[(word >>> 16) - 1],
      ...decodeDetail(word & 65535),
    });
  }
  return result;
}
const textures = {
  materials: { has: () => true },
  biomes: { tint: () => [80, 140, 45, 2] },
  uv: (name, u, v) => [
    (/^(ironBlock|goldBlock):/.test(name) ? 0.8 : 0.1) + u * 0.05,
    0.1 + v * 0.05,
  ],
};

test('mining one natural leaf keeps its exact air gap and the neighbouring leaves', () => {
  const world = new World(624, 'overworld', { load: false });
  for (let q = 0; q < 5; q++)
    for (let r = 0; r < 5; r++) world.generateChunk(q, r);
  const original = new DistantField({ seed: 624 }).tile(0, 0);
  const leaf = [...world.blocks].find(([key, type]) => {
    if (!BLOCKS[type]?.foliage) return false;
    const [q, y, r] = key.split(',').map(Number);
    if (q < 4 || q >= 36 || r < 4 || r >= 36) return false;
    const a = Math.floor(q / 2),
      b = Math.floor(r / 2);
    if (!original.details[(a * 20 + b) * 64 + y]) return false;
    return [0, 1].some((dq) =>
      [0, 1].some(
        (dr) =>
          (a * 2 + dq !== q || b * 2 + dr !== r) &&
          BLOCKS[world.get(a * 2 + dq, y, b * 2 + dr)]?.foliage,
      ),
    );
  });
  assert.ok(leaf, 'the generated canopy contains adjacent natural leaves');
  const [key] = leaf,
    [q, y, r] = key.split(',').map(Number);
  const a = Math.floor(q / 2),
    b = Math.floor(r / 2);
  const tile = new DistantField({ seed: 624, edits: [[key, null]] }).tile(0, 0);
  const cells = fine(tile);
  assert.equal(tile.details[(a * 20 + b) * 64 + y], 0);
  assert.equal(cells.has(key), false);
  for (let dq = 0; dq < 2; dq++)
    for (let dr = 0; dr < 2; dr++) {
      const px = a * 2 + dq,
        pz = b * 2 + dr,
        other = `${px},${y},${pz}`;
      if (other === key) continue;
      const type = world.get(px, y, pz);
      if (BLOCKS[type]?.foliage) assert.equal(cells.get(other)?.type, type);
    }
});

test('an isolated block and a suspended roof keep their actual altitude and the air underneath', () => {
  const edits = [['5,60,5', 'ironBlock']];
  for (let q = 12; q < 20; q++)
    for (let r = 12; r < 20; r++) {
      edits.push([`${q},40,${r}`, 'planks'], [`${q},46,${r}`, 'goldBlock']);
      if (q === 12 || q === 19 || r === 12 || r === 19)
        for (let y = 41; y < 46; y++) edits.push([`${q},${y},${r}`, 'stone']);
    }
  const tile = new DistantField({ seed: 624, edits }).tile(0, 0),
    cells = fine(tile);
  assert.equal(cells.get('5,60,5').type, 'ironBlock');
  assert.ok(tile.groundHeights[11] < 30);
  assert.equal(cells.get('16,46,16').type, 'goldBlock');
  for (let y = 41; y < 46; y++) assert.equal(cells.has(`16,${y},16`), false);
  const mesh = distantMesh(tile, textures, null),
    g = mesh.geometry,
    p = g.attributes.position,
    uv = g.attributes.uv,
    n = g.attributes.normal;
  let marker = 0,
    bottoms = 0;
  for (let i = 0; i < p.count; i++)
    if (uv.getX(i) > 0.7) {
      marker++;
      assert.ok(
        (p.getY(i) >= 40 && p.getY(i) <= 47) ||
          (p.getY(i) >= 60 && p.getY(i) <= 61),
      );
      if (n.getY(i) === -1) bottoms++;
    }
  assert.ok(marker > 0);
  assert.ok(bottoms > 0);
  g.dispose();
  mesh.material.dispose();
});

test('precise slabs, horizontal beams, glass and a high liquid surface keep independent spans and groups', () => {
  const field = new DistantField({
    seed: 624,
    edits: [
      ['5,50,5', 'planksSlab'],
      ['7,50,5', 'planksSlab'],
      ['13,50,5', 'wood'],
      ['21,50,5', 'redStainedGlass'],
    ],
    blockStates: [
      ['7,50,5', { upper: true }],
      ['13,50,5', { axis: 2 }],
    ],
    fluids: [
      ['17,50,5', { type: 'water', level: 0, source: true, falling: false }],
    ],
  });
  const tile = field.tile(0, 0),
    cells = fine(tile),
    lower = cells.get('5,50,5'),
    upper = cells.get('7,50,5'),
    water = cells.get('17,50,5');
  assert.equal(lower.bottom, 0);
  assert.ok(Math.abs(lower.top - 0.5) < 0.005);
  assert.equal(upper.top, 1);
  assert.ok(Math.abs(upper.bottom - 0.5) < 0.005);
  assert.equal(cells.get('13,50,5').axis, 2);
  assert.equal(water.type, '@water');
  assert.ok(Math.abs(water.top - 0.92) < 0.005);
  assert.ok(tile.groundHeights[11] < 30);
  const mesh = distantMesh(tile, textures, null),
    g = mesh.geometry;
  assert.ok(
    g.groups.some((group) => group.materialIndex === 1 && group.count > 0),
  );
  assert.ok(
    Array.from({ length: g.attributes.color.count }, (_, i) =>
      g.attributes.color.getW(i),
    ).some((a) => a > 0 && a < 0.5),
  );
  g.dispose();
  mesh.material.dispose();
});

test('surface edits remain visible and generated village roofs are tracked without changing world saves', () => {
  const world = new World(624, 'overworld', { load: false }),
    h = world.terrainHeight(5, 5);
  const tile = new DistantField({
      seed: 624,
      edits: [[`5,${h - 1},5`, 'sand']],
    }).tile(0, 0),
    cells = fine(tile);
  assert.equal(cells.get(`5,${h - 1},5`).type, 'sand');
  assert.ok(tile.groundHeights[11] <= h - 1);
  assert.equal(world.featureBlocks, null);
  assert.equal(Object.hasOwn(world.serialize(), 'featureBlocks'), false);
  const village = world.villages(0, 0, 200)[0];
  assert.ok(village);
  const tracked = new World(624, 'overworld', {
      load: false,
      trackFeatures: true,
    }),
    cq = Math.floor(village.q / 8),
    cr = Math.floor(village.r / 8);
  tracked.generateChunk(cq, cr);
  assert.ok(
    tracked.featureBlocks.has(`${village.q},${village.h + 3},${village.r}`),
  );
  tracked.unloadChunk(cq, cr);
  assert.equal(tracked.featureBlocks.size, 0);
  const vtile = new DistantField({ seed: 624 }).tile(
      Math.floor(village.q / 32),
      Math.floor(village.r / 32),
    ),
    vcells = fine(vtile);
  assert.equal(
    vcells.get(`${village.q},${village.h + 3},${village.r}`).type,
    village.palette.roof + 'Slab',
  );
});
