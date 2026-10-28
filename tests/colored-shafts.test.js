import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { VoxelLight } from '../src/voxel-light.js';
import { DynamicLight } from '../src/dynamic-light.js';
import { isGlass } from '../src/dye-data.js';
import { axialToWorld, worldToAxial } from '../src/core.js';

// Input classes and the conservative hex-distance bound precede the
// implementation in colored-shafts-verification.md. Exercise the real upload.
function emptyGlassWorld() {
  const w = new World(624, 'overworld', { load: false });
  w.ensureAround(0, 0, 1);
  for (const [key, type] of [...w.blocks])
    if (isGlass(type)) w.set(...key.split(',').map(Number), null);
  return w;
}

test('actual optical upload encodes conservative glass clearance without row wrapping or changing RGB and sky', () => {
  const w = emptyGlassWorld(),
    seeds = [
      [-7, 1, -7, 'redStainedGlass'],
      [7, 63, 7, 'blueStainedGlass'],
      [-6, 32, 6, 'glass'],
      [6, 33, -6, 'blackStainedGlass'],
    ];
  for (const [q, y, r, id] of seeds) w.set(q, y, r, id);
  w.set(1, 40, 1, 'torch');
  const field = new VoxelLight(w),
    light = new DynamicLight();
  field.update(0, true);
  light.upload(field);
  const data = light.uniforms.entityLightVolume.value.image.data;
  for (let q = field.minQ; q < field.minQ + field.width; q++)
    for (let r = field.minR; r < field.minR + field.depth; r++)
      for (let y = 0; y < 64; y++) {
        const i = field.index(q, y, r);
        // Independent brute-force oracle, not the production distance sweep.
        const distance = Math.min(
          ...seeds.map(
            ([a, b, c]) => Math.abs(q - a) + Math.abs(y - b) + Math.abs(r - c),
          ),
        );
        assert.equal(
          data[i * 4 + 2] >> 4,
          Math.ceil(Math.min(45, distance) / 3),
          `${q},${y},${r}`,
        );
        for (let c = 0; c < 3; c++)
          assert.equal(data[i * 4 + c] & 15, field.rgb[c][i]);
        assert.equal(data[i * 4 + 3] >> 4, field.sky[i]);
      }
  // The claimed world-distance jump stays outside every real glass prism,
  // including near hex vertices, vertical cell faces and oblique directions.
  const directions = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0.3, 0.9, -0.4],
    [-0.4, -0.6, 0.7],
  ];
  for (const q of [-6, -2, 2, 6])
    for (const r of [-6, 0, 6])
      for (const y of [2.01, 15.4, 30.95, 47.01, 62.98])
        for (const [dx, dz] of [
          [0, 0],
          [0.86, 0.49],
          [-0.86, -0.49],
          [0, 0.99],
          [0, -0.99],
        ]) {
          const p = axialToWorld(q, r),
            x = p.x + dx,
            z = p.z + dz,
            cell = worldToAxial(x, z);
          const clear =
            data[field.index(cell.q, Math.floor(y), cell.r) * 4 + 2] >> 4;
          if (clear < 2) continue;
          for (const ray of directions)
            for (const fraction of [0.1, 0.5, 0.999]) {
              const t = ((clear - 1) * fraction) / Math.hypot(...ray),
                a = worldToAxial(x + ray[0] * t, z + ray[2] * t);
              assert.equal(
                isGlass(w.get(a.q, Math.floor(y + ray[1] * t), a.r)),
                false,
              );
            }
        }
});

test('clearance saturates in four bits and actual reupload after removing all glass clears old skip data', () => {
  const w = emptyGlassWorld();
  w.set(-7, 1, -7, 'blueStainedGlass');
  const field = new VoxelLight(w),
    light = new DynamicLight();
  field.update(0, true);
  light.upload(field);
  const texture = light.uniforms.entityLightVolume.value;
  assert.ok(texture.image.data.some((v, i) => i % 4 === 2 && v >> 4 === 15));
  assert.equal(texture.image.data[field.index(-7, 1, -7) * 4 + 2] >> 4, 0);
  w.set(-7, 1, -7, null);
  field.update(0, true);
  light.upload(field);
  assert.equal(light.uniforms.entityLightVolume.value, texture);
  assert.ok(texture.image.data.every((v, i) => i % 4 !== 2 || v < 16));
  assert.ok(
    light.uniforms.glassBoundsMin.value.y >
      light.uniforms.glassBoundsMax.value.y,
  );
});
