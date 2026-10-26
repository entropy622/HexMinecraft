import {
  HalfFloatType,
  NearestFilter,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Photon-inspired luminance metering and asymmetric eye adaptation. This is
// an independent geometric-mean meter, not Photon's histogram/TAA implementation.
export class ExposurePass extends Pass {
  constructor() {
    super();
    this.history = [0, 1].map(
      () =>
        new WebGLRenderTarget(1, 1, {
          type: HalfFloatType,
          minFilter: NearestFilter,
          magFilter: NearestFilter,
          depthBuffer: false,
        }),
    );
    this.meter = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        sceneColor: { value: null },
        previous: { value: null },
        elapsed: { value: 0 },
        ready: { value: false },
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D sceneColor;
        uniform sampler2D previous;
        uniform float elapsed;
        uniform bool ready;
        void main() {
          float total = 0.0, weights = 0.0;
          for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
            vec2 uv = (vec2(float(x), float(y)) + 0.5) / 16.0;
            vec3 color = max(texture2D(sceneColor, uv).rgb, vec3(0.0));
            float luminance = clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0001, 8.0);
            float weight = 0.3 + exp(-dot(uv - 0.5, uv - 0.5) * 8.0);
            total += log(luminance) * weight;
            weights += weight;
          }
          // Limit the lift: a torch remains useful and darkness stays dark.
          float target = clamp(0.16 / exp(total / weights), 0.72, 2.8);
          float old = ready ? texture2D(previous, vec2(0.5)).r : target;
          float rate = target < old ? 3.2 : 0.85;
          float exposure = mix(old, target, 1.0 - exp(-rate * elapsed));
          gl_FragColor = vec4(exposure, 0.0, 0.0, 1.0);
        }`,
    });
    this.apply = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { sceneColor: { value: null }, exposure: { value: null } },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D sceneColor;
        uniform sampler2D exposure;
        void main() {
          vec4 color = texture2D(sceneColor, vUv);
          gl_FragColor = vec4(color.rgb * texture2D(exposure, vec2(0.5)).r, color.a);
        }`,
    });
    this.quad = new FullScreenQuad();
  }
  reset() {
    this.meter.uniforms.ready.value = false;
  }
  render(renderer, writeBuffer, readBuffer, dt) {
    const [previous, next] = this.history,
      u = this.meter.uniforms;
    u.sceneColor.value = readBuffer.texture;
    u.previous.value = previous.texture;
    u.elapsed.value = Math.max(0, Math.min(0.1, dt));
    this.quad.material = this.meter;
    renderer.setRenderTarget(next);
    this.quad.render(renderer);
    u.ready.value = true;
    this.apply.uniforms.sceneColor.value = readBuffer.texture;
    this.apply.uniforms.exposure.value = next.texture;
    this.quad.material = this.apply;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    this.history.reverse();
  }
  dispose() {
    this.history.forEach((target) => target.dispose());
    this.meter.dispose();
    this.apply.dispose();
    this.quad.dispose();
  }
}
