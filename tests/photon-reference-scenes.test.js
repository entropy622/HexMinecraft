import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { worldToAxial } from '../src/core.js';
import { validateSave } from '../src/save.js';
import { DataUtils, FloatType } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { encodeEXR } from './fixtures/photon-reference-artifacts.js';
import {
  referenceScenes,
  referenceSave,
  referenceLandmarks,
} from './fixtures/photon-reference-scenes.js';

test('reference files load through the real save parser and retain natural terrain', () => {
  for (const scene of referenceScenes) {
    const save = JSON.parse(JSON.stringify(referenceSave(scene)));
    assert.doesNotThrow(() => validateSave(save), scene.id);
    const w = new World(save.seed, save.dimension, {
      ...save.dimensions.overworld,
      load: false,
    });
    const p = worldToAxial(save.position[0], save.position[2]);
    w.ensureAround(p.q, p.r);
    assert.equal(w.biome(p.q, p.r), '森林', scene.id);
    assert.equal(w.edits.size, 0, scene.id);
    for (
      let y = Math.floor(save.position[1] - 1.65);
      y <= save.position[1];
      y++
    )
      assert.equal(
        w.solid(p.q, y, p.r),
        false,
        `${scene.id}: camera clearance`,
      );
    assert.ok(w.treeLogs.size > 40, `${scene.id}: actual natural forest`);
    assert.ok(w.terrainHeight(-98, -1) - w.terrainHeight(-128, 0) >= 12);
    assert.equal(w.fluids.get(-128, 5, 0)?.type, 'water');
    const ruler = referenceLandmarks(scene, w);
    assert.ok(ruler.every((v) => v.naturalTree && v.kind === 'oak'));
    if (scene.id === 'distance-ruler') {
      assert.ok(ruler[0].distance < ruler[1].distance);
      assert.ok(ruler[1].distance < ruler[2].distance);
      assert.ok(ruler[2].distance > 30);
    }
  }
});

test('HDR EXR preserves half channels and row order with a standard reader, rejects invalid raw inputs', async () => {
  const width = 8,
    height = 2,
    raw = Buffer.alloc(width * height * 8);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (const [c, value] of (y
        ? [4, 2, 1, 1]
        : [0.5, -0.25, 0.125, 1]
      ).entries())
        raw.writeUInt16LE(
          DataUtils.toHalfFloat(value),
          ((y * width + x) * 4 + c) * 2,
        );
  const encoded = await encodeEXR(raw, width, height),
    bytes = encoded.buffer;
  const decoded = new EXRLoader()
    .setDataType(FloatType)
    .parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  // EXRLoader returns bottom-up GPU data; EXRExporter writes top-down scanlines.
  assert.deepEqual(
    Array.from(decoded.data.slice(0, 4)),
    [0.5, -0.25, 0.125, 1],
  );
  assert.deepEqual(
    Array.from(decoded.data.slice(width * 4, width * 4 + 4)),
    [4, 2, 1, 1],
  );
  raw.writeUInt16LE(0x7c00, 0);
  await assert.rejects(encodeEXR(raw, width, height), /Non-finite/);
  await assert.rejects(
    encodeEXR(raw.subarray(1), width, height),
    /size mismatch/,
  );
});
