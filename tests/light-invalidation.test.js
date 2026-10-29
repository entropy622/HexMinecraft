import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { VoxelLight } from '../src/voxel-light.js';
import { DynamicLight } from '../src/dynamic-light.js';
import { setCampfireLit } from '../src/campfires.js';

function fixture() {
  const world = new World(624, 'overworld', { load: false });
  world.generateChunk(0, 0);
  const light = new VoxelLight(world);
  return { world, light };
}

test('growth and opaque replacements reuse transport while block state still invalidates circuits', () => {
  const { world, light } = fixture();
  world.set(3, 40, 3, 'grass');
  world.set(4, 40, 3, 'cactus');
  light.update(0, true);
  const sky = light.sky,
    rgb = light.baseRGB,
    blockRevision = world.blockRevision;
  world.set(3, 40, 3, 'dirt');
  world.setState(4, 40, 3, { facing: 0, open: false, age: 12 });
  assert.equal(light.update(1), false);
  assert.equal(light.sky, sky);
  assert.equal(light.baseRGB, rgb);
  assert.ok(world.blockRevision > blockRevision);
  assert.equal(world.state(4, 40, 3).age, 12);
  // A forced recomputation is an independent check of the reused field.
  const oracle = new VoxelLight(world);
  oracle.update(0, true);
  assert.deepEqual(light.sky, oracle.sky);
  assert.deepEqual(light.rgb, oracle.rgb);
});

test('door halves, trapdoors, colored glass and powered lamps update real transport and upload', () => {
  const { world, light } = fixture(),
    gpu = new DynamicLight(),
    p = [3, 40, 3];
  const update = () => {
    assert.equal(light.update(1), true);
    gpu.upload(light);
    return light.index(...p);
  };
  world.set(...p, 'door');
  world.set(3, 41, 3, 'doorTop');
  let i = update();
  assert.equal(light.cost[i], 16);
  assert.equal(light.cost[light.index(3, 41, 3)], 16);
  world.setState(3, 41, 3, { facing: 0, open: true });
  i = update();
  assert.equal(light.cost[i], 1);
  assert.equal(light.cost[light.index(3, 41, 3)], 1);
  world.set(...p, 'trapdoor');
  i = update();
  assert.equal(light.cost[i], 3);
  assert.equal(light.medium[i], 13);
  world.setState(...p, { facing: 0, open: true });
  i = update();
  assert.equal(light.cost[i], 1);
  assert.equal(light.medium[i], 0);
  world.set(...p, 'redStainedGlass');
  i = update();
  const redPalette = gpu.data.slice(i * 4, i * 4 + 2);
  world.set(...p, 'blueStainedGlass');
  update();
  assert.equal(light.cost[i], 1);
  assert.equal(light.medium[i], 14);
  assert.notDeepEqual(gpu.data.slice(i * 4, i * 4 + 2), redPalette);
  world.set(...p, 'redstoneLamp');
  update();
  assert.equal(light.rgb[0][i], 0);
  world.setState(...p, { facing: 0, open: false, powered: true });
  update();
  assert.deepEqual(
    light.rgb.map((channel) => channel[i]),
    [15, 13, 9],
  );
  world.setState(...p, { facing: 0, open: false, powered: false });
  update();
  assert.equal(light.rgb[0][i], 0);
  gpu.uniforms.entityLightVolume.value.dispose();
});

test('campfire extinction, liquid levels and emitter removal keep invalidating optical fields', () => {
  const { world, light } = fixture(),
    p = [3, 40, 3];
  world.set(...p, 'campfire');
  light.update(0, true);
  const i = light.index(...p);
  assert.deepEqual(
    light.rgb.map((channel) => channel[i]),
    [15, 10, 5],
  );
  assert.equal(setCampfireLit(world, p.join(','), false), true);
  assert.equal(light.update(1), true);
  assert.equal(light.rgb[0][i], 0);
  world.set(...p, null);
  world.fluids.write(...p, {
    type: 'water',
    source: false,
    falling: true,
    level: 0,
  });
  assert.equal(light.update(1), true);
  assert.equal(light.cost[i], 2);
  assert.equal(light.medium[i], 1);
  world.fluids.write(...p, { type: 'water', source: false, level: 6 });
  assert.equal(light.update(1), true);
  assert.equal(light.medium[i], 8);
  world.fluids.write(...p, null);
  world.set(...p, 'torch');
  assert.equal(light.update(1), true);
  assert.deepEqual(
    light.rgb.map((channel) => channel[i]),
    [14, 11, 7],
  );
  world.set(...p, null);
  assert.equal(light.update(1), true);
  assert.equal(light.rgb[0][i], 0);
});

test('frontier skylight equals an all-source flood through canopies, roofs, water and streamed bounds', () => {
  // Retain the slower all-source algorithm as the oracle: every nonzero
  // directly lit cell starts a full eight-neighbor flood, including open air.
  class AllSources extends VoxelLight {
    seedSkylight(buckets) {
      for (let i = 0; i < this.sky.length; i++)
        if (this.sky[i]) buckets[this.sky[i]].push(i);
    }
  }
  for (const dimension of ['overworld', 'nether', 'end']) {
    const world = new World(624, dimension, { load: false });
    world.generateChunk(-1, -1);
    world.generateChunk(0, -1);
    world.generateChunk(-1, 0);
    world.generateChunk(0, 0);
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 5; r++) {
        world.set(q, 42, r, (q + r) % 3 ? 'stone' : 'leaves');
        if (q >= 0 && r >= 0)
          for (let y = 35; y < 40; y++)
            world.fluids.write(q, y, r, {
              type: 'water',
              level: (q + r) % 8,
              source: false,
              falling: false,
            });
      }
    const actual = new VoxelLight(world),
      oracle = new AllSources(world);
    const compare = () => {
      actual.update(0, true);
      oracle.update(0, true);
      for (const property of ['cost', 'medium', 'sky', 'rgb'])
        assert.deepEqual(
          actual[property],
          oracle[property],
          `${dimension} ${property}`,
        );
    };
    compare();
    world.set(-1, 42, 0, null);
    world.set(0, 42, -1, 'glass');
    world.set(-2, 40, -2, 'torch');
    compare();
    world.unloadChunk(0, 0);
    world.generateChunk(-2, 1);
    compare();
    world.clearLoaded();
    world.generateChunk(7, -6);
    compare();
  }
});
