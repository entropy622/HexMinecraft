import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudWeather,
  cloudNoiseData,
  cloudCoverageWeather,
} from '../src/cloud-field.js';
import {
  Color,
  Vector3,
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  LightProbe,
  RedFormat,
  UnsignedByteType,
} from 'three';
import { HexClouds } from '../src/clouds.js';
import {
  cloudDetailData,
  cloudCoverageData,
} from './fixtures/cloud-detail-data.js';
import { World } from '../src/world.js';
import {
  createCloudOptics,
  setCloudOptics,
  CLOUD_METRES_PER_UNIT,
} from '../src/cloud-optics.js';

test('Photon default cloud coefficients match noon, horizon, rain, overcast and stratus source limits', () => {
  const optics = createCloudOptics(),
    layers = [
      { z: 0.5, w: 0 },
      { z: 0.4, w: 0 },
      { z: 0.4, w: 0 },
    ],
    sun = { x: 0.6, y: 0.8 };
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
  setCloudOptics(optics, sun, 0, layers);
  optics.forEach((v, i) => close(v.x, [0.1, 0.032, 0.15][i]));
  close(optics[0].x * CLOUD_METRES_PER_UNIT, 2);
  setCloudOptics(optics, sun, 1, layers);
  close(optics[0].x, 0.067);
  close(optics[1].x, 0.032);
  optics.forEach((v, i) => close(v.y, [0.66, 0.75, 1][i]));
  setCloudOptics(optics, { x: 1, y: 0 }, 0, layers);
  close(optics[0].x, 0.05);
  close(optics[1].x, 0.016);
  close(optics[2].w, 1);
  layers[0].z = 0.95;
  setCloudOptics(optics, sun, 0, layers);
  close(optics[0].x, 0.07);
  layers[0].w = 1;
  layers[1].z = 0.6;
  layers[1].w = 1;
  setCloudOptics(optics, sun, 0, layers);
  close(optics[0].x, 0.02);
  close(optics[0].w, 1);
  close(optics[1].x, 0.016);
  close(optics[1].w, 1.4);
  // Production uses the source pair's upper endpoint for dense cumulus and
  // its weighted upper-deck coverage, rather than the old scalar metadata.
  layers[0].z = layers[1].z = 0.1;
  layers[0].w = layers[1].w = 0;
  const ranges = [
    { x: 0.3, y: 0.95 },
    { x: 0.1, y: 0.3 },
  ];
  setCloudOptics(optics, sun, 0, layers, ranges);
  close(optics[0].x, 0.07);
  ranges[1] = { x: 0.3, y: 0.7 };
  layers[1].w = 1;
  setCloudOptics(optics, sun, 0, layers, ranges);
  close(optics[0].x, 0.028);
  close(optics[0].w, 1);
  close(optics[1].w, 1.4);
});

test('cloud optical updates retain published vector identities and are continuous at the solar density knee', () => {
  const optics = createCloudOptics(),
    refs = [...optics],
    layers = [
      { z: 0.5, w: 0.2 },
      { z: 0.4, w: 0.3 },
      { z: 0.6, w: 0 },
    ];
  setCloudOptics(optics, { x: 1, y: 0.3 - 1e-6 }, 0.5, layers);
  const before = optics.map((v) => v.toArray());
  setCloudOptics(optics, { x: 1, y: 0.3 + 1e-6 }, 0.5, layers);
  for (let i = 0; i < 3; i++) {
    assert.equal(optics[i], refs[i]);
    optics[i]
      .toArray()
      .forEach((v, c) =>
        assert.ok(Number.isFinite(v) && Math.abs(v - before[i][c]) < 1e-5),
      );
  }
});

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
            for (const v of [
              c.humidity,
              c.stratus,
              c.altoStratus,
              ...c.coverage,
              ...c.ranges.flat(),
            ])
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
  assert.ok(wet.humidity > dry.humidity + 0.3);
  assert.ok(wet.shear > dry.shear);
  assert.ok(wet.coverage[0] > dry.coverage[0] + 0.25);
  assert.ok(wet.ranges[1][1] > dry.ranges[1][1] + 0.25);
  // A weather transition changes morphology, never the world-space wind offset.
  assert.deepEqual(wet.winds, dry.winds);
  const later = cloudWeather(624, 220, 0.9, 0.1, 0, 0);
  const d = later.winds.map((p, i) => p.map((v, j) => v - dry.winds[i][j]));
  for (let i = 0; i < 2; i++)
    assert.ok(Math.abs(d[i][0] * d[i + 1][1] - d[i][1] * d[i + 1][0]) > 1);
});

test('warm humid weather keeps cumulus while cold upper sheets vary independently', () => {
  const warm = cloudCoverageWeather(0.9, 0.9, 0.5),
    warmDry = cloudCoverageWeather(0.9, 0.1, 0.5),
    cool = cloudCoverageWeather(0.4, 0.9, 0.5);
  assert.equal(warm.stratus, 0);
  assert.equal(warm.altoStratus, 0);
  assert.ok(warm.ranges[0][1] > warmDry.ranges[0][1]);
  assert.ok(cool.stratus > warm.stratus);
  assert.ok(cool.altoStratus > cool.stratus + 0.2);
});

test('world cloud coverage keeps distinct seed identities without the old 127-seed alias', () => {
  const a = cloudNoiseData(624),
    b = cloudNoiseData(751);
  assert.notDeepEqual(a, b);
});

