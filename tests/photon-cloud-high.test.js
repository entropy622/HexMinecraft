import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Color, PerspectiveCamera, Vector4 } from 'three';
import { cloudCoverageWeather, cloudWeather } from '../src/cloud-field.js';
import { HexClouds } from '../src/clouds.js';
import { createCloudOptics, setCloudOptics } from '../src/cloud-optics.js';
import {
  cloudDetailData,
  cloudCoverageData,
} from './fixtures/cloud-detail-data.js';

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
test('source thin-cloud weather independently controls wisps and wind-driven cells without a permanent cell floor', () => {
  const calm = cloudCoverageWeather(0.5, 0.5, 0, 0),
    coldWet = cloudCoverageWeather(0, 1, 1, 1),
    hot = cloudCoverageWeather(1, 1, 1, 0),
    weak = cloudCoverageWeather(0.5, 0.5, 0.1, 0);
  close(calm.cirrus, 0.3);
  close(calm.cirrocumulus, 0);
  close(coldWet.cirrus, 0.75);
  close(coldWet.cirrocumulus, 0.8);
  close(hot.cirrus, 0.05);
  close(hot.cirrocumulus, 0.728);
  assert.ok(
    weak.cirrocumulus < 0.25,
    'Even a maximal coverage texel cannot pass the source coverage threshold in this calm weather',
  );
});

test('saved wetness supplies post-rain cloud climate without creating a new clock or moving the spatial wind field', () => {
  const dry = cloudWeather(624, 120, 0.6, 0.5, 0, 0, 0),
    damp = cloudWeather(624, 120, 0.6, 0.5, 0, 0, 0.25),
    drying = cloudWeather(624, 120, 0.6, 0.5, 0, 0, 0.24);
  close(damp.humidity - dry.humidity, 0.25);
  close(damp.shear - dry.shear, 0.6 * 0.33 * 0.25);
  close(damp.humidity - drying.humidity, 0.01);
  assert.deepEqual(damp.winds, dry.winds);
  assert.deepEqual(damp.noiseOffset, dry.noiseOffset);
  const clouds = new HexClouds(
      new Scene(),
      { up: new Color(), down: new Color() },
      cloudDetailData,
      cloudCoverageData,
    ),
    frame = {
      world: { seed: 624, dimension: 'overworld' },
      camera: new PerspectiveCamera(),
      time: 120,
      rain: 0,
      storm: 0,
      quality: 1.7,
      enabled: true,
    };
  clouds.prepare({ ...frame, wetness: 0 });
  const before = structuredClone(clouds.climate);
  clouds.prepare({ ...frame, wetness: 0.25 });
  assert.ok(clouds.climate.humidity > before.humidity);
  assert.equal(clouds.uniforms.cloudLayers.value[2].z, clouds.climate.cirrus);
  assert.equal(
    clouds.uniforms.cloudLayers.value[2].w,
    clouds.climate.cirrocumulus,
  );
  const visibleClimate = structuredClone(clouds.climate);
  clouds.prepare({ ...frame, wetness: 0.25, enabled: false });
  assert.deepEqual(
    clouds.climate,
    visibleClimate,
    'Fog retains the same wet climate when cloud drawing is hidden',
  );
  clouds.mesh.geometry.dispose();
  clouds.mesh.material.dispose();
  clouds.noise.dispose();
  clouds.worley.dispose();
});

test('thin-cloud density receives source day_factor in the shared optical snapshot, independent of its cell amount', () => {
  const optics = createCloudOptics(),
    layers = [
      new Vector4(52, 60, 0.5, 0),
      new Vector4(160, 24, 0.4, 0),
      new Vector4(300, 3.5, 0.3, 0.8),
    ];
  setCloudOptics(optics, { x: 0.6, y: 0.8 }, 0, layers);
  close(optics[2].z, 1);
  setCloudOptics(optics, { x: 1, y: 0 }, 0, layers);
  close(optics[2].z, 0);
  setCloudOptics(optics, { x: 0.6, y: -0.8 }, 0, layers);
  close(optics[2].z, 1); // The source uses abs(sun_dir.y), also at midnight.
  layers[2].w = 0;
  setCloudOptics(optics, { x: 1, y: 0.15 }, 0, layers);
  close(optics[2].z, 0.5);
});
