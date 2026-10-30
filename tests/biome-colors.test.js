import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import {
  BiomeColors,
  BIOME_COLORS,
  biomeTintKind,
  colorMapIndex,
} from '../src/biome-colors.js';
import { decodeMaterialPNG, decodeMaterialPack } from '../src/material-pack.js';
const palettes = () =>
  Object.fromEntries(
    ['grass', 'foliage'].map((type) => [
      type,
      decodeMaterialPNG(
        readFileSync(
          new URL(
            '../public/textures/pixel-perfection/mcl_core_palette_' +
              type +
              '.png',
            import.meta.url,
          ),
        ),
      ),
    ]),
  );
test('native biome palettes and resource maps use separate indexed and climate lookup conventions', () => {
  const colors = new BiomeColors(palettes());
  assert.deepEqual(colors.color('森林', 'foliage'), [94, 190, 107]);
  assert.deepEqual(colors.color('青翠平原', 'grass'), [109, 196, 117]);
  assert.deepEqual(colors.color('丛林', 'foliage'), [93, 181, 76]);
  const map = { width: 256, height: 256, data: new Uint8Array(256 * 256 * 4) };
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      map.data.set([x, y, 255 - x, 255], (y * 256 + x) * 4);
  colors.setPack({ images: new Map([['colormap:foliage', map]]) });
  for (const [name, index] of [
    ['青翠平原', 44338],
    ['森林', 28748],
    ['白桦林', 41829],
    ['丛林', 9228],
    ['沙漠', 65280],
    ['雪原', 65535],
  ]) {
    const c = BIOME_COLORS[name];
    assert.equal(
      colorMapIndex(Math.fround(c.temperature), Math.fround(c.downfall)),
      index,
    );
    assert.deepEqual(colors.color(name, 'foliage'), [
      index % 256,
      index >> 8,
      255 - (index % 256),
    ]);
  }
  assert.deepEqual(colors.color('森林', 'grass'), [94, 190, 107]);
});
test('hex blend radius two crosses negative chunk edges, caches derived colors and clears for packs and worlds', () => {
  const colors = new BiomeColors(palettes());
  let calls = 0;
  const world = {
    dimension: 'overworld',
    biome(q) {
      calls++;
      return q < 0 ? '森林' : '青翠平原';
    },
  };
  const at = colors.tint(world, 0, 0, 2),
    forest = [94, 190, 107],
    plains = [109, 196, 117];
  assert.deepEqual(at, [
    ...forest.map((v, c) => Math.floor((v * 7 + plains[c] * 12) / 19)),
    2,
  ]);
  assert.equal(calls, 19);
  assert.equal(colors.tint(world, 0, 0, 2), at);
  assert.equal(calls, 19);
  assert.deepEqual(colors.tint(world, -8, -8, 2), [...forest, 2]);
  assert.equal(biomeTintKind('birchLeaves:top'), 0);
  assert.equal(biomeTintKind('spruceLeaves:side'), 0);
  assert.equal(biomeTintKind('jungleLeaves:top'), 3);
  assert.equal(biomeTintKind('flower'), 0);
  const another = { dimension: 'overworld', biome: () => '丛林' };
  assert.deepEqual(colors.tint(another, 0, 0, 3), [93, 181, 76, 3]);
  colors.setPack(null);
  assert.equal(colors.blended.size, 0);
  assert.equal(colors.base.size, 0);
});
test('palette-only ZIP does not raise block resolution and malformed color maps preserve validation boundaries', async () => {
  const root = 'assets/minecraft/textures/colormap/',
    png = (size) =>
      encode({
        width: size,
        height: size,
        data: new Uint8Array(size * size * 4).fill(255),
        channels: 4,
      }),
    file = (entries) => new File([zipSync(entries)], 'colors.zip');
  const pack = await decodeMaterialPack(
    file({ [root + 'grass.png']: png(256), [root + 'foliage.png']: png(256) }),
  );
  assert.equal(pack.count, 2);
  assert.equal(pack.resolution, 16);
  assert.equal(pack.hasNormals, false);
  assert.equal(pack.hasSpecular, false);
  await assert.rejects(
    decodeMaterialPack(file({ [root + 'grass.png']: png(16) })),
    /256/,
  );
});
