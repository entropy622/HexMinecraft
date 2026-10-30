import {
  Color,
  HalfFloatType,
  NearestFilter,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  GTAOShader,
  generateMagicSquareNoise,
} from 'three/addons/shaders/GTAOShader.js';
import {
  PoissonDenoiseShader,
  generatePdSamplePointInitializer,
} from 'three/addons/shaders/PoissonDenoiseShader.js';

const vertexShader = GTAOShader.vertexShader;
const compositeShader = /* glsl */ `
varying vec2 vUv;
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D occlusion;
uniform sampler2D protection;
uniform vec2 aoResolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float strength;
float depthDistance(float depth) {
  return cameraNear * cameraFar / (cameraFar + (cameraNear - cameraFar) * depth);
}
void main() {
  vec4 color = textureLod(sceneColor, vUv, 0.0);
  float depth = textureLod(sceneDepth, vUv, 0.0).r;
  float distance = depthDistance(depth);
  if (depth >= 0.999999 || distance < 0.8) {
    gl_FragColor = color;
    return;
  }
  vec2 position = vUv * aoResolution - 0.5;
  vec2 base = floor(position), f = fract(position);
  float total = 0.0, weights = 0.0;
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec2 offset = vec2(float(x), float(y));
    vec2 uv = (base + offset + 0.5) / aoResolution;
    vec4 sampleAO = textureLod(occlusion, uv, 0.0);
    vec2 spatial = mix(1.0 - f, f, offset);
    float weight = spatial.x * spatial.y * exp(-abs(sampleAO.a - distance) / max(0.12, distance * 0.008));
    total += sampleAO.r * weight;
    weights += weight;
  }
  float ao = weights > 0.0001 ? clamp(total / weights, 0.0, 1.0) : 1.0;
  float edge = min(min(vUv.x, vUv.y), min(1.0 - vUv.x, 1.0 - vUv.y));
  float amount = (1.0 - ao) * strength * 0.6;
  amount *= smoothstep(0.8, 1.5, distance) * (1.0 - smoothstep(30.0, 44.0, distance));
  amount *= smoothstep(0.0, 0.025, edge);
  amount *= 1.0 - textureLod(protection, vUv, 0.0).r;
  // Bright emission retains its energy before bloom and tone mapping.
  amount *= 1.0 - smoothstep(0.9, 2.4, max(color.r, max(color.g, color.b)));
  gl_FragColor = vec4(color.rgb * (1.0 - amount), color.a);
}
`;

export class ContactOcclusionPass extends Pass {
  constructor(camera, frame, protection) {
    super();
    this.camera = camera;
    this.noise = generateMagicSquareNoise();
    this.ao = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    this.denoised = this.ao.clone();
    this.protection = protection;
    this.gtao = new ShaderMaterial({
      defines: {
        ...GTAOShader.defines,
        SAMPLES: 12,
        NORMAL_VECTOR_TYPE: 0,
        FRAGMENT_OUTPUT: 'vec4(vec3(ao), -viewPos.z)',
      },
      uniforms: UniformsUtils.clone(GTAOShader.uniforms),
      vertexShader,
      fragmentShader: GTAOShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    Object.assign(this.gtao.uniforms, {
      tDepth: { value: frame.depthTexture },
      tNoise: { value: this.noise },
      radius: { value: 1.15 },
      thickness: { value: 0.7 },
      distanceExponent: { value: 1.8 },
      scale: { value: 1.1 },
    });
    this.denoise = new ShaderMaterial({
      defines: {
        ...PoissonDenoiseShader.defines,
        NORMAL_VECTOR_TYPE: 0,
        SAMPLES: 8,
        SAMPLE_VECTORS: generatePdSamplePointInitializer(8, 2, 1),
        FRAGMENT_OUTPUT: 'vec4(denoised, -viewPos.z)',
      },
      uniforms: UniformsUtils.clone(PoissonDenoiseShader.uniforms),
      vertexShader,
      fragmentShader: PoissonDenoiseShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    Object.assign(this.denoise.uniforms, {
      tDepth: { value: frame.depthTexture },
      tDiffuse: { value: this.ao.texture },
      tNoise: { value: this.noise },
      radius: { value: 3 },
      depthPhi: { value: 0.2 },
      normalPhi: { value: 8 },
      lumaPhi: { value: 3 },
    });
    this.composite = new ShaderMaterial({
      vertexShader,
      fragmentShader: compositeShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        sceneColor: { value: null },
        sceneDepth: { value: frame.depthTexture },
        occlusion: { value: this.denoised.texture },
        protection: this.protection.textureUniform,
        aoResolution: { value: new Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        strength: { value: 0.6 },
      },
    });
    this.quad = new FullScreenQuad();
    this.clearColor = new Color();
  }
  setSize(width, height) {
    const w = Math.max(1, Math.ceil(width / 2)),
      h = Math.max(1, Math.ceil(height / 2));
    this.ao.setSize(w, h);
    this.denoised.setSize(w, h);
    this.gtao.uniforms.resolution.value.set(w, h);
    this.denoise.uniforms.resolution.value.set(w, h);
    this.composite.uniforms.aoResolution.value.set(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    const camera = this.camera,
      u = this.gtao.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
    u.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    u.cameraWorldMatrix.value.copy(camera.matrixWorld);
    this.denoise.uniforms.cameraProjectionMatrixInverse.value.copy(
      camera.projectionMatrixInverse,
    );
    this.composite.uniforms.cameraNear.value = camera.near;
    this.composite.uniforms.cameraFar.value = camera.far;
    this.composite.uniforms.sceneColor.value = readBuffer.texture;
    const autoClear = renderer.autoClear,
      alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    try {
      renderer.autoClear = false;
      renderer.setClearColor(0xffffff, 1);
      for (const [material, target] of [
        [this.gtao, this.ao],
        [this.denoise, this.denoised],
      ]) {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
        this.quad.material = material;
        this.quad.render(renderer);
      }
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.material = this.composite;
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = autoClear;
      renderer.setClearColor(this.clearColor, alpha);
    }
  }
  dispose() {
    this.ao.dispose();
    this.denoised.dispose();
    this.noise.dispose();
    this.gtao.dispose();
    this.denoise.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
