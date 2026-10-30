import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { packCloudDetail, setCloudDetail } from '../src/cloud-detail-data.js';
import { Vector4 } from 'three';
import { decode } from 'fast-png';
import {
  cloudNoiseData,
  cloudWeather,
  cloudCoverageWeather,
} from '../src/cloud-field.js';
import { photonWeather } from '../src/photon-weather.js';
import {
  packCloudCoverage,
  updateCloudSeed,
} from '../src/cloud-coverage-data.js';

test('Photon numeric coverage image and seed lattice retain all bytes in their isolated atlas regions', async () => {
  const png = await readFile(
    new URL('../src/assets/photon-noise.png', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(png).digest('hex'),
    '9972ae2cad05ccf00fbe2d81209244e265e3c089e840862f3cf0859443f77c34',
  );
  const image = decode(png);
  assert.deepEqual(
    [image.width, image.height, image.channels, image.depth],
    [512, 512, 4, 8],
  );
  const packed = packCloudCoverage(image.data, cloudNoiseData(624));
  const checkImage = () => {
    for (let y = 0; y < 512; y++)
      assert.deepEqual(
        packed.subarray(((y + 1) * 1024 + 129) * 4, ((y + 1) * 1024 + 641) * 4),
        image.data.subarray(y * 512 * 4, (y + 1) * 512 * 4),
      );
  };
  checkImage();
  for (let y = 0; y < 514; y++)
    for (const x of [0, 513]) {
      const destination = (y * 1024 + 128 + x) * 4,
        source = (((y + 511) % 512) * 512 + ((x + 511) % 512)) * 4;
      assert.deepEqual(
        packed.subarray(destination, destination + 4),
        image.data.subarray(source, source + 4),
      );
    }
  for (const y of [0, 513]) {
    const sourceRow = ((y + 511) % 512) * 512 * 4;
    assert.deepEqual(
      packed.subarray((y * 1024 + 129) * 4, (y * 1024 + 641) * 4),
      image.data.subarray(sourceRow, sourceRow + 512 * 4),
    );
  }
  const seed = cloudNoiseData(751);
  updateCloudSeed(packed, seed);
  for (let y = 0; y < 127; y++)
    for (let x = 0; x < 127; x++)
      assert.equal(packed[(y * 1024 + x) * 4], seed[y * 127 + x]);
  checkImage();
  assert.throws(
    () => packCloudCoverage(image.data.subarray(4), seed),
    RangeError,
  );
});

test('source coverage endpoints retain regional variation and independent upper weather', () => {
  const wind = 0.8,
    c = cloudCoverageWeather(0.6, 1, wind);
  assert.equal(c.stratus, 0);
  assert.ok(
    Math.abs(c.ranges[0][0] - (0.9 - 0.1 * (0.1 + 0.1 * wind))) < 1e-12,
  );
  assert.equal(c.ranges[0][1], 1);
  assert.equal(c.ranges[1][0], 0.5);
  assert.equal(c.ranges[1][1], 1);
  assert.notDeepEqual(
    cloudWeather(624, 0, 0.6, 1, 0, 0).noiseOffset,
    cloudWeather(751, 0, 0.6, 2, 0, 0).noiseOffset,
  );
});

test('Photon temporal weather keeps biome influence weak and saved wetness independently increases humidity and wind', () => {
  const dry = photonWeather(120, 0.6, 0, 0),
    humidBiome = photonWeather(120, 0.6, 1, 0),
    wet = photonWeather(120, 0.6, 1, 1);
  assert.ok(dry.humidity >= 0.2 && dry.humidity <= 0.8 * 1.02);
  assert.ok(Math.abs(humidBiome.humidity / dry.humidity - 1.12 / 1.02) < 1e-12);
  assert.equal(wet.humidity, 1);
  assert.ok(Math.abs(wet.wind - humidBiome.wind - 0.33) < 1e-12);
  assert.equal(humidBiome.temperature, dry.temperature);
  assert.ok(
    Math.abs(photonWeather(120, 1, 0, 0).temperature / dry.temperature - 1.04) <
      1e-12,
  );
});

test('pinned Photon cloud detail retains both source volumes and periodic guard slices byte for byte', async () => {
  const names = ['bubbly', 'swirley'],
    hashes = [
      '39f2d27cfe0dbbb2222cc9e2f7c37f3b93a0c7dd2567e6f6685b60dc16cefdf9',
      '6e13f05304287ae28efbcf73a44903a1dea77104617a8e591e4617a4bb1b0d8d',
    ],
    source = await Promise.all(
      names.map((name) =>
        readFile(
          new URL(`../src/assets/photon-worley-${name}.dat`, import.meta.url),
        ),
      ),
    );
  for (let c = 0; c < 2; c++)
    assert.equal(
      createHash('sha256').update(source[c]).digest('hex'),
      hashes[c],
    );
  const packed = packCloudDetail(...source);
  assert.equal(packed.byteLength, 64 * 64 * 132);
  for (let c = 0; c < 2; c++) {
    const start = c * 66 * 4096;
    assert.deepEqual(
      packed.subarray(start + 4096, start + 65 * 4096),
      new Uint8Array(source[c]),
    );
    assert.deepEqual(
      packed.subarray(start, start + 4096),
      new Uint8Array(source[c].subarray(-4096)),
    );
    assert.deepEqual(
      packed.subarray(start + 65 * 4096, start + 66 * 4096),
      new Uint8Array(source[c].subarray(0, 4096)),
    );
  }
  assert.notDeepEqual(source[0], source[1]);
});

test('cloud detail packing rejects incomplete volumes and preserves byte-view offsets', () => {
  const a = new Uint8Array(64 ** 3 + 2),
    b = new Uint8Array(64 ** 3 + 4);
  a[1] = 17;
  a[a.length - 2] = 91;
  b[2] = 63;
  b[b.length - 3] = 245;
  const packed = packCloudDetail(a.subarray(1, -1), b.subarray(2, -2));
  assert.equal(packed[4096], 17);
  assert.equal(packed[65 * 4096 - 1], 91);
  assert.equal(packed[67 * 4096], 63);
  assert.equal(packed[131 * 4096 - 1], 245);
  assert.throws(
    () => packCloudDetail(a.subarray(0, -3), b.subarray(2, -2)),
    RangeError,
  );
});

test('shared cloud detail parameters retain source weather limits and physical advection without replacing uniforms', () => {
  const drift = [new Vector4(), new Vector4()],
    shape = new Vector4(),
    climate = {
      stratus: 0,
      shear: 0.7,
      winds: [
        [10, -20],
        [-5, 30],
      ],
    };
  setCloudDetail(drift, shape, climate);
  assert.deepEqual(shape.toArray(), [0.33, 0.4, 3, 12]);
  for (const [actual, expected] of [
    [drift[0].toArray(), [0.216, -0.432, 1.4, -2.8]],
    [drift[1].toArray(), [-0.36, 2.16, 0, 0]],
  ])
    for (let i = 0; i < 4; i++)
      assert.ok(Math.abs(actual[i] - expected[i]) < 1e-12);
  const first = drift[0],
    second = drift[1];
  setCloudDetail(drift, shape, { ...climate, shear: 1.3 });
  for (const [a, b] of shape
    .toArray()
    .map((v, i) => [v, [0.495, 0.6, 3, 12][i]]))
    assert.ok(Math.abs(a - b) < 1e-12);
  setCloudDetail(drift, shape, { ...climate, stratus: 1, shear: 1.3 });
  assert.deepEqual(shape.toArray(), [0.07, 0.1, 2, 7]);
  assert.equal(drift[0], first);
  assert.equal(drift[1], second);
});
