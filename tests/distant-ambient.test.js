import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { VoxelLight } from '../src/voxel-light.js';
import { BLOCKS, axialToWorld } from '../src/core.js';
import { distantAmbient } from '../src/distant-ambient.js';
import { DistantField, DISTANT_TYPES } from '../src/distant-field.js';
import {
  detailType,
  detailAmbient,
  unpackDistantSky,
} from '../src/distant-detail.js';
import { distantMesh } from '../src/distant-mesh.js';

test('distant natural canopy visibility agrees with the real near field and survives coarse type packing', () => {
  const world = new World(624, 'overworld', { load: false });
  for (let q = -24; q < -19; q++)
    for (let r = 4; r < 9; r++) world.generateChunk(q, r);
  const near = new VoxelLight(world);
  near.update(0, true);
  const far = distantAmbient(world, -192, 32, 40);
  let leaves = 0;
  for (const [key, type] of world.blocks) {
    if (!BLOCKS[type].foliage || BLOCKS[type].nonSolid) continue;
    const index = near.index(...key.split(',').map(Number));
    assert.equal(far.values[index], near.leafAmbient[index]);
    leaves++;
  }
  assert.ok(leaves > 1000);
  const tile = new DistantField({ seed: 624 }).tile(-6, 1);
  let groups = 0;
  for (let a = 2; a < 18; a++)
    for (let b = 2; b < 18; b++)
      for (let y = 0; y < 64; y++) {
        const code = tile.details[(a * 20 + b) * 64 + y],
          id = detailType(code);
        if (!id || !BLOCKS[DISTANT_TYPES[id - 1]]?.foliage) continue;
        let sum = 0,
          count = 0;
        for (let dq = 0; dq < 2; dq++)
          for (let dr = 0; dr < 2; dr++) {
            const q = -192 + a * 2 + dq,
              r = 32 + b * 2 + dr;
            if (!BLOCKS[world.get(q, y, r)]?.foliage) continue;
            sum += near.leafAmbient[near.index(q, y, r)];
            count++;
          }
        assert.ok(count > 0);
        assert.ok(
          Math.abs(detailAmbient(code) - sum / (255 * count)) <=
            0.5 / 127 + 1e-9,
        );
        groups++;
      }
  assert.ok(groups > 100);
});

test('a real edited leaf loses ambient transmission inside a closed room without changing its identity or shape', () => {
  const edits = new Map();
  for (let q = 7; q <= 13; q++)
    for (let r = 7; r <= 13; r++)
      for (let y = 52; y <= 60; y++) edits.set(`${q},${y},${r}`, null);
  edits.set('10,56,10', 'leaves');
  const inspect = (exposed) => {
    const tile = new DistantField({ seed: 624, edits: [...edits] }).tile(0, 0),
      index = (10 * 40 + 10) * 64 + 56;
    const at = Array.from(
      { length: tile.fineDetails.length / 2 },
      (_, i) => i * 2,
    ).find((i) => tile.fineDetails[i] === index);
    assert.notEqual(at, undefined);
    const word = tile.fineDetails[at + 1];
    assert.equal(DISTANT_TYPES[detailType(word >>> 16) - 1], 'leaves');
    assert.equal(word & 65535, 127);
    const mesh = distantMesh(
      tile,
      {
        materials: { has: () => true },
        biomes: { tint: () => [100, 150, 70, 2] },
        uv: (_name, u, v) => [u, v],
      },
      null,
    );
    const { position, surfaceOptics, leafAmbient } = mesh.geometry.attributes,
      center = axialToWorld(10, 10);
    let vertices = 0;
    for (let i = 0; i < position.count; i++) {
      if (surfaceOptics.getX(i) !== 5) {
        assert.equal(leafAmbient.getX(i), 0);
        continue;
      }
      if (
        position.getY(i) < 56 ||
        position.getY(i) > 57 ||
        Math.abs(position.getX(i) + mesh.position.x - center.x) > 1.01 ||
        Math.abs(position.getZ(i) + mesh.position.z - center.z) > 1.01
      )
        continue;
      assert.equal(leafAmbient.getX(i), detailAmbient(word >>> 16));
      vertices++;
    }
    if (exposed) assert.ok(vertices > 0);
    else assert.equal(vertices, 0);
    mesh.geometry.dispose();
    mesh.material.dispose();
    return detailAmbient(word >>> 16);
  };
  assert.equal(inspect(true), 1);
  for (let q = 8; q <= 12; q++)
    for (let r = 8; r <= 12; r++)
      for (let y = 54; y <= 58; y++)
        if (q !== 10 || y !== 56 || r !== 10)
          edits.set(`${q},${y},${r}`, 'stone');
  assert.equal(inspect(false), 0);
});

test('a roof at the LOD seam shades both tiles and opening its centre restores direct sky', () => {
  const edits = [];
  for (let q = 30; q <= 41; q++)
    for (let r = 10; r <= 20; r++) edits.push([`${q},52,${r}`, 'stone']);
  const f = new DistantField({ seed: 624, edits });
  const column = (tq) => {
    const tile = f.tile(tq, 0);
    const sky = unpackDistantSky(tile.skyRuns, 40 * 40 * 64);
    return (q, y, r) => sky[((q - tq * 32) * 40 + r) * 64 + y];
  };
  const west = column(0),
    east = column(1);
  for (const q of [35, 36])
    for (let r = 4; r < 36; r++)
      for (let y = 0; y < 64; y++) assert.equal(west(q, y, r), east(q, y, r));
  assert.equal(west(35, 53, 15), 15);
  assert.equal(east(35, 51, 15), 0);
  assert.equal(east(35, 51, 10), 14); // one lateral step below the eave
  f.patch([{ key: '35,52,15', edit: null }]);
  assert.equal(column(0)(35, 51, 15), 15);
  assert.equal(column(1)(35, 51, 15), 15);
});
