import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import {
  decodeMaterialPNG,
  decodeMaterialPack,
  materialNames,
} from '../src/material-pack.js';

test('numeric PNG retains zero-alpha RGB, 16-bit precision conversion and indexed transparency', () => {
  const data = new Uint8Array([241, 231, 64, 0, 128, 238, 65, 255]);
  assert.deepEqual(
    decodeMaterialPNG(encode({ width: 2, height: 1, data, channels: 4 })).data,
    data,
  );
  const sixteen = encode({
    width: 1,
    height: 1,
    depth: 16,
    channels: 4,
    data: new Uint16Array([65535, 32896, 0, 65535]),
  });
  assert.deepEqual([...decodeMaterialPNG(sixteen).data], [255, 128, 0, 255]);
  const palette = encode({
    width: 2,
    height: 1,
    depth: 8,
    channels: 1,
    data: new Uint8Array([0, 1]),
    palette: [
      [240, 231, 64, 0],
      [128, 238, 65, 255],
    ],
  });
  assert.deepEqual(
    [...decodeMaterialPNG(palette).data],
    [240, 231, 64, 0, 128, 238, 65, 255],
  );
});

test('resource pack decodes sparse raw channels and rejects mismatched channels without touching active data', async () => {
  const png = (size) =>
    encode({
      width: size,
      height: size,
      channels: 4,
      data: new Uint8Array(size * size * 4).fill(128),
    });
  const file = (entries) => new File([zipSync(entries)], 'test.zip');
  const root = 'Some Pack/assets/minecraft/textures/block/';
  const pack = await decodeMaterialPack(
    file({ [root + 'stone_s.png']: png(32), [root + 'stone_n.png']: png(32) }),
  );
  assert.equal(pack.count, 2);
  assert.equal(pack.resolution, 32);
  assert.equal(pack.hasSpecular, true);
  assert.equal(pack.hasNormals, true);
  await assert.rejects(
    decodeMaterialPack(
      file({ [root + 'stone_s.png']: png(32), [root + 'stone.png']: png(16) }),
    ),
    /尺寸不同/,
  );
  await assert.rejects(
    decodeMaterialPack(file({ 'pack.mcmeta': new Uint8Array([1]) })),
    /未找到/,
  );
  assert.deepEqual(materialNames('strippedBirchWood:top'), [
    'stripped_birch_log_top',
    'stripped_birch_log',
  ]);
  assert.deepEqual(materialNames('planksStairs:side'), ['oak_planks']);
});
