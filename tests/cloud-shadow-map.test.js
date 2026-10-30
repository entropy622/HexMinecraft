import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Matrix4, PerspectiveCamera, Scene, Vector4 } from 'three';
import { HexClouds } from '../src/clouds.js';
import { CloudCoverage } from '../src/cloud-coverage.js';
import {
  cloudDetailData,
  cloudCoverageData,
} from './fixtures/cloud-detail-data.js';

function setup() {
  const clouds = new HexClouds(
      new Scene(),
      { up: new Color(), down: new Color() },
      cloudDetailData,
      cloudCoverageData,
    ),
    camera = new PerspectiveCamera(),
    target = {},
    viewport = new Vector4(7, 11, 120, 95),
    scissor = new Vector4(3, 4, 80, 71),
    renderer = {
      target,
      viewport: viewport.clone(),
      scissor: scissor.clone(),
      scissorTest: true,
      autoClear: false,
      face: 3,
      level: 2,
      getRenderTarget() {
        return this.target;
      },
      getActiveCubeFace() {
        return this.face;
      },
      getActiveMipmapLevel() {
        return this.level;
      },
      setRenderTarget(value, face = 0, level = 0) {
        this.target = value;
        this.face = face;
        this.level = level;
      },
      getViewport(value) {
        return value.copy(this.viewport);
      },
      getScissor(value) {
        return value.copy(this.scissor);
      },
      getScissorTest() {
        return this.scissorTest;
      },
      setScissorTest(value) {
        this.scissorTest = value;
      },
      setViewport(...args) {
        if (args[0]?.isVector4) this.viewport.copy(args[0]);
        else this.viewport.set(...args);
      },
      setScissor(...args) {
        if (args[0]?.isVector4) this.scissor.copy(args[0]);
        else this.scissor.set(...args);
      },
    };
  camera.position.set(0, 25, 0);
  clouds.prepare({
    world: { seed: 624, dimension: 'overworld' },
    camera,
    time: 120,
    rain: 0,
    storm: 0,
    wetness: 0,
    quality: 1.7,
    enabled: true,
  });
  clouds.uniforms.cloudLightDirection.value.set(0.6, 0.8, 0);
  const pass = new CloudCoverage(clouds.uniforms),
    draws = [];
  pass.quad.render = () => {
    assert.equal(renderer.target, pass.target);
    assert.equal(renderer.scissorTest, false);
    assert.equal(renderer.autoClear, true);
    draws.push('coverage');
  };
  pass.shadowQuad.render = () => {
    assert.equal(renderer.target, pass.target);
    assert.equal(renderer.scissorTest, true);
    assert.equal(renderer.autoClear, false);
    assert.deepEqual(renderer.scissor.toArray(), [768, 0, 256, 512]);
    assert.equal(
      pass.shadowMaterial.uniforms.cloudNoise.value,
      clouds.noise,
      'Preparation must not read its own framebuffer',
    );
    assert.equal(pass.shadowMaterial.uniforms.cloudCoverageReady.value, 0);
    draws.push('shadow');
  };
  const restored = () => {
    assert.equal(renderer.target, target);
    assert.equal(renderer.face, 3);
    assert.equal(renderer.level, 2);
    assert.deepEqual(renderer.viewport, viewport);
    assert.deepEqual(renderer.scissor, scissor);
    assert.equal(renderer.scissorTest, true);
    assert.equal(renderer.autoClear, false);
  };
  const dispose = () => {
    pass.dispose();
    clouds.mesh.geometry.dispose();
    clouds.mesh.material.dispose();
    clouds.noise.dispose();
    clouds.worley.dispose();
  };
  return { clouds, camera, renderer, pass, draws, restored, dispose };
}

test('prepared shadow cache responds to field/light/position changes while preserving header ownership and renderer state', () => {
  const { clouds, camera, renderer, pass, draws, restored, dispose } = setup(),
    u = clouds.uniforms;
  try {
    pass.prepare(renderer, camera);
    restored();
    assert.deepEqual(draws, ['coverage', 'shadow']);
    assert.equal(u.cloudShadowReady.value, 1);
    assert.deepEqual([pass.target.width, pass.target.height], [1024, 1538]);
    const identity = new Matrix4().multiplyMatrices(
      u.cloudShadowView.value,
      u.cloudShadowInverse.value,
    );
    identity.elements.forEach((v, i) =>
      assert.ok(Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-12),
    );
    pass.prepare(renderer, camera);
    assert.equal(draws.length, 2);
    camera.rotation.y += 0.2;
    pass.prepare(renderer, camera);
    assert.equal(draws.length, 2);
    u.cloudLayerWind.value[2].x += 0.1;
    pass.prepare(renderer, camera);
    assert.deepEqual(draws.slice(2), ['shadow']);
    u.cloudOptics.value[0].x *= 0.5;
    pass.prepare(renderer, camera);
    assert.equal(draws.length, 4);
    camera.position.x += 0.5;
    pass.prepare(renderer, camera);
    assert.equal(draws.length, 5);
    restored();
    let disposed = 0;
    pass.target.addEventListener('dispose', () => disposed++);
    u.cloudVolumetric.value = 0;
    pass.prepare(renderer, camera);
    assert.equal(disposed, 1);
    assert.equal(pass.target, null);
    assert.equal(u.cloudShadowReady.value, 0);
    assert.equal(u.cloudNoise.value, clouds.noise);
  } finally {
    dispose();
  }
});

test('failed shadow preparation invalidates publication and restores render target, cube face, mip, viewport and scissor before retry', () => {
  const { clouds, camera, renderer, pass, draws, restored, dispose } = setup(),
    original = pass.shadowQuad.render;
  try {
    pass.shadowQuad.render = () => {
      throw Error('shadow allocation/draw failed');
    };
    assert.throws(
      () => pass.prepare(renderer, camera),
      /shadow allocation\/draw failed/,
    );
    restored();
    assert.equal(clouds.uniforms.cloudShadowReady.value, 0);
    assert.equal(clouds.uniforms.cloudCoverageReady.value, 0);
    assert.equal(clouds.uniforms.cloudNoise.value, clouds.noise);
    pass.shadowQuad.render = original;
    pass.prepare(renderer, camera);
    restored();
    assert.deepEqual(draws, ['coverage', 'coverage', 'shadow']);
    assert.equal(clouds.uniforms.cloudShadowReady.value, 1);
  } finally {
    dispose();
  }
});
