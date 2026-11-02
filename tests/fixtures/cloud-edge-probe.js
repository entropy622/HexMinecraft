import {
  GLSL3,
  HalfFloatType,
  ShaderMaterial,
  WebGLRenderTarget,
  DataUtils,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Static native camera/field. An independent legacy history and a 4x primary
// ray reference distinguish reconstruction from blur or changed cloud density.
export async function probeCloudEdges(g) {
  const clouds = g.composer.passes[0].clouds,
    frame = g.composer.passes[0],
    state = clouds.histories.get(frame.target),
    r = g.renderer,
    w = clouds.target.width,
    h = clouds.target.height,
    quad = new FullScreenQuad(),
    previous = r.getRenderTarget(),
    legacy = [0, 1].map(
      () =>
        new WebGLRenderTarget(w, h, {
          count: 2,
          type: HalfFloatType,
          depthBuffer: false,
        }),
    ),
    reference = legacy[0].clone(),
    source = clouds.resolve;
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: { ...source.uniforms },
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader.replace(
      '// HEX_SPARSE_SKY_HISTORY',
      'if (data.x <= 0.0) return;',
    ),
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const copy = new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      a: { value: state.history[0].texture },
      b: { value: state.history[0].textures[1] },
    },
    vertexShader: source.vertexShader,
    fragmentShader:
      'varying vec2 vUv;uniform sampler2D a,b;layout(location=0) out vec4 color;layout(location=1) out vec4 data;void main(){color=texture2D(a,vUv);data=texture2D(b,vUv);}',
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const volume = clouds.volume,
    referenceMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { ...volume.uniforms },
      vertexShader: volume.vertexShader,
      fragmentShader: volume.fragmentShader
        .replace(
          'float stepLength = (span.y - span.x) / float(steps);',
          'steps *= 4; float stepLength = (span.y - span.x) / float(steps);',
        )
        .replace(
          'for (int i = 0; i < 80; i++)',
          'for (int i = 0; i < 320; i++)',
        ),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  const read = (target, attachment = 0) => {
    const data = new Uint16Array(w * h * 4);
    r.readRenderTargetPixels(target, 0, 0, w, h, data, 0, attachment);
    return data;
  };
  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(resolve));
  const meanNew = new Float64Array(w * h),
    meanOld = new Float64Array(w * h),
    supported = new Uint8Array(w * h);
  let newHoles = 0,
    oldHoles = 0,
    supportedCount = 0,
    frames = 0;
  try {
    quad.material = copy;
    for (const target of legacy) {
      r.setRenderTarget(target);
      quad.render(r);
    }
    r.setRenderTarget(previous);
    for (let i = 0; i < 24; i++) {
      await nextFrame();
      // Native matrices/field are static; current source textures are the real
      // camera's last march. Advance only the diagnostic legacy history.
      const saved = r.getRenderTarget();
      material.uniforms.previousCloud = { value: legacy[0].texture };
      material.uniforms.previousData = { value: legacy[0].textures[1] };
      quad.material = material;
      r.setRenderTarget(legacy[1]);
      quad.render(r);
      legacy.reverse();
      if (i >= 16) {
        const a = read(state.history[0]),
          b = read(legacy[0]),
          data = read(clouds.target, 1),
          raw = read(clouds.target);
        frames++;
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            const p = y * w + x,
              index = p * 4,
              ta = DataUtils.fromHalfFloat(a[index + 3]),
              tb = DataUtils.fromHalfFloat(b[index + 3]);
            meanNew[p] += ta;
            meanOld[p] += tb;
            if (
              DataUtils.fromHalfFloat(data[index]) > 0 ||
              DataUtils.fromHalfFloat(data[index + 1]) >= 0
            )
              continue;
            let support = false;
            for (let dy = -1; dy <= 1 && !support; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const j = ((y + dy) * w + x + dx) * 4;
                if (
                  DataUtils.fromHalfFloat(data[j]) > 0 &&
                  DataUtils.fromHalfFloat(data[j + 1]) < 0 &&
                  DataUtils.fromHalfFloat(raw[j + 3]) < 0.98
                ) {
                  support = true;
                  break;
                }
              }
            if (support) {
              supported[p] = 1;
              supportedCount++;
              newHoles += ta > 0.9999 ? 1 : 0;
              oldHoles += tb > 0.9999 ? 1 : 0;
            }
          }
      }
      r.setRenderTarget(saved);
    }
    quad.material = referenceMaterial;
    r.setRenderTarget(reference);
    quad.render(r);
    const high = read(reference),
      rawData = read(clouds.target, 1);
    let newError = 0,
      oldError = 0,
      n = 0,
      invalid = 0,
      clearLeak = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x,
          index = p * 4;
        if (supported[p]) {
          const expected = DataUtils.fromHalfFloat(high[index + 3]),
            a = meanNew[p] / frames,
            b = meanOld[p] / frames;
          newError += (a - expected) ** 2;
          oldError += (b - expected) ** 2;
          n++;
          if (!Number.isFinite(a) || !Number.isFinite(b)) invalid++;
        }
        if (
          DataUtils.fromHalfFloat(rawData[index + 1]) >= 0 &&
          DataUtils.fromHalfFloat(rawData[index]) <= 0 &&
          meanNew[p] / frames < 0.9999
        )
          clearLeak++;
      }
    return {
      width: w,
      height: h,
      frames,
      supportedCount,
      pixels: n,
      newHoles,
      oldHoles,
      newError: Math.sqrt(newError / n),
      oldError: Math.sqrt(oldError / n),
      invalid,
      foregroundLeaks: clearLeak,
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    copy.dispose();
    referenceMaterial.dispose();
    reference.dispose();
    legacy.forEach((t) => t.dispose());
  }
}
