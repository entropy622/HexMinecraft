import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DistantField,
  DISTANT_SAMPLES,
  DISTANT_TYPES,
} from '../src/distant-field.js';
import { World } from '../src/world.js';
import { distantMesh } from '../src/distant-mesh.js';

test('real pooled jungles retain crowns, fractional water and identical negative tile seams including their normal halo', () => {
  const source = { seed: 624, edits: [], blockStates: [], fluids: [] },
    before = structuredClone(source),
    f = new DistantField(source),
    a = f.tile(-6, 1),
    b = f.tile(-5, 1),
    c = f.tile(-6, 2),
    n = DISTANT_SAMPLES;
  for (let edge = 0; edge < 2; edge++)
    for (let i = 0; i < n; i++) {
      for (const name of [
        'heights',
        'types',
        'offsets',
        'groundHeights',
        'groundTypes',
        'groundOffsets',
      ]) {
        assert.equal(a[name][(n - 2 + edge) * n + i], b[name][edge * n + i]);
        assert.equal(a[name][i * n + n - 2 + edge], c[name][i * n + edge]);
      }
    }
  assert.ok(a.heights.some((y) => y > 37));
  assert.ok(a.types.some((t) => DISTANT_TYPES[t] === 'jungleLeaves'));
  assert.ok(
    a.types.some(
      (t, i) => DISTANT_TYPES[t] === '@water' && a.heights[i] % 1 > 0,
    ),
  );
  assert.equal(a.residentChunks, 25);
  const tn = 20,
    th = a.treeHeight;
  for (let edge = 0; edge < 4; edge++)
    for (let i = 0; i < tn; i++)
      for (let y = 0; y < th; y++) {
        assert.equal(
          a.trees[((16 + edge) * tn + i) * th + y],
          b.trees[(edge * tn + i) * th + y],
        );
        assert.equal(
          a.trees[(i * tn + 16 + edge) * th + y],
          c.trees[(i * tn + edge) * th + y],
        );
      }
  assert.ok(a.residentBlocks <= 25 * 8 * 8 * 64);
  assert.deepEqual(source, before);
  const mesh = distantMesh(
      a,
      {
        materials: { has: () => true },
        biomes: { tint: (_world, _q, _r, kind) => [80, 140, 45, kind] },
        uv: (_name, u, v) => [u, v],
      },
      null,
    ),
    tint = mesh.geometry.attributes.biomeTint,
    normal = mesh.geometry.attributes.normal;
  // The shared material decodes normalized color bytes, including the kind.
  assert.equal(tint.getX(0), 80 / 255);
  assert.equal(tint.getY(0), 140 / 255);
  assert.ok(
    Array.from({ length: tint.count }, (_, i) => tint.getW(i)).some(
      (k) => k > 0 && k < 0.02,
    ),
  );
  for (let i = 0; i < normal.count; i++)
    assert.ok(normal.getY(i) === 0 || Math.abs(normal.getY(i)) === 1);
  assert.ok(
    mesh.geometry.index.count > mesh.geometry.attributes.position.count,
  );
  assert.ok(Array.from(normal.array).some((v, i) => i % 3 === 1 && v < 0));
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('a thin authored tower survives pooling, same-key replacement, mining and a high player water source', () => {
  const key = '5,60,5',
    f = new DistantField({ seed: 624, edits: [[key, 'wood']] }),
    index = DISTANT_SAMPLES + 1;
  let t = f.tile(0, 0);
  assert.equal(t.heights[index], 61);
  assert.equal(DISTANT_TYPES[t.types[index]], 'wood');
  f.patch([{ key, edit: 'stone' }]);
  t = f.tile(0, 0);
  assert.equal(t.heights[index], 61);
  assert.equal(DISTANT_TYPES[t.types[index]], 'stone');
  f.patch([{ key, edit: null }]);
  t = f.tile(0, 0);
  assert.ok(t.heights[index] < 61);
  f.patch([
    {
      key,
      edit: null,
      fluid: { type: 'water', source: true, level: 0, falling: false },
    },
  ]);
  t = f.tile(0, 0);
  assert.ok(Math.abs(t.heights[index] - 60.92) < 0.00001);
  assert.equal(DISTANT_TYPES[t.types[index]], '@water');
});

test('a continuous crown spanning every tile edge has no internal vertical walls', () => {
  const trees = new Uint16Array(20 * 20 * 64),
    leaf = DISTANT_TYPES.indexOf('leaves') + 1;
  for (let a = 0; a < 20; a++)
    for (let b = 0; b < 20; b++)
      for (let y = 20; y < 23; y++) trees[(a * 20 + b) * 64 + y] = leaf;
  const tile = {
    tq: 0,
    tr: 0,
    trees,
    treeHeight: 64,
    groundHeights: new Float32Array(100),
    groundTypes: new Uint16Array(100),
  };
  const mesh = distantMesh(
      tile,
      {
        materials: { has: () => true },
        biomes: { tint: () => [80, 140, 45, 2] },
        uv: (_, u, v) => [u, v],
      },
      null,
    ),
    normal = mesh.geometry.attributes.normal;
  for (let i = 0; i < normal.count; i++)
    assert.equal(Math.abs(normal.getY(i)), 1);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('visual edit versions ignore generation and previews but observe same-cell block, state and fluid edits', () => {
  const w = new World(624, 'overworld', { load: false });
  w.generateChunk(0, 0);
  assert.equal(w.editVersion, 0);
  w.set(5, 40, 5, 'wood', false);
  assert.equal(w.editVersion, 0);
  w.set(5, 40, 5, 'wood');
  assert.equal(w.editVersion, 1);
  w.set(5, 40, 5, 'wood');
  assert.equal(w.editVersion, 1);
  w.setState(5, 40, 5, { facing: 0, open: false, axis: 1 });
  assert.equal(w.editVersion, 2);
  w.setState(5, 40, 5, { facing: 0, open: false, axis: 1 });
  assert.equal(w.editVersion, 2);
  const water = { type: 'water', source: true, level: 0, falling: false };
  w.fluids.write(5, 41, 5, water);
  assert.equal(w.fluids.editVersion, 1);
  w.fluids.write(5, 41, 5, water);
  assert.equal(w.fluids.editVersion, 1);
  w.fluids.write(5, 41, 5, null, false);
  assert.equal(w.fluids.editVersion, 1);
});
