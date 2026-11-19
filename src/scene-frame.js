import {
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
    this.shareWaterOpaque = true;
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
  }
  get depthTexture() {
    return this.target.depthTexture;
  }
  setSize(width, height) {
    this.target.setSize(
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height)),
    );
    this.opaque.setSize(this.target.width, this.target.height);
    this.clouds.setSize(this.target.width, this.target.height);
  }
  publishWaterCapture() {
    const { fluids, camera, opaque } = this,
      uniforms = fluids.waterUniforms;
    uniforms.waterProjection.value.copy(camera.projectionMatrix);
    uniforms.waterInverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.waterSceneColor.value = opaque.texture;
    uniforms.waterSceneDepth.value = opaque.depthTexture;
    uniforms.waterResolution.value.set(opaque.width, opaque.height);
    uniforms.waterSceneReady.value = 1;
    fluids.materials.water.depthWrite = true;
  }
  captureWater(renderer, work, hidden) {
    const { camera, fluids, opaque } = this;
    const autoClear = renderer.autoClear;
    this.projectionBackup.copy(camera.projectionMatrix);
    try {
      // Refraction can leave the main view when the eye is under water.
      if (fluids.medium === 'water') {
        camera.projectionMatrix.elements[0] *= 0.4;
        camera.projectionMatrix.elements[5] *= 0.4;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }
      for (const object of hidden) object.visible = false;
      this.beauty.render(renderer, work, opaque);
      this.clouds.render(renderer, opaque, work);
      this.publishWaterCapture();
    } finally {
      renderer.autoClear = autoClear;
      camera.projectionMatrix.copy(this.projectionBackup);
      camera.projectionMatrixInverse.copy(this.projectionBackup).invert();
      for (const object of hidden) object.visible = true;
    }
  }
  copyOpaque(renderer) {
    const { target, opaque } = this,
      gl = renderer.getContext();
    renderer.initRenderTarget(opaque);
    // Match WebGLRenderer r186's own depth-copy path, but blit both attachments
    // together. The targets share color/depth formats and are single-sampled.
    const source = renderer.properties.get(target).__webglFramebuffer,
      destination = renderer.properties.get(opaque).__webglFramebuffer,
      { width, height } = target;
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, source);
    try {
      renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination);
      gl.blitFramebuffer(
        0,
        0,
        width,
        height,
        0,
        0,
        width,
        height,
        gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
        gl.NEAREST,
      );
    } finally {
      renderer.setRenderTarget(target);
    }
  }
  renderSharedWater(renderer, work, waters, overlays) {
    const { scene, beauty, target, opaque, clouds } = this,
      exclude = new Set(waters),
      held = new Set(),
      casters = [],
      background = scene.background,
      autoClear = renderer.autoClear,
      clear = beauty.clear;
    for (const root of overlays)
      root.traverseVisible((object) => {
        held.add(object);
        exclude.add(object);
        if (object.castShadow) casters.push(object);
      });

    const retain = (queue, predicate) => {
      let kept = 0;
      for (const item of queue)
        if (predicate(item.object)) queue[kept++] = item;
      queue.length = kept;
    };
    try {
      for (const object of casters) object.castShadow = false;
      beauty.render(
        renderer,
        work,
        target,
        (list) => {
          retain(list.opaque, (object) => !exclude.has(object));
          list.transparent.length = 0;
        },
        exclude,
      );
      for (const object of casters) object.castShadow = true;
      this.copyOpaque(renderer);

      beauty.clear = false;
      scene.background = null;
      beauty.render(renderer, work, opaque, (list) => {
        list.opaque.length = 0;
        retain(list.transparent, (object) => !exclude.has(object));
      });
      clouds.render(renderer, opaque, work);
      this.publishWaterCapture();
      // First-person equipment is depth-tested against the common world before
      // Three draws the original sorted transparent queue (including water).
      beauty.render(renderer, work, target, (list) => {
        retain(list.opaque, (object) => held.has(object));
      });
    } finally {
      for (const object of casters) object.castShadow = true;
      scene.background = background;
      renderer.autoClear = autoClear;
      beauty.clear = clear;
    }
  }
  drawColor(renderer, texture, target) {
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      this.copy.uniforms.tDiffuse.value = texture;
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = autoClear;
    }
  }
  render(renderer, writeBuffer, readBuffer) {
    this.clouds.coverage.prepare(renderer, this.camera);
    const { scene, camera, fluids, beauty } = this;
    fluids.waterUniforms.waterSceneReady.value = 0;
    fluids.materials.water.depthWrite = false;
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(
      this.viewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    const waters = [];
    fluids.group.traverseVisible((object) => {
      if (object.userData.liquid === 'water') waters.push(object);
    });
    const needsCapture =
      (!fluids.medium || fluids.medium === 'water') &&
      waters.some((object) => this.frustum.intersectsObject(object));
    const overlays = needsCapture
      ? camera.children.filter(
          (object) => object.visible && object.userData.skipOcclusion,
        )
      : [];
    const shared =
      needsCapture &&
      this.shareWaterOpaque &&
      !fluids.medium &&
      renderer.sortObjects &&
      !renderer.shadowMap.autoUpdate &&
      !scene.overrideMaterial &&
      !beauty.overrideMaterial;
    if (shared) {
      this.renderSharedWater(renderer, writeBuffer, waters, overlays);
    } else {
      if (needsCapture)
        this.captureWater(renderer, writeBuffer, [...waters, ...overlays]);
      beauty.render(renderer, writeBuffer, this.target);
    }
    this.clouds.render(renderer, this.target, writeBuffer);
    this.drawColor(
      renderer,
      this.target.texture,
      this.renderToScreen ? null : readBuffer,
    );
  }
  dispose() {
    this.clouds.dispose();
    this.fluids.waterUniforms.waterSceneReady.value = 0;
    this.fluids.waterUniforms.waterSceneColor.value = null;
    this.fluids.waterUniforms.waterSceneDepth.value = null;
    this.fluids.materials.water.depthWrite = false;
    this.opaque.dispose();
    this.target.dispose();
    this.beauty.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
