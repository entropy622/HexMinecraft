import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudWeather,
  cloudNoiseData,
  cloudWorleyData,
} from '../src/cloud-field.js';
import { Scene, PerspectiveCamera, DirectionalLight, Color } from 'three';
import { HexClouds } from '../src/clouds.js';
import { World } from '../src/world.js';

test('derived cloud climate is bounded, deterministic and varies continuously without a saved weather clock', () => {
  for (const seed of [0, 624, 751, 999999])
    for (const time of [0, 120, 600, 1e6])
      for (const heat of [0, 1])
        for (const wet of [0, 1])
          for (const rain of [0, 1]) {
            const c = cloudWeather(seed, time, heat, wet, rain, rain);
            assert.deepEqual(
              c,
              cloudWeather(seed, time, heat, wet, rain, rain),
            );
            for (const v of [c.humidity, c.stratus, ...c.coverage])
              assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
            assert.ok(c.winds.flat().every(Number.isFinite));
            const next = cloudWeather(seed, time + 0.01, heat, wet, rain, rain);
            assert.ok(
              c.winds.every(
                (p, i) =>
                  Math.hypot(...p.map((v, j) => v - next.winds[i][j])) < 0.003,
              ),
            );
          }
  const dry = cloudWeather(624, 120, 0.9, 0.1, 0, 0),
    wet = cloudWeather(624, 120, 0.2, 0.9, 1, 1);
  assert.ok(wet.stratus > dry.stratus + 0.4);
  assert.ok(wet.coverage[0] > dry.coverage[0] + 0.25);
  assert.ok(wet.coverage[1] > dry.coverage[1] + 0.25);
  // A weather transition changes morphology, never the world-space wind offset.
  assert.deepEqual(wet.winds, dry.winds);
  const later = cloudWeather(624, 220, 0.9, 0.1, 0, 0);
  const d = later.winds.map((p, i) => p.map((v, j) => v - dry.winds[i][j]));
  for (let i = 0; i < 2; i++)
    assert.ok(Math.abs(d[i][0] * d[i + 1][1] - d[i][1] * d[i + 1][0]) > 1);
});

test('seeded tileable cloud fields have useful distribution without the old 127-seed alias', () => {
  const a = cloudNoiseData(624),
    b = cloudNoiseData(751);
  assert.notDeepEqual(a, b);
  const field = cloudWorleyData(624),
    other = cloudWorleyData(751);
  assert.equal(field.length, 64 ** 3);
  assert.deepEqual(field, cloudWorleyData(624));
  assert.notDeepEqual(field, other);
  const mean = field.reduce((n, v) => n + v, 0) / field.length;
  const variance =
    field.reduce((n, v) => n + (v - mean) ** 2, 0) / field.length;
  assert.ok(mean > 60 && mean < 200);
  assert.ok(variance > 500);
  for (let axis = 0; axis < 3; axis++) {
    let seam = 0,
      adjacent = 0;
    for (let u = 0; u < 64; u++)
      for (let v = 0; v < 64; v++) {
        const sample = (n) => {
          const p = [u, v];
          p.splice(axis, 0, n);
          return field[(p[2] * 64 + p[1]) * 64 + p[0]];
        };
        seam += Math.abs(sample(0) - sample(63));
        adjacent += Math.abs(sample(31) - sample(32));
      }
    assert.ok(seam < adjacent * 1.6 && seam > adjacent * 0.5);
  }
});

test('production cloud frame derives all three layers and preserves low quality, dimension and toggle semantics', () => {
  const clouds = new HexClouds(new Scene()),
    camera = new PerspectiveCamera(72, 1, 0.08, 220),
    sun = new DirectionalLight();
  sun.position.set(1, 2, 0);
  const world = new World(624, 'overworld', { load: false });
  const frame = {
    world,
    camera,
    time: 120,
    rain: 0,
    storm: 0,
    sky: new Color('#8cc9ee'),
    horizon: new Color('#d9e4df'),
    sun,
    day: 1,
    flash: 0,
    quality: 1.7,
    enabled: true,
  };
  clouds.frame(frame);
  const u = clouds.uniforms;
  assert.ok(u.cloudFar.value > camera.far);
  assert.equal(u.cloudVolumetric.value, 1);
  assert.ok(
    u.cloudLayers.value[0].x + u.cloudLayers.value[0].y <
      u.cloudLayers.value[1].x,
  );
  assert.ok(
    u.cloudLayers.value[1].x + u.cloudLayers.value[1].y <
      u.cloudLayers.value[2].x,
  );
  const wind = u.cloudLayerWind.value.map((v) => v.toArray());
  camera.position.set(Math.sqrt(3) / 2 - 0.00001, 25, 0);
  clouds.frame(frame);
  const edge = u.cloudLayers.value.map((v) => v.z);
  camera.position.x += 0.00002;
  clouds.frame(frame);
  assert.ok(
    u.cloudLayers.value.every((v, i) => Math.abs(v.z - edge[i]) < 1e-6),
  );
  camera.position.set(-400, 140, 200);
  clouds.frame({ ...frame, rain: 1, storm: 1 });
  assert.deepEqual(
    u.cloudLayerWind.value.map((v) => v.toArray()),
    wind,
  );
  assert.deepEqual(u.cloudCurvatureOrigin.value.toArray(), [-400, 200]);
  clouds.frame({ ...frame, quality: 1 });
  assert.ok(clouds.mesh.visible && clouds.mesh.count > 0);
  assert.equal(u.cloudVolumetric.value, 0);
  assert.equal(u.cloudEnabled.value, 1);
  clouds.frame({ ...frame, quality: 0.65 });
  assert.equal(u.cloudEnabled.value, 0);
  assert.ok(clouds.mesh.visible);
  clouds.frame({ ...frame, enabled: false });
  assert.equal(u.cloudEnabled.value, 0);
  assert.equal(u.cloudVolumetric.value, 0);
  assert.equal(clouds.mesh.visible, false);
  world.dimension = 'nether';
  clouds.frame(frame);
  assert.equal(u.cloudVolumetric.value, 0);
  assert.equal(clouds.mesh.visible, false);
  clouds.noise.dispose();
  clouds.worley.dispose();
  clouds.mesh.geometry.dispose();
  clouds.material.dispose();
});
