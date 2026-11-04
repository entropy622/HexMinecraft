import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { BLOCKS } from '../src/core.js';
import { blockTextures } from '../src/texture-pack.js';
import { REWORKED_TEXTURES } from '../src/native-texture-sources.js';
import {
  nativeTextureRoute,
  nativeMaterialCoverage,
} from '../src/native-material-catalog.js';
import { nativeMaterialProfile } from '../src/native-material-detail.js';
import { materialNames } from '../src/material-pack.js';

test('every current block has a resolvable native material route with no missing source image', async () => {
  const rows = nativeMaterialCoverage(blockTextures);
  assert.equal(rows.length, Object.keys(BLOCKS).length);
  for (const { id, route } of rows) {
    assert.ok(route, 'Unclassified block ' + id);
    const visited = new Set([id]);
    let resolved = route;
    while (resolved?.kind === 'alias') {
      assert.ok(!visited.has(resolved.tile), 'Texture alias cycle at ' + id);
      visited.add(resolved.tile);
      resolved = nativeTextureRoute(resolved.tile, blockTextures);
    }
    assert.ok(resolved, 'Missing parent texture for ' + id);
    if (resolved.kind === 'image')
      for (const name of resolved.images) {
        const dir = REWORKED_TEXTURES.has(name)
          ? 'voxels-reworked'
          : 'pixel-perfection';
        await access(
          new URL(`../public/textures/${dir}/${name}.png`, import.meta.url),
        );
      }
  }
  assert.equal(nativeTextureRoute('unclassifiedNewBlock', blockTextures), null);
});

test('carpets, cauldron contents and joinery use their actual shared material', () => {
  assert.equal(nativeTextureRoute('redCarpet', blockTextures).tile, 'redWool');
  assert.equal(
    nativeTextureRoute('waterCauldron3', blockTextures).tile,
    'cauldron',
  );
  assert.deepEqual(materialNames('redCarpet:top'), ['red_wool']);
  assert.deepEqual(materialNames('jungleDoorTop:side'), ['jungle_door_top']);
  assert.deepEqual(materialNames('birchFence:side'), ['birch_planks']);
  assert.deepEqual(materialNames('waterCauldron3:side'), [
    'cauldron_side',
    'cauldron',
  ]);
  assert.deepEqual(
    nativeMaterialProfile('redCarpet:top'),
    nativeMaterialProfile('redWool:top'),
  );
});
