import {
  BufferGeometry,
  Float32BufferAttribute,
  FloatType,
  Mesh,
  OrthographicCamera,
  Scene,
  WebGLRenderTarget,
} from 'three';

// Read displacement from the actual beauty/shadow vertex programs. Only the
// final clip position and fragment output are diagnostic; wind is not replaced.
export function probeFoliageWind(g) {
  const r = g.renderer,
    u = g.leafUniforms,
    saved = {
      target: r.getRenderTarget(),
      time: u.leafTime.value,
      wind: u.leafWind.value,
      viewer: u.leafViewer.value.clone(),
    },
    noise = g.cloudSystem.noise.image,
    samples = [
      { p: [2, 5.6, -3], sky: 1 },
      { p: [2, 5.6, -3], sky: 0.25 },
      { p: [2, 5.6, -3], sky: 0 },
      { p: [2, 5, -3], sky: 1 },
      { p: [-204.375, 24.6, 6], sky: 1 },
      { p: [-1.25, 12.75, 4.5], sky: 1 },
    ],
    target = new WebGLRenderTarget(samples.length, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    rows = [];
  const fract = (x) => x - Math.floor(x);
  // Independent CPU bilinear lookup of the original numeric G channel in the
  // guarded seed header. No production GLSL evaluator is reused here.
  function noiseG(x, y) {
    const px = fract(x) * 512 + 128.5,
      py = fract(y) * 512 + 0.5,
      ix = Math.floor(px),
      iy = Math.floor(py),
      fx = fract(px),
      fy = fract(py),
      at = (a, b) => noise.data[(b * noise.width + a) * 4 + 1] / 255;
    return (
      (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) +
      (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
    );
  }
  function oracle(p, sky, time, strength, thin, localY) {
    const t = 0.3 * time,
      angle = Math.PI / 6,
      direction = [Math.cos(angle), Math.sin(angle)],
      n = noiseG(
        0.05 * (p[0] + direction[0] * t),
        0.05 * (p[2] + direction[1] * t),
      ),
      gust = [direction[0] * n * n, 0.1 * n * n, direction[1] * n * n],
      anchor = thin ? Math.min(1, fract(localY) * 1.4) : 0.5;
    return p.map((v, c) => {
      const phase = 32 * v + 3 * t + c * 2.399963229728653;
      return (
        strength *
        Math.sqrt(sky) ** 2 *
        anchor *
        (gust[c] +
          0.1 *
            (Math.sin(phase) +
              0.5 * Math.sin(2 * phase) +
              0.25 * Math.sin(4 * phase)))
      );
    });
  }
  try {
    u.leafViewer.value.set(10000, 10000, 10000);
    u.leafWind.value = 0.43;
    for (const time of [70, 71])
      for (const offset of [0, 16]) {
        u.leafTime.value = time;
        const positions = [],
          normals = [],
          uv = [],
          sky = [],
          clips = [],
          world = [];
        for (const [i, sample] of samples.entries()) {
          const p = sample.p.map((v, c) =>
            Math.fround(v - (c === 0 ? offset : 0)),
          );
          world.push(p.map((v, c) => Math.fround(v + (c === 0 ? offset : 0))));
          for (const [x, y] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
            [1, 1],
            [0, 1],
          ]) {
            positions.push(...p);
            normals.push(0, 1, 0);
            uv.push(0, 0);
            sky.push(sample.sky);
            clips.push(((i + x) / samples.length) * 2 - 1, y * 2 - 1);
          }
        }
        const geometry = new BufferGeometry();
        for (const [name, data, size] of [
          ['position', positions, 3],
          ['normal', normals, 3],
          ['uv', uv, 2],
          ['skylight', sky, 1],
          ['probeClip', clips, 2],
        ])
          geometry.setAttribute(name, new Float32BufferAttribute(data, size));
        try {
          for (const [name, material, thin] of [
            ['leaf', g.leafMaterials.material, false],
            ['leaf-shadow', g.leafMaterials.depth, false],
            ['plant', g.plantMaterials.material, true],
            ['plant-shadow', g.plantMaterials.depth, true],
          ]) {
            const compile = material.onBeforeCompile,
              key = material.customProgramCacheKey,
              mesh = new Mesh(geometry, material);
            mesh.position.x = offset;
            mesh.frustumCulled = false;
            scene.add(mesh);
            material.onBeforeCompile = function (shader, renderer) {
              compile.call(this, shader, renderer);
              shader.vertexShader =
                'attribute vec2 probeClip; varying vec3 probeWind;\n' +
                shader.vertexShader.replace(
                  '#include <project_vertex>',
                  '#include <project_vertex>\nprobeWind=transformed-position;gl_Position=vec4(probeClip,0.0,1.0);',
                );
              shader.fragmentShader =
                'varying vec3 probeWind;void main(){gl_FragColor=vec4(probeWind,1.0);}';
            };
            material.customProgramCacheKey = () =>
              key.call(material) + '-wind-probe';
            material.needsUpdate = true;
            try {
              r.setRenderTarget(target);
              r.render(scene, camera);
              const values = new Float32Array(samples.length * 4);
              r.readRenderTargetPixels(target, 0, 0, samples.length, 1, values);
              for (const [i, sample] of samples.entries())
                rows.push({
                  name,
                  time,
                  offset,
                  index: i,
                  sky: sample.sky,
                  actual: Array.from(values.slice(i * 4, i * 4 + 3)),
                  expected: oracle(
                    world[i],
                    sample.sky,
                    time,
                    u.leafWind.value,
                    thin,
                    Math.fround(sample.p[1]),
                  ),
                });
            } finally {
              material.onBeforeCompile = compile;
              material.customProgramCacheKey = key;
              material.needsUpdate = true;
              scene.remove(mesh);
            }
          }
        } finally {
          geometry.dispose();
        }
      }
    return {
      rows,
      gl: r.getContext().getError(),
      sharedNoise: u.leafNoise.value === g.cloudSystem.noise,
    };
  } finally {
    u.leafTime.value = saved.time;
    u.leafWind.value = saved.wind;
    u.leafViewer.value.copy(saved.viewer);
    r.setRenderTarget(saved.target);
    target.dispose();
  }
}
