import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DataUtils } from 'three';
import { unpackPhotonScattering } from '../src/photon-scattering-data.js';

test('pinned Photon scattering asset is intact and every RGB16F voxel reaches RGBA16F', async () => {
  const bytes = await readFile(
    new URL('../src/assets/photon-scattering.dat', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'd4834ef3babc1376f923f39d495d69dd9d7099f56feb40335a184af8a6b98fc6',
  );
  const rgba = unpackPhotonScattering(bytes);
  assert.equal(rgba.byteLength, 524288);
  let max = 0,
    min = Infinity,
    negative = 0;
  for (let i = 0; i < 65536; i++) {
    for (let c = 0; c < 3; c++) {
      const raw = bytes.readUInt16LE((i * 3 + c) * 2);
      assert.equal(rgba[i * 4 + c], raw);
      const value = DataUtils.fromHalfFloat(raw);
      assert.ok(Number.isFinite(value));
      if (value < 0) negative++;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    assert.equal(rgba[i * 4 + 3], 0x3c00);
  }
  // The source table includes small signed residuals. Keep them through
  // interpolation/colour conversion; clipping the raw asset would change it.
  assert.equal(negative, 1467);
  assert.equal(min, -0.000015139579772949219);
  assert.equal(max, 0.517578125);
});

test('scattering decoder rejects incomplete assets and honors a byte-view offset', () => {
  assert.throws(
    () => unpackPhotonScattering(new Uint8Array(393215)),
    RangeError,
  );
  const full = new Uint8Array(393220);
  full[2] = 0x55;
  full[3] = 0x35;
  const rgba = unpackPhotonScattering(full.subarray(2, 393218));
  assert.equal(rgba[0], 0x3555);
  assert.equal(rgba[1], 0);
  assert.equal(rgba.at(-1), 0x3c00);
});
