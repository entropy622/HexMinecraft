import {
  DepthTexture,
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
  constructor(scene, camera) {
    super();
    this.needsSwap = false;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    this.beauty = new RenderPass(scene, camera);
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
  }
  render(renderer, writeBuffer, readBuffer) {
    this.beauty.render(renderer, writeBuffer, this.target);
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.target.dispose();
    this.beauty.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