test('production cloud preparation derives all three layers and preserves low quality, dimension and toggle semantics', () => {
  const clouds = new HexClouds(
      new Scene(),
      {
        up: new Color(0),
        down: new Color(0),
      },
      cloudDetailData,
      cloudCoverageData,
    ),
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
    sun,
    flash: 0,
    quality: 1.7,
    enabled: true,
  };
  clouds.prepare(frame);
  const u = clouds.uniforms;
  assert.equal(clouds.worley.format, RedFormat);
  assert.equal(clouds.worley.type, UnsignedByteType);
  assert.equal(clouds.worley.image.data, cloudDetailData);
  assert.ok(u.cloudFar.value > camera.far);
  assert.equal(u.cloudVolumetric.value, 1);
  assert.ok(
    u.cloudLayers.value[0].y >= 50,
    'At 20 m/local unit the primary cumulus must span at least one kilometre',
  );
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
  clouds.prepare(frame);
  const edge = u.cloudLayers.value.map((v) => v.z);
  camera.position.x += 0.00002;
  clouds.prepare(frame);
  assert.ok(
    u.cloudLayers.value.every((v, i) => Math.abs(v.z - edge[i]) < 1e-6),
  );
  camera.position.set(-400, 140, 200);
  clouds.prepare({ ...frame, rain: 1, storm: 1 });
  assert.deepEqual(
    u.cloudLayerWind.value.map((v) => v.toArray()),
    wind,
  );
  assert.deepEqual(u.cloudCurvatureOrigin.value.toArray(), [-400, 200]);
  clouds.prepare({ ...frame, quality: 1 });
  assert.ok(clouds.mesh.visible && clouds.mesh.count > 0);
  assert.equal(u.cloudVolumetric.value, 0);
  assert.equal(u.cloudEnabled.value, 1);
  clouds.prepare({ ...frame, quality: 0.65 });
  assert.equal(u.cloudEnabled.value, 0);
  assert.ok(clouds.mesh.visible);
  clouds.prepare({ ...frame, enabled: false });
  assert.equal(u.cloudEnabled.value, 0);
  assert.equal(u.cloudVolumetric.value, 0);
  assert.equal(clouds.mesh.visible, false);
  const detailVersion = clouds.worley.version;
  clouds.prepare({
    ...frame,
    world: new World(751, 'overworld', { load: false }),
  });
  assert.equal(clouds.worley.image.data, cloudDetailData);
  assert.equal(clouds.worley.version, detailVersion);
  world.dimension = 'nether';
  clouds.prepare(frame);
  assert.equal(u.cloudVolumetric.value, 0);
  assert.equal(clouds.mesh.visible, false);
  clouds.noise.dispose();
  clouds.worley.dispose();
  clouds.mesh.geometry.dispose();
  clouds.material.dispose();
});

test('cloud sky and ground radiance use separate raw clear hemispheres without reading cloudy SH', () => {
  const probe = new LightProbe(),
    scene = new Scene(),
    clear = { up: new Color(0), down: new Color(0) },
    clouds = new HexClouds(scene, clear, cloudDetailData, cloudCoverageData),
    camera = new PerspectiveCamera(72, 1, 0.08, 220),
    sun = new DirectionalLight(),
    world = new World(624, 'overworld', { load: false });
  sun.position.set(1, 2, 0);
  const frame = {
    world,
    camera,
    sun,
    time: 120,
    rain: 0,
    storm: 0,
    flash: 0,
    quality: 1.7,
    enabled: true,
  };
  const radiance = [0.2, 0.4, 0.6];
  probe.sh.coefficients[0]
    .fromArray(radiance)
    .multiplyScalar(Math.sqrt(4 * Math.PI));
  for (const [normal, color] of [
    [new Vector3(0, 1, 0), clear.up],
    [new Vector3(0, -1, 0), clear.down],
  ]) {
    const v = probe.sh.getIrradianceAt(normal, new Vector3());
    color.setRGB(v.x, v.y, v.z);
  }
  clouds.prepare(frame);
  clouds.frame(frame);
  const u = clouds.uniforms;
  for (let c = 0; c < 3; c++) {
    assert.ok(Math.abs(u.cloudAmbient.value.toArray()[c] - radiance[c]) < 1e-5);
    assert.ok(Math.abs(u.cloudGround.value.toArray()[c] - radiance[c]) < 1e-5);
  }
  // Analytic irradiance convolution of a first-order Y spherical harmonic.
  probe.sh.coefficients[1].setScalar(0.1);
  for (const [normal, color] of [
    [new Vector3(0, 1, 0), clear.up],
    [new Vector3(0, -1, 0), clear.down],
  ]) {
    const v = probe.sh.getIrradianceAt(normal, new Vector3());
    color.setRGB(v.x, v.y, v.z);
  }
  clouds.prepare(frame);
  clouds.frame(frame);
  const delta = 0.1 * (2 / 3) * Math.sqrt(3 / (4 * Math.PI));
  for (let c = 0; c < 3; c++) {
    assert.ok(
      Math.abs(u.cloudAmbient.value.toArray()[c] - radiance[c] - delta) < 1e-5,
    );
    assert.ok(
      Math.abs(u.cloudGround.value.toArray()[c] - radiance[c] + delta) < 1e-5,
    );
  }
  clouds.noise.dispose();
  clouds.worley.dispose();
  clouds.mesh.geometry.dispose();
  clouds.material.dispose();
});
