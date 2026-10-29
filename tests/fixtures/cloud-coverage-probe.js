import {
  DataUtils,
  FloatType,
  GLSL3,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CLOUD_COVERAGE_SPANS, cloudFieldGLSL } from '../../src/cloud-field.js';

let previousAtlas = null;

// Read the actual atlas and compare production cached/analytic GPU functions.
// The seed header is checked against its authoritative uploaded byte lattice.
export function readCloudCoverage(g, anchors = null) {
  const pass = g.composer.passes[0].clouds.coverage,
    u = g.cloudSystem.uniforms;
  if (!pass.target || u.cloudNoise.value !== pass.target.texture)
    throw Error('The actual coverage atlas is not bound');
  const header = new Uint16Array(127 * 127 * 4);
  g.renderer.readRenderTargetPixels(pass.target, 0, 0, 127, 127, header);
  let headerMismatches = 0;
  for (let i = 0; i < 127 * 127; i++)
    headerMismatches +=
      DataUtils.fromHalfFloat(header[i * 4]) !==
      u.cloudSeedNoise.value.image.data[i];
  function compareAtlas() {
    const atlas = new Uint16Array(1024 * 1024 * 4),
      origins = u.cloudCoverageOrigin.value.map((v) => v.toArray()),
      atlasOverlap = [];
    g.renderer.readRenderTargetPixels(pass.target, 0, 128, 1024, 1024, atlas);
    if (previousAtlas)
      for (let layer = 0; layer < 2; layer++) {
        const shift = origins[layer].map((v, i) =>
          Math.round(
            ((v - previousAtlas.origins[layer][i]) * 1024) /
              CLOUD_COVERAGE_SPANS[layer],
          ),
        );
        let differences = 0,
          maximum = 0,
          first = null;
        for (let y = 0; y < 1024; y++)
          for (let x = 0; x < 1024; x++) {
            const oldX = x + shift[0],
              oldY = y + shift[1];
            if (oldX < 0 || oldX >= 1024 || oldY < 0 || oldY >= 1024) continue;
            for (let c = layer * 2; c < layer * 2 + 2; c++) {
              const a = atlas[(y * 1024 + x) * 4 + c],
                b = previousAtlas.data[(oldY * 1024 + oldX) * 4 + c];
              if (a !== b) {
                differences++;
                maximum = Math.max(
                  maximum,
                  Math.abs(
                    DataUtils.fromHalfFloat(a) - DataUtils.fromHalfFloat(b),
                  ),
                );
                first ??= {
                  x,
                  y,
                  c,
                  a: DataUtils.fromHalfFloat(a),
                  b: DataUtils.fromHalfFloat(b),
                };
              }
            }
          }
        atlasOverlap.push({ layer, shift, differences, maximum, first });
      }
    previousAtlas = { origins, data: atlas };
    return atlasOverlap;
  }
  anchors ??= u.cloudCoverageOrigin.value.map((v) => v.toArray());
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...u,
      probeAnchor: { value: anchors.map((p) => new Vector2(...p)) },
    },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `${cloudFieldGLSL}
      uniform vec2 probeAnchor[2];out vec4 coverageProbe;
      void main(){
        int layer=int(floor(gl_FragCoord.y/64.0));
        vec2 uv=vec2(gl_FragCoord.x,mod(gl_FragCoord.y,64.0))/64.0;
        float span=layer==0?${(CLOUD_COVERAGE_SPANS[0] * 1.2).toFixed(1)}:${(CLOUD_COVERAGE_SPANS[1] * 1.2).toFixed(1)};
        vec2 p=probeAnchor[layer]+(uv-0.5)*span+vec2(0.123,0.371);
        coverageProbe=vec4(hexCloudMacro(p,layer),hexCloudMacroAnalytic(p,layer));
      }`,
  });
  const target = new WebGLRenderTarget(64, 128, {
    type: FloatType,
    depthBuffer: false,
  });
  const quad = new FullScreenQuad(material),
    previous = g.renderer.getRenderTarget();
  const output = new Float32Array(64 * 128 * 4);
  try {
    g.renderer.setRenderTarget(target);
    quad.render(g.renderer);
    g.renderer.readRenderTargetPixels(target, 0, 0, 64, 128, output);
  } finally {
    g.renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
  const samplerPrograms = [];
  for (const p of g.renderer.info.programs) {
    const gl = g.renderer.getContext(),
      samplers = [];
    for (
      let i = 0;
      i < gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS);
      i++
    ) {
      const v = gl.getActiveUniform(p.program, i);
      if (
        v.name.startsWith('cloud') &&
        [gl.SAMPLER_2D, gl.SAMPLER_3D].includes(v.type)
      )
        samplers.push(v.name);
    }
    if (samplers.includes('cloudWorley')) samplerPrograms.push(samplers.sort());
  }
  return {
    spans: CLOUD_COVERAGE_SPANS,
    anchors,
    origins: u.cloudCoverageOrigin.value.map((v) => v.toArray()),
    output: Array.from(output),
    headerMismatches,
    size: [pass.target.width, pass.target.height],
    seed: g.cloudSystem.noiseSeed,
    seedVersion: u.cloudSeedNoise.value.version,
    samplerPrograms,
    atlasOverlap: compareAtlas(),
    gl: g.renderer.getContext().getError(),
  };
}
