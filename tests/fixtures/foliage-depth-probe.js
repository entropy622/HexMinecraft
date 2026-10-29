import { DataUtils, FloatType, ShaderMaterial, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Compare the complete native HDR buffers and current depth, with both draws
// in one JS turn. Clouds keep their real surface shadows but no temporal blend
// can disguise a leaf/depth mismatch in this geometry optimization.
export function probeFoliageDepth(g) {
  const r = g.renderer,
    frame = g.composer.passes[0],
    beauty = frame.beauty,
    previous = r.getRenderTarget(),
    enabled = beauty.depthPrepassEnabled,
    wind = g.leafUniforms.leafWind.value,
    time = g.leafUniforms.leafTime.value,
    medium = g.fluidRenderer.medium,
    volumetric = g.cloudSystem.uniforms.cloudVolumetric.value,
    depthTarget = new WebGLRenderTarget(
      frame.target.width,
      frame.target.height,
      {
        type: FloatType,
        depthBuffer: false,
      },
    ),
    material = new ShaderMaterial({
      uniforms: { source: { value: null } },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
      fragmentShader:
        'varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=vec4(texture2D(source,vUv).r,0,0,1);}',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material),
    pairs = [],
    state = () => ({
      autoClear: r.autoClear,
      autoClearDepth: r.autoClearDepth,
      shadowEnabled: r.shadowMap.enabled,
      shadowAutoUpdate: r.shadowMap.autoUpdate,
      sceneMatrix: g.scene.matrixWorldAutoUpdate,
      projection: g.camera.projectionMatrix.toArray(),
      depthColorWrite: g.leafMaterials.depth.colorWrite,
      leafColorWrite: g.leafMaterials.material.colorWrite,
      leafDepthOnly: g.leafUniforms.leafDepthOnly.value,
    }),
    initial = state();
  const render = r.render;
  let depthDraws = 0;
  r.render = function (...args) {
    if (g.leafUniforms.leafDepthOnly.value > 0.5) depthDraws++;
    return render.apply(this, args);
  };
  const read = (prepass) => {
    beauty.depthPrepassEnabled = prepass;
    // The optimization must leave a pending full-scene shadow update intact.
    r.shadowMap.needsUpdate = true;
    frame.render(r, g.composer.writeBuffer, g.composer.readBuffer);
    const targets = [['main', frame.target]];
    if (g.fluidRenderer.waterUniforms.waterSceneReady.value)
      targets.push(['water', frame.opaque]);
    return targets.map(([name, target]) => {
      const color = new Uint16Array(target.width * target.height * 4),
        depth = new Float32Array(color.length);
      r.readRenderTargetPixels(
        target,
        0,
        0,
        target.width,
        target.height,
        color,
      );
      material.uniforms.source.value = target.depthTexture;
      r.setRenderTarget(depthTarget);
      quad.render(r);
      r.readRenderTargetPixels(
        depthTarget,
        0,
        0,
        depthTarget.width,
        depthTarget.height,
        depth,
      );
      return { name, color, depth };
    });
  };
  try {
    g.cloudSystem.uniforms.cloudVolumetric.value = 0;
    for (const mode of [
      { name: 'still', wind: 0, time: 0 },
      { name: 'wind', wind: 0.12, time: 12.75 },
      { name: 'capture-guard-band', wind: 0.12, time: 31.25, guard: true },
    ]) {
      g.leafUniforms.leafWind.value = mode.wind;
      g.leafUniforms.leafTime.value = mode.time;
      g.fluidRenderer.medium = mode.guard ? 'water' : medium;
      read(false);
      const baseline = read(false),
        candidate = read(true);
      for (let t = 0; t < baseline.length; t++) {
        const a = baseline[t],
          b = candidate[t];
        let differentColor = 0,
          differentDepth = 0,
          maxColor = 0,
          maxDepth = 0;
        for (let i = 0; i < a.color.length; i++) {
          if (a.color[i] !== b.color[i]) differentColor++;
          if (a.depth[i] !== b.depth[i]) differentDepth++;
          maxColor = Math.max(
            maxColor,
            Math.abs(
              DataUtils.fromHalfFloat(a.color[i]) -
                DataUtils.fromHalfFloat(b.color[i]),
            ),
          );
          maxDepth = Math.max(maxDepth, Math.abs(a.depth[i] - b.depth[i]));
        }
        pairs.push({
          mode: mode.name,
          target: a.name,
          pixels: a.color.length / 4,
          differentColor,
          differentDepth,
          maxColor,
          maxDepth,
        });
      }
    }
    return {
      pairs,
      initial,
      final: state(),
      depthDraws,
      gl: r.getContext().getError(),
    };
  } finally {
    r.render = render;
    beauty.depthPrepassEnabled = enabled;
    g.leafUniforms.leafWind.value = wind;
    g.leafUniforms.leafTime.value = time;
    g.fluidRenderer.medium = medium;
    g.cloudSystem.uniforms.cloudVolumetric.value = volumetric;
    r.setRenderTarget(previous);
    material.dispose();
    quad.dispose();
    depthTarget.dispose();
  }
}
