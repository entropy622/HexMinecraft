import {
  DataUtils,
  FloatType,
  HalfFloatType,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { leafLightingGLSL } from '../../src/leaf-lighting.js';

// Run the production scattering kernel on the real WebGL renderer. The test
// supplies optical boundary inputs, not a replacement shader implementation.
export function probeLeafSheen(g) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    target = new WebGLRenderTarget(1, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    halfTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    pixels = new Float32Array(4),
    halfPixels = new Uint16Array(4),
    samples = [],
    material = new ShaderMaterial({
      uniforms: {
        albedo: { value: new Vector3() },
        transmission: { value: new Vector3() },
        irradiance: { value: new Vector3() },
        cosine: { value: 0 },
        amount: { value: 0 },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${leafLightingGLSL}
        uniform vec3 albedo; uniform vec3 transmission; uniform vec3 irradiance;
        uniform float cosine; uniform float amount;
        void main(){gl_FragColor=vec4(irradiance*leafSolarResponse(albedo,cosine,transmission,amount),1);}`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material);
  try {
    for (const cosine of [-1, -0.8, -0.5, -0.2, 0, 0.5, 1, 1.0001])
      for (const albedo of [
        [0, 0, 0],
        [0.000001, 0.1, 0.7],
        [0.4, 0.6, 0.2],
      ])
        for (const transmission of [
          [0, 0, 0],
          [0.9, 0.7, 0.3],
        ])
          for (const amount of [0, 0.5, 1])
            for (const power of [0, 1]) {
              const irradiance = [3, 2, 1].map((v) => v * power),
                u = material.uniforms;
              u.albedo.value.fromArray(albedo);
              u.transmission.value.fromArray(transmission);
              u.irradiance.value.fromArray(irradiance);
              u.cosine.value = cosine;
              u.amount.value = amount;
              r.setRenderTarget(target);
              quad.render(r);
              r.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
              r.setRenderTarget(halfTarget);
              quad.render(r);
              r.readRenderTargetPixels(halfTarget, 0, 0, 1, 1, halfPixels);
              samples.push({
                cosine,
                albedo,
                transmission,
                amount,
                irradiance,
                rgb: Array.from(pixels).slice(0, 3),
                half: Array.from(halfPixels, DataUtils.fromHalfFloat).slice(
                  0,
                  3,
                ),
              });
            }
    return { samples, gl: r.getContext().getError() };
  } finally {
    r.setRenderTarget(previous);
    target.dispose();
    halfTarget.dispose();
    material.dispose();
    quad.dispose();
  }
}
