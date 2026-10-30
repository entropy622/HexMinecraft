import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, DirectionalLight, Color, Vector3 } from 'three';
import { FogBiomes, photonFogParameters } from '../src/photon-fog.js';
import { Atmosphere } from '../src/atmosphere.js';
import { HexClouds } from '../src/clouds.js';
import { Scene } from 'three';

const parameters = (extra = {}) =>
  photonFogParameters({
    sunDirection: { x: 1, y: 0.18 },
    humidity: 0,
    temperature: 0.5,
    rain: 0,
    biomes: [1, 0, 0, 0],
    ...extra,
  });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('Photon fog distinguishes sunrise, noon, sunset, midnight and blue hour using the sun, including below the horizon', () => {
  const morning = parameters(),
    noon = parameters({ sunDirection: { x: 0, y: 1 } }),
    evening = parameters({ sunDirection: { x: -1, y: 0.18 } }),
    night = parameters({ sunDirection: { x: 0, y: -1 } }),
    blue = parameters({ sunDirection: { x: -1, y: -0.07283 } });
  close(morning.mieExtinction, 0.007);
  close(noon.mieExtinction, 0.0001);
  close(evening.mieExtinction, 0.005);
  close(night.mieExtinction, 0.005);
  assert.ok(blue.mieExtinction > evening.mieExtinction);
  assert.ok(blue.glow > morning.glow);
  close(noon.rayleigh[0], 0.0005 * 0.31 ** 2.2);
  close(noon.rayleigh[1], 0.0005 * 0.67 ** 2.2);
  close(noon.rayleigh[2], 0.0005);
});

test('actual biome permissions separate rain, snow and dry desert; humid jungle retains its own spectrum', () => {
  const rain = parameters({ rain: 1 }),
    snow = parameters({ rain: 1, biomes: [0, 0, 1, 0] }),
    arid = parameters({ rain: 1, biomes: [0, 1, 0, 0] }),
    jungle = parameters({ humidity: 1, temperature: 1, biomes: [0, 0, 0, 1] });
  close(rain.mieExtinction, 0.03);
  close(rain.mieScattering, 0.015);
  close(snow.mieExtinction, 0.015);
  close(snow.mieScattering, 0.0135);
  close(arid.mieExtinction, parameters().mieExtinction);
  close(jungle.rayleigh[2], 0.0026);
  assert.ok(
    jungle.rayleigh[1] / jungle.rayleigh[2] >
      rain.rayleigh[1] / rain.rayleigh[2],
  );
  close(rain.direct, 0.1);
});

test('fog biome weights are continuous across negative cell boundaries and invalidate on world/dimension changes', () => {
  const sample = new FogBiomes(),
    world = {
      dimension: 'overworld',
      biome: (q) => (q < -2 ? '沙漠' : '丛林'),
    },
    at = (q) => sample.sample(world, { x: Math.sqrt(3) * q, z: 0 });
  const west = at(-10),
    east = at(10),
    a = at(-2 - 1e-7),
    b = at(-2 + 1e-7);
  assert.deepEqual(west, [0, 1, 0, 0]);
  assert.deepEqual(east, [0, 0, 0, 1]);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6);
  close(
    a.reduce((sum, x) => sum + x),
    1,
  );
  const other = { dimension: 'overworld', biome: () => '雪原' };
  assert.deepEqual(sample.sample(other, { x: 0, z: 0 }), [0, 0, 1, 0]);
  other.dimension = 'end';
  other.biome = () => '森林';
  assert.deepEqual(sample.sample(other, { x: 0, z: 0 }), [1, 0, 0, 0]);
});

test('fog uses shared climate with clouds hidden, disables inside liquids and starts clean across dimensions', () => {
  const camera = new PerspectiveCamera(),
    scene = new Scene(),
    clouds = new HexClouds(scene, { up: new Color(), down: new Color() }),
    air = new Atmosphere(camera),
    sun = new DirectionalLight(),
    world = { dimension: 'overworld', seed: 624, biome: () => '森林' };
  const args = {
    world,
    camera,
    time: 30,
    rain: 0,
    storm: 0,
    quality: 0.65,
    enabled: false,
  };
  clouds.prepare(args);
  const hidden = structuredClone(clouds.climate);
  assert.ok(hidden.temperature >= 0 && hidden.temperature <= 1);
  // The renderer setting controls drawing, rather than changing humidity/fog.
  clouds.prepare({ ...args, time: 120 });
  assert.notDeepEqual(hidden, clouds.climate);
  const state = {
    time: 30,
    dt: 0.016,
    dimension: 'overworld',
    world,
    climate: hidden,
    sunDirection: new Vector3(1, 0.18, 0),
    rain: 0,
    horizon: new Color(),
    sun,
    cameraSky: 1,
    medium: null,
    volume: false,
  };
  air.update(state);
  assert.ok(air.uniforms.airDensity.value > 0);
  air.update({ ...state, medium: 'water' });
  assert.equal(air.uniforms.airDensity.value, 0);
  assert.equal(air.uniforms.waterCamera.value, 1);
  air.update({ ...state, dimension: 'nether' });
  close(air.uniforms.airDensity.value, 0.018);
  assert.deepEqual(air.uniforms.airRayleigh.value.toArray(), [0, 0, 0]);
  air.update({ ...state, dimension: 'end' });
  close(air.uniforms.airDensity.value, 0.004);
  clouds.mesh.geometry.dispose();
  clouds.mesh.material.dispose();
  clouds.noise.dispose();
  clouds.worley.dispose();
});
