import {
  AlwaysDepth,
  DepthTexture,
  Frustum,
  Matrix4,
  HalfFloatType,
  ShaderMaterial,
  UniformsUtils,
  UnsignedIntType,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FoliageRenderPass } from './foliage-render-pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { CloudVolumePass } from './cloud-volume.js';

// Keep the scene depth outside the composer's alternating color attachments.
// Every later effect reads the same current-frame depth, even when passes are disabled.
export class SceneFramePass extends Pass {
  constructor(scene, camera, fluids, cloudUniforms, foliageUniforms) {
    super();
    this.needsSwap = false;
    this.scene = scene;
    this.camera = camera;
    this.fluids = fluids;
    this.clouds = new CloudVolumePass(camera, cloudUniforms);
    this.frustum = new Frustum();
    this.viewProjection = new Matrix4();
    this.projectionBackup = new Matrix4();
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    this.beauty = new FoliageRenderPass(scene, camera, foliageUniforms);
    this.opaque = this.target.clone();
    this.waterWork = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    });
    this.copy = new ShaderMaterial({
      uniforms: UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.copy.uniforms.tDiffuse.value = this.target.texture;
    this.quad = new FullScreenQuad(this.copy);
    this.copyDepth = new ShaderMaterial({
      uniforms: {
        colorMap: { value: this.target.texture },
        depthMap: { value: this.target.depthTexture },
      },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: `uniform sampler2D colorMap,depthMap;varying vec2 vUv;
        void main(){gl_FragColor=texture2D(colorMap,vUv);gl_FragDepth=texture2D(depthMap,vUv).r;}`,
      depthFunc: AlwaysDepth,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    });
    this.depthQuad = new FullScreenQuad(this.copyDepth);
  }
  get depthTexture() {
    return this.target.depthTexture;
  }
  setSize(width, height) {
    this.target.setSize(
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height)),
    );
    this.opaque.setSize(
      Math.ceil(this.target.width / 2),
      Math.ceil(this.target.height / 2),
    );
    this.waterWork.setSize(this.opaque.width, this.opaque.height);
    this.clouds.setSize(this.target.width, this.target.height);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.clouds.coverage.prepare(renderer, this.camera);
    const fluids = this.fluids,
      uniforms = fluids.waterUniforms;
    uniforms.waterSceneReady.value = 0;
    fluids.materials.water.depthWrite = false;
    if (this.scene.matrixWorldAutoUpdate) this.scene.updateMatrixWorld();
    let sharedOpaque = false;
    this.frustum.setFromProjectionMatrix(
      this.viewProjection.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    const waters = [];
    fluids.group.traverseVisible((object) => {
      if (object.userData.liquid === 'water') waters.push(object);
    });
    if (
      (!fluids.medium || fluids.medium === 'water') &&
      waters.some((object) => this.frustum.intersectsObject(object))
    ) {
      const hidden = [
        ...waters,
        ...this.camera.children.filter(
          (object) => object.visible && object.userData.skipOcclusion,
        ),
      ];
      const autoClear = renderer.autoClear;
      this.projectionBackup.copy(this.camera.projectionMatrix);
      try {
        // A guard band exposes nearby reflection/refraction destinations just
        // outside the main view, using the same target and camera orientation.
        if (fluids.medium === 'water') {
          this.camera.projectionMatrix.elements[0] *= 0.4;
          this.camera.projectionMatrix.elements[5] *= 0.4;
          this.camera.projectionMatrixInverse
            .copy(this.camera.projectionMatrix)
            .invert();
        }
        if (!fluids.medium) {
          this.sharedWater(
            renderer,
            writeBuffer,
            waters,
            hidden.slice(waters.length),
          );
          sharedOpaque = true;
        } else {
          for (const object of hidden) object.visible = false;
          this.beauty.render(renderer, writeBuffer, this.opaque);
          this.clouds.render(renderer, this.opaque, this.waterWork, true);
        }
        uniforms.waterProjection.value.copy(this.camera.projectionMatrix);
        uniforms.waterInverseProjection.value.copy(
          this.camera.projectionMatrixInverse,
        );
      } finally {
        renderer.autoClear = autoClear;
        this.camera.projectionMatrix.copy(this.projectionBackup);
        this.camera.projectionMatrixInverse
          .copy(this.projectionBackup)
          .invert();
        for (const object of hidden) object.visible = true;
      }
      uniforms.waterSceneColor.value = this.opaque.texture;
      uniforms.waterSceneDepth.value = this.opaque.depthTexture;
      uniforms.waterResolution.value.set(this.target.width, this.target.height);
      uniforms.waterSceneReady.value = 1;
      fluids.materials.water.depthWrite = true;
    }
    if (!sharedOpaque) this.beauty.render(renderer, writeBuffer, this.target);
    this.clouds.render(renderer, this.target, writeBuffer);
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  // Above water both views share projection. Shade opaque surfaces once at full
  // resolution. Render transparent layers back-to-front against each view's
  // own depth, so glass on either side of the water keeps its normal ordering.
  sharedWater(renderer, work, waters, hands) {
    const scene = this.scene,
      camera = this.camera,
      u = this.fluids.waterUniforms;
    const direct = renderer.renderBufferDirect,
      background = scene.background,
      auto = renderer.autoClear;
    const masks = new Map(),
      mixed = new Set();
    try {
      for (const o of hands) o.visible = false;
      renderer.renderBufferDirect = function (cam, s, geo, m, obj, group) {
        if (s === scene && m.transparent) return;
        return direct.call(this, cam, s, geo, m, obj, group);
      };
      this.beauty.render(renderer, work, this.target);
      renderer.renderBufferDirect = direct;
      // Keep lights and hierarchy in place. The completed camera list already
      // accounts for layer masks, frustum culling, and parent visibility.
      for (const { object } of renderer.renderLists.get(scene, 0).opaque) {
        if (
          Array.isArray(object.material) &&
          object.material.some((m) => m?.transparent)
        ) {
          mixed.add(object);
          continue;
        }
        if (!masks.has(object)) masks.set(object, object.layers.mask);
        object.layers.mask = 0;
      }
      if (mixed.size)
        renderer.renderBufferDirect = function (cam, s, geo, m, obj, group) {
          if (s === scene && mixed.has(obj) && !m.transparent) return;
          return direct.call(this, cam, s, geo, m, obj, group);
        };
      scene.background = null;
      renderer.autoClear = false;
      renderer.setRenderTarget(this.opaque);
      this.depthQuad.render(renderer);
      for (const o of waters) o.visible = false;
      renderer.render(scene, camera);
      this.clouds.render(renderer, this.opaque, this.waterWork, true);
      for (const o of [...waters, ...hands]) o.visible = true;
      u.waterProjection.value.copy(camera.projectionMatrix);
      u.waterInverseProjection.value.copy(camera.projectionMatrixInverse);
      u.waterSceneColor.value = this.opaque.texture;
      u.waterSceneDepth.value = this.opaque.depthTexture;
      u.waterResolution.value.set(this.target.width, this.target.height);
      u.waterSceneReady.value = 1;
      this.fluids.materials.water.depthWrite = true;
      renderer.setRenderTarget(this.target);
      renderer.render(scene, camera);
    } finally {
      renderer.renderBufferDirect = direct;
      for (const [o, mask] of masks) o.layers.mask = mask;
      for (const o of [...waters, ...hands]) o.visible = true;
      scene.background = background;
      renderer.autoClear = auto;
    }
  }
  dispose() {
    this.depthQuad.dispose();
    this.copyDepth.dispose();
    this.clouds.dispose();
    this.fluids.waterUniforms.waterSceneReady.value = 0;
    this.fluids.waterUniforms.waterSceneColor.value = null;
    this.fluids.waterUniforms.waterSceneDepth.value = null;
    this.fluids.materials.water.depthWrite = false;
    this.waterWork.dispose();
    this.opaque.dispose();
    this.target.dispose();
    this.beauty.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
