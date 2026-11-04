import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeMaterialPNG, materialNames } from '../src/material-pack.js';
import { REWORKED_TEXTURES } from '../src/native-texture-sources.js';
import {
  createNativeMaterialDetail,
  nativeMaterialProfile,
} from '../src/native-material-detail.js';

test('selected material media retains source hashes, native frames and visible pixels', async () => {
  const root = new URL('../public/textures/voxels-reworked/', import.meta.url),
    source = JSON.parse(await readFile(new URL('source.json', root), 'utf8'));
  assert.equal(source.license, 'CC-BY-SA-4.0');
  assert.deepEqual(
    new Set(source.files.map((f) => f.file.slice(0, -4))),
    REWORKED_TEXTURES,
  );
  for (const entry of source.files) {
    const raw = await readFile(new URL(entry.file, root)),
      image = decodeMaterialPNG(raw);
    assert.equal(
      createHash('sha256').update(raw).digest('hex'),
      entry.sha256,
      entry.file,
    );
    assert.equal(image.width, 16, entry.file);
    assert.equal(image.height % 16, 0, entry.file);
    let visible = 0;
    for (let i = 3; i < image.data.length; i += 4)
      visible += Number(image.data[i] > 0);
    assert.ok(visible > 0, entry.file);
  }
});

test('native relief is bounded and stone and ore keep different roughness', async () => {
  const root = new URL('../public/textures/voxels-reworked/', import.meta.url),
    results = [];
  for (const [name, tile] of [
    ['default_stone', 'stone:top'],
    ['mcl_core_copper_ore', 'copperOre:side'],
  ]) {
    const file = name === 'mcl_core_copper_ore' ? 'mcl_copper_ore' : name;
    const image = decodeMaterialPNG(
        await readFile(new URL(file + '.png', root)),
      ),
      detail = createNativeMaterialDetail(tile, image);
    assert.ok(detail);
    let min = 1,
      max = 0,
      sloped = 0;
    for (let i = 0; i < detail.data.length; i += 4) {
      const x = detail.data[i] / 127.5 - 1,
        y = detail.data[i + 1] / 127.5 - 1;
      assert.ok(
        x * x + y * y < 0.04,
        'Pixel relief must not overwhelm the flat block normal',
      );
      if (Math.hypot(x, y) > 0.015) sloped++;
      min = Math.min(min, detail.data[i + 2] / 255);
      max = Math.max(max, detail.data[i + 2] / 255);
    }
    assert.ok(sloped > 8);
    results.push({ min, max });
  }
  assert.ok(results[0].min > 0.7);
  assert.ok(
    results[1].min < results[0].min - 0.1,
    'Ore inclusions have a local glint',
  );
});

test('cut stone reuses the parent profile while foliage, transparent and emissive tiles stay separate', () => {
  assert.deepEqual(materialNames('brick:side'), ['stone_bricks']);
  assert.deepEqual(
    nativeMaterialProfile('stoneSlab:top'),
    nativeMaterialProfile('stone:top'),
  );
  for (const tile of ['leaves:top', 'vine:side', 'glass:side', 'glowstone:top'])
    assert.equal(nativeMaterialProfile(tile), null, tile);
  const data = new Uint8Array(16 * 16 * 4).fill(255);
  data[3] = 0;
  assert.equal(
    createNativeMaterialDetail('stone:top', { width: 16, height: 16, data }),
    null,
  );
});

test('metal, gemstone and snow relief preserves native optical classes and wool has a weave', () => {
  const image = {
    width: 16,
    height: 16,
    data: Uint8Array.from({ length: 1024 }, (_, i) =>
      i % 4 === 3 ? 255 : (Math.floor(i / 4) % 16) * 13,
    ),
  };
  for (const name of [
    'goldBlock:top',
    'ironBlock:side',
    'amethystBlock:side',
    'obsidian:top',
    'snow:top',
  ]) {
    const detail = createNativeMaterialDetail(name, image);
    assert.ok(detail, name);
    assert.equal(detail.preserveOptics, true, name);
    assert.equal(nativeMaterialProfile(name).roughness, null, name);
  }
  const cloth = createNativeMaterialDetail('redWool:top', image);
  assert.equal(cloth.preserveOptics, false);
  assert.ok(
    [...cloth.data].some((v, i) => i % 4 === 0 && Math.abs(v - 128) > 1),
  );
});

test('birch pigment changes do not turn its marks into relief', () => {
  const make = (value) => ({
    width: 16,
    height: 16,
    data: Uint8Array.from({ length: 16 * 16 * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : value,
    ),
  });
  assert.deepEqual(
    createNativeMaterialDetail('birchWood:side', make(10)),
    createNativeMaterialDetail('birchWood:side', make(245)),
  );
});
