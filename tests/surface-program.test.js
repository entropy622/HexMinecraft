import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshLambertMaterial, Vector3 } from 'three';
import { applySkylight } from '../src/skylight.js';
import {
  addSurfaceFeature,
  buildSurfaceProgram,
  createSurfaceRecordMaterial,
  surfaceProgramKey,
} from '../src/surface-program.js';
import { installRenderPipeline } from '../src/render-pipeline.js';
import { createSurfaceMaterial } from '../src/surface-material.js';

test('surface material factory exposes its actual shared environment producer', () => {
  const shared = { terrainWetness: { value: 0.6 } },
    created = createSurfaceMaterial(
      { vertexColors: true, alphaTest: 0.5 },
      shared,
    );
  assert.equal(created.uniforms, shared);
  assert.equal(created.material.vertexColors, true);
  assert.equal(created.material.alphaTest, 0.5);
  assert.ok(surfaceProgramKey(created.material));
  created.material.dispose();
});

test('owned surface stages share one material decoder and preserve producer uniforms in record variants', () => {
  const material = new MeshLambertMaterial({ transparent: true }),
    shared = { terrainWetness: { value: 0.4 } };
  applySkylight(material, shared, true);
  addSurfaceFeature(material, {
    id: 'filter-b',
    version: 1,
    order: 20,
    uniforms: { testProducer: { value: 7 } },
    stages: { directional_filter: '// filter B' },
  });
  addSurfaceFeature(material, {
    id: 'filter-a',
    version: 1,
    order: 10,
    stages: { directional_filter: '// filter A' },
  });
  const beauty = buildSurfaceProgram(material);
  assert.ok(
    beauty.fragmentShader.indexOf('// filter A') <
      beauty.fragmentShader.indexOf('// filter B'),
  );
  assert.ok(
    !beauty.fragmentShader.includes('#include <lights_fragment_begin>'),
  );
  assert.ok(!beauty.fragmentShader.includes('lights_lambert'));
  assert.ok(!beauty.fragmentShader.includes('#define HEX_WATER_RECEIVER'));
  const flags = new Vector3(0, 1, 0),
    records = createSurfaceRecordMaterial(
      material,
      { surfaceResolution: { value: 1 } },
      flags,
      true,
    ),
    shader = { uniforms: {} };
  records.onBeforeCompile(shader);
  assert.equal(shader.uniforms.terrainWetness, shared.terrainWetness);
  assert.equal(shader.uniforms.testProducer.value, 7);
  assert.notEqual(shader.uniforms.surfaceChannels.value, flags);
  assert.deepEqual(
    shader.uniforms.surfaceChannels.value.toArray(),
    flags.toArray(),
  );
  assert.ok(shader.fragmentShader.includes('#define HEX_SURFACE_RECORD_PASS'));
  assert.ok(!shader.fragmentShader.includes('#define HEX_WATER_RECEIVER'));
  assert.ok(shader.fragmentShader.includes('SurfaceData material='));
  assert.equal(records.defines.HEX_PACK_SPECULAR_OUTPUT, 1);
  const old = surfaceProgramKey(material);
  material.transparent = false;
  assert.notEqual(surfaceProgramKey(material), old);
  material.dispose();
  records.dispose();
});

test('unknown or conflicting surface providers fail explicitly', () => {
  const material = new MeshLambertMaterial();
  applySkylight(material, null, true);
  assert.throws(
    () =>
      addSurfaceFeature(material, {
        id: 'bad',
        version: 1,
        stages: { not_a_stage: 'x' },
      }),
    /Unknown surface stage/,
  );
  addSurfaceFeature(material, {
    id: 'sky-a',
    version: 1,
    stages: { sky_irradiance: '//a' },
  });
  assert.throws(
    () => addSurfaceFeature(material, { id: 'sky-a', version: 2 }),
    /Duplicate/,
  );
  addSurfaceFeature(material, {
    id: 'sky-b',
    version: 1,
    stages: { sky_irradiance: '//b' },
  });
  assert.throws(
    () => buildSurfaceProgram(material),
    /Multiple surface providers/,
  );
  material.dispose();
});

test('render pipeline validates all producers before changing the composer and retains live enable flags', () => {
  const passes = [],
    composer = { addPass: (p) => passes.push(p) },
    a = { enabled: true },
    b = { enabled: true };
  assert.throws(
    () =>
      installRenderPipeline(composer, [
        { id: 'bad', pass: a, reads: ['missing'] },
      ]),
    /before its producer/,
  );
  assert.equal(passes.length, 0);
  assert.throws(
    () =>
      installRenderPipeline(composer, [
        { id: 'a', pass: a, writes: ['x'] },
        { id: 'b', pass: b, writes: ['x'] },
      ]),
    /Multiple render producers/,
  );
  assert.equal(passes.length, 0);
  const pipeline = installRenderPipeline(composer, [
    { id: 'geometry', pass: a, writes: ['depth'] },
    { id: 'lighting', pass: b, reads: ['depth'], writes: ['hdr'] },
  ]);
  assert.deepEqual(passes, [a, b]);
  b.enabled = false;
  assert.equal(pipeline.describe()[1].enabled, false);
  assert.deepEqual(pipeline.describe()[1].reads, ['depth']);
});
