import {
  HalfFloatType,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Independent HDR scattering pass. See docs/bloom-verification.md for the
// Photon/CoD reference, normalization contract and finite-image edge limits.
export class BloomPass extends Pass {
  constructor() {
    super();
    this.width = this.height = 1;
    this.down = [];
    this.up = [];
    this._strength = 0.24;
    this.downsample = new ShaderMaterial({
      name: 'BloomDownsample',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        source: { value: null },
        texel: { value: new Vector2() },
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D source;
        uniform vec2 texel;
        void main() {
          // Published overlapping-box downfilter: 9 wide-grid samples and
          // 4 inner diagonals. Positive weights sum to one, with no threshold.
          vec3 color = vec3(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            float weight = (x == 0 && y == 0) ? 0.125 :
              ((x == 0 || y == 0) ? 0.0625 : 0.03125);
            color += texture2D(source, vUv + vec2(float(x), float(y)) * texel * 2.0).rgb * weight;
          }
          for (int y = -1; y <= 1; y += 2) for (int x = -1; x <= 1; x += 2)
            color += texture2D(source, vUv + vec2(float(x), float(y)) * texel).rgb * 0.125;
          gl_FragColor = vec4(color, 1.0);
        }`,
    });
    this.upsample = new ShaderMaterial({
      name: 'BloomReconstruct',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        source: { value: null },
        detail: { value: null },
        texel: { value: new Vector2() },
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D source;
        uniform sampler2D detail;
        uniform vec2 texel;
        void main() {
          // A separable 1:2:1 tent reconstructs the coarse scale without
          // bicubic negative lobes; the same positive weights serve all RGB.
          vec3 broad = vec3(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            float weight = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0) / 16.0;
            broad += texture2D(source, vUv + vec2(float(x), float(y)) * texel).rgb * weight;
          }
          gl_FragColor = vec4(mix(texture2D(detail, vUv).rgb, broad, 0.6), 1.0);
        }`,
    });
    this.composite = new ShaderMaterial({
      name: 'BloomComposite',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        sceneColor: { value: null },
        scattered: { value: null },
        amount: { value: 0.12 },
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D sceneColor;
        uniform sampler2D scattered;
        uniform float amount;
        void main() {
          vec4 scene = texture2D(sceneColor, vUv);
          gl_FragColor = vec4(mix(scene.rgb, texture2D(scattered, vUv).rgb, amount), scene.a);
        }`,
    });
    this.quad = new FullScreenQuad();
  }

  get strength() {
    return this._strength;
  }
  set strength(value) {
    this._strength = value;
    if (value === 0) this.releaseTargets();
  }

  setSize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    // No target objects or GPU storage while disabled, including after resize.
    if (this.down.length) this.resizeTargets();
  }

  resizeTargets() {
    let width = this.width,
      height = this.height,
      levels = 0;
    do {
      width = Math.max(1, Math.ceil(width / 2));
      height = Math.max(1, Math.ceil(height / 2));
      if (!this.down[levels])
        this.down.push(
          new WebGLRenderTarget(width, height, {
            type: HalfFloatType,
            depthBuffer: false,
          }),
        );
      else this.down[levels].setSize(width, height);
      levels++;
    } while (levels < 6 && (width > 1 || height > 1));
    for (const target of this.down.splice(levels)) target.dispose();
    for (let i = 0; i < levels - 1; i++) {
      if (!this.up[i]) this.up.push(this.down[i].clone());
      else this.up[i].setSize(this.down[i].width, this.down[i].height);
    }
    for (const target of this.up.splice(levels - 1)) target.dispose();
  }

  render(renderer, writeBuffer, readBuffer) {
    if (!this.down.length) this.resizeTargets();
    let source = readBuffer.texture,
      width = this.width,
      height = this.height;
    this.quad.material = this.downsample;
    for (const target of this.down) {
      this.downsample.uniforms.source.value = source;
      this.downsample.uniforms.texel.value.set(1 / width, 1 / height);
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
      source = target.texture;
      width = target.width;
      height = target.height;
    }
    this.quad.material = this.upsample;
    for (let i = this.up.length - 1; i >= 0; i--) {
      const target = this.up[i];
      this.upsample.uniforms.source.value = source;
      this.upsample.uniforms.detail.value = this.down[i].texture;
      this.upsample.uniforms.texel.value.set(1 / width, 1 / height);
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
      source = target.texture;
      width = target.width;
      height = target.height;
    }
    this.composite.uniforms.sceneColor.value = readBuffer.texture;
    this.composite.uniforms.scattered.value = source;
    // Existing default .24 becomes a .12 redistribution fraction, before
    // exposure and OutputPass. Constant fields keep unit DC gain.
    this.composite.uniforms.amount.value = this.strength * 0.5;
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  releaseTargets() {
    for (const target of [...this.down, ...this.up]) target.dispose();
    this.down.length = this.up.length = 0;
    this.downsample.uniforms.source.value = null;
    this.upsample.uniforms.source.value = null;
    this.upsample.uniforms.detail.value = null;
    this.composite.uniforms.scattered.value = null;
  }

  dispose() {
    this.releaseTargets();
    this.downsample.dispose();
    this.upsample.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
