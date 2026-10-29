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
    beer = [],
    material = new ShaderMaterial({
      uniforms: {
        albedo: { value: new Vector3() },
        transmission: { value: new Vector3() },
        irradiance: { value: new Vector3() },
        cosine: { value: 0 },
        amount: { value: 0 },
        sssAmount: { value: 1 },
        thickness: { value: 0 },
        mode: { value: 0 },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${leafLightingGLSL}
        uniform vec3 albedo; uniform vec3 transmission; uniform vec3 irradiance;
        uniform float cosine; uniform float amount; uniform float sssAmount; uniform float thickness; uniform int mode;
        void main(){gl_FragColor=vec4(mode==0?irradiance*leafSolarResponse(albedo,cosine,transmission,amount,sssAmount):leafBeerTransmission(albedo,thickness,sssAmount),1);}`,
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
            for (const sssAmount of [0, 0.5, 1])
              for (const power of [0, 1]) {
                const irradiance = [3, 2, 1].map((v) => v * power),
                  u = material.uniforms;
                u.albedo.value.fromArray(albedo);
                u.transmission.value.fromArray(transmission);
                u.irradiance.value.fromArray(irradiance);
                u.cosine.value = cosine;
                u.amount.value = amount;
                u.sssAmount.value = sssAmount;
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
                  sssAmount,
                  irradiance,
                  rgb: Array.from(pixels).slice(0, 3),
                  half: Array.from(halfPixels, DataUtils.fromHalfFloat).slice(
                    0,
                    3,
                  ),
                });
              }
    material.uniforms.mode.value = 1;
    for (const albedo of [
      [0, 0, 0],
      [0.000001, 0.1, 0.7],
      [0.4, 0.6, 0.2],
      [1, 1, 1],
    ])
      for (const thickness of [0, 0.06, 0.25, 1, 3])
        for (const sssAmount of [0, 0.25, 1]) {
          const u = material.uniforms;
          u.albedo.value.fromArray(albedo);
          u.thickness.value = thickness;
          u.sssAmount.value = sssAmount;
          r.setRenderTarget(target);
          quad.render(r);
          r.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
          beer.push({
            albedo,
            thickness,
            sssAmount,
            rgb: Array.from(pixels).slice(0, 3),
          });
        }
    return { samples, beer, gl: r.getContext().getError() };
  } finally {
    r.setRenderTarget(previous);
    target.dispose();
    halfTarget.dispose();
    material.dispose();
    quad.dispose();
  }
}
