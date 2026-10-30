import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  ReflectionRadiance,
  reflectionColorGLSL,
} from '../../src/reflection-radiance.js';

export function probeReflectionMips(renderer) {
  const saved = renderer.getRenderTarget(),
    mips = new ReflectionRadiance();
  const data = new Float32Array(64 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 64; x++)
      data.set((x + y) % 2 ? [8, 0, 0, 1] : [0, 4, 2, 1], (y * 64 + x) * 4);
  const source = new DataTexture(data, 64, 32, RGBAFormat, FloatType);
  const maskData = new Uint8Array(64 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 64; x++)
      maskData[(y * 64 + x) * 4] = (x + y) % 2 ? 255 : 0;
  const protection = new DataTexture(maskData, 64, 32, RGBAFormat);
  protection.needsUpdate = true;
  source.minFilter = source.magFilter = NearestFilter;
  source.needsUpdate = true;
  const output = new WebGLRenderTarget(64, 32, {
    type: HalfFloatType,
    depthBuffer: false,
  });
  const material = new ShaderMaterial({
    uniforms: { color: { value: null }, level: { value: 0 } },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:
      'varying vec2 vUv;uniform sampler2D color;uniform float level;' +
      reflectionColorGLSL +
      'void main(){gl_FragColor=filteredReflectionColor(color,vUv,level);}',
  });
  const quad = new FullScreenQuad(material),
    levels = [];
  try {
    mips.setSize(64, 32);
    material.uniforms.color.value = mips.update(renderer, source);
    for (const level of [0, 1, 2, 5]) {
      material.uniforms.level.value = level;
      renderer.setRenderTarget(output);
      quad.render(renderer);
      const raw = new Uint16Array(64 * 32 * 4),
        sum = [0, 0, 0],
        squares = [0, 0, 0];
      renderer.readRenderTargetPixels(output, 0, 0, 64, 32, raw);
      let invalid = 0;
      for (let i = 0; i < 64 * 32; i++)
        for (let c = 0; c < 3; c++) {
          const v = DataUtils.fromHalfFloat(raw[i * 4 + c]);
          if (!Number.isFinite(v) || v < 0) invalid++;
          sum[c] += v;
          squares[c] += v * v;
        }
      const mean = sum.map((v) => v / (64 * 32)),
        variance = squares.map((v, c) => v / (64 * 32) - mean[c] * mean[c]);
      levels.push({ level, mean, variance, invalid });
    }
    material.uniforms.color.value = mips.update(renderer, source, protection);
    material.uniforms.level.value = 1;
    renderer.setRenderTarget(output);
    quad.render(renderer);
    const maskedRaw = new Uint16Array(64 * 32 * 4),
      masked = [0, 0, 0, 0];
    renderer.readRenderTargetPixels(output, 0, 0, 64, 32, maskedRaw);
    for (let i = 0; i < 64 * 32; i++)
      for (let c = 0; c < 4; c++)
        masked[c] += DataUtils.fromHalfFloat(maskedRaw[i * 4 + c]) / (64 * 32);
    // Resize the real production mip target to a non-power-of-two size.
    mips.setSize(63, 35);
    const resized = [mips.target.width, mips.target.height];
    let disposed = false;
    mips.target.addEventListener('dispose', () => {
      disposed = true;
    });
    mips.release();
    return {
      levels,
      masked,
      resized,
      disposed,
      released: mips.target === null,
      gl: renderer.getContext().getError(),
    };
  } finally {
    renderer.setRenderTarget(saved);
    mips.dispose();
    source.dispose();
    protection.dispose();
    output.dispose();
    material.dispose();
    quad.dispose();
  }
}
