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
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

// Keep the scene depth outside the composer's alternating color attachments.
// Every later effect reads the same current-frame depth, even when passes are disabled.
export class SceneFramePass extends Pass {
  constructor(scene, camera, fluids) {
    super();
    this.needsSwap = false;
    this.scene = scene;
    this.camera = camera;
    this.fluids = fluids;
    this.frustum = new Frustum();
    this.viewProjection = new Matrix4();
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    this.beauty = new RenderPass(scene, camera);
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
  }
  render(renderer, writeBuffer, readBuffer) {
    const fluids = this.fluids,
      uniforms = fluids.waterUniforms;
    uniforms.waterSceneReady.value = 0;
    fluids.materials.water.depthWrite = false;
    this.scene.updateMatrixWorld();
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
      !fluids.medium &&
      waters.some((object) => this.frustum.intersectsObject(object))
    ) {
      const hidden = [
        ...waters,
        ...this.camera.children.filter(
          (object) => object.visible && object.userData.skipOcclusion,
        ),
      ];
      try {
        for (const object of hidden) object.visible = false;
        this.beauty.render(renderer, writeBuffer, this.opaque);
      } finally {
        for (const object of hidden) object.visible = true;
      }
      uniforms.waterSceneColor.value = this.opaque.texture;
      uniforms.waterSceneDepth.value = this.opaque.depthTexture;
      uniforms.waterProjection.value = this.camera.projectionMatrix;
      uniforms.waterInverseProjection.value =
        this.camera.projectionMatrixInverse;
      uniforms.waterResolution.value.set(this.opaque.width, this.opaque.height);
      uniforms.waterSceneReady.value = 1;
      fluids.materials.water.depthWrite = true;
    }
    this.beauty.render(renderer, writeBuffer, this.target);
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  dispose() {
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
