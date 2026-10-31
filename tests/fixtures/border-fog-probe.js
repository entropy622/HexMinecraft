import {
  DataUtils,
  FloatType,
  GLSL3,
  HalfFloatType,
  NoToneMapping,
  RawShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { borderFogGLSL } from '../../src/border-fog.js';

// Compare the actual shader against independent CPU sampling of the published
// sky attachment. Eight directions exercise azimuth, horizon and upper sky.
export function probeBorderSky(g) {
  const r = g.renderer,
    a = g.skyEnvironment.atmosphere,
    u = g.atmosphere.uniforms,
    map = a.targets.find((t) => t.texture === u.airBorderSky.value);
  if (!map) throw Error('Border is not bound to the published clear sky');
  const raw = new Uint16Array(map.width * map.height * 4);
  r.readRenderTargetPixels(map, 0, 0, map.width, map.height, raw);
  const directions = [
      [1, -0.2, 0],
      [-1, -0.2, 0],
      [0, -0.2, 1],
      [0, -0.2, -1],
      [1, 0.08, 1],
      [-1, 0.12, -1],
      [0.3, 0.7, 0.8],
      [0, 1, 0],
    ].map((d) => new Vector3(...d).normalize()),
    material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { ...u, directions: { value: directions } },
      vertexShader:
        'in vec3 position;void main(){gl_Position=vec4(position,1);}',
      fragmentShader: `precision highp float;${borderFogGLSL}
        uniform vec3 directions[8];out vec4 result;
        void main(){int i=int(gl_FragCoord.x);float distance=60.0+float(i)*22.0;
          result=vec4(airBorderColor(directions[i],vec3(0),1.0),airBorderVisibility(directions[i]*distance,87.32,118.0));}`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    target = new WebGLRenderTarget(8, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    quad = new FullScreenQuad(material),
    previous = r.getRenderTarget(),
    output = new Float32Array(32),
    sample = (d) => {
      const elevation = Math.asin(d.y),
        azimuth = d.x * d.x + d.z * d.z < 1e-10 ? 0 : Math.atan2(d.z, d.x),
        x = (azimuth / (2 * Math.PI) + 0.5) * map.width - 0.5,
        y =
          Math.max(
            0.5,
            0.5 +
              0.5 *
                Math.sign(elevation) *
                Math.sqrt(Math.abs(elevation) / (Math.PI / 2)),
          ) *
            map.height -
          0.5,
        ix = Math.floor(x),
        iy = Math.floor(y),
        fx = x - ix,
        fy = y - iy;
      return [0, 1, 2].map((c) => {
        let value = 0;
        for (let b = 0; b < 2; b++)
          for (let a = 0; a < 2; a++) {
            const xx = (((ix + a) % map.width) + map.width) % map.width,
              yy = Math.min(map.height - 1, Math.max(0, iy + b));
            value +=
              DataUtils.fromHalfFloat(raw[(yy * map.width + xx) * 4 + c]) *
              (a ? fx : 1 - fx) *
              (b ? fy : 1 - fy);
          }
        return (
          value * (1 - u.airBorderFlash.value * 0.5) +
          [0.571, 0.687, 0.831][c] * u.airBorderFlash.value * 0.5
        );
      });
    };
  try {
    r.setRenderTarget(target);
    quad.render(r);
    r.readRenderTargetPixels(target, 0, 0, 8, 1, output);
    const cases = directions.map((d, i) => {
      const t = Math.max(0, Math.min(1, (d.y - 0.15) / -0.1)),
        f = Math.max(u.airBorderHorizon.value, t * (2 - t)) ** 2,
        horizon = new Vector3(d.x, Math.min(d.y, -0.1), d.z).normalize(),
        ray = sample(d),
        edge = sample(horizon),
        expected = ray.map((v, c) => v * (1 - f) + edge[c] * f),
        actual = [...output.slice(i * 4, i * 4 + 3)];
      const distance = 60 + i * 22,
        delta = d.clone().multiplyScalar(distance),
        axes = [
          Math.abs((Math.sqrt(3) * delta.x) / 2 - delta.z / 2),
          Math.abs(delta.z),
        ],
        footprint = Math.min(
          Math.hypot(delta.x, delta.z),
          Math.cbrt(axes[0] ** 3 + axes[1] ** 3),
        ),
        curve = (v) => 2 ** (-8 * Math.min(1, Math.max(0, v)) ** 8),
        expectedVisibility =
          Math.max(
            0,
            Math.min(
              1,
              (curve(footprint / 118) - 2 ** -8) /
                (curve(87.32 / 118) - 2 ** -8),
            ),
          ) * Math.max(0, Math.min(1, (delta.y + 118) / 16));
      return {
        direction: d.toArray(),
        expected,
        actual,
        expectedVisibility,
        actualVisibility: output[i * 4 + 3],
      };
    });
    return {
      cases,
      maxError: Math.max(
        ...cases.flatMap((s) =>
          s.expected.map(
            (v, c) => Math.abs(v - s.actual[c]) / Math.max(1, Math.abs(v)),
          ),
        ),
      ),
      visibilityError: Math.max(
        ...cases.map((s) =>
          Math.abs(s.actualVisibility - s.expectedVisibility),
        ),
      ),
      map: [map.width, map.height],
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}

// Same scene, geometry, shadows, camera and compiled shaders, rendered twice
// without post history. Only the production border-enable uniform changes.
export function probeBorderSurfaces(g) {
  const r = g.renderer,
    target = new WebGLRenderTarget(320, 232, { type: HalfFloatType }),
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    tone = r.toneMapping,
    enabled = g.atmosphere.uniforms.airBorderEnabled.value,
    shadow = r.shadowMap.needsUpdate,
    shadowAuto = r.shadowMap.autoUpdate,
    originals = new Map(),
    clones = new Map(),
    buffers = [],
    hidden = [];
  function clone(m) {
    if (!m?.fog || m.isShaderMaterial || m.transparent) return m;
    if (clones.has(m)) return clones.get(m);
    const c = m.clone(),
      compile = m.onBeforeCompile;
    c.defaultAttributeValues = { ...m.defaultAttributeValues };
    c.onBeforeCompile = (shader, renderer) => {
      compile.call(c, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.a=1.0+airDistance;',
      );
    };
    c.customProgramCacheKey = () =>
      m.customProgramCacheKey() + '-border-distance-probe';
    clones.set(m, c);
    return c;
  }
  try {
    g.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      // Alpha stores surface distance in this diagnostic. Blended water would
      // mix far distances into a false near classification, so inspect opaque
      // surfaces here; the final screenshots retain the complete scene.
      if (materials.some((m) => m?.transparent)) {
        hidden.push(o);
        o.visible = false;
        return;
      }
      originals.set(o, o.material);
      o.material = Array.isArray(o.material)
        ? o.material.map(clone)
        : clone(o.material);
    });
    r.autoClear = true;
    r.toneMapping = NoToneMapping;
    r.shadowMap.autoUpdate = r.shadowMap.needsUpdate = false;
    g.atmosphere.uniforms.airBorderEnabled.value = 0;
    r.setRenderTarget(target);
    r.render(g.scene, g.camera);
    for (const value of [0, 1]) {
      g.atmosphere.uniforms.airBorderEnabled.value = value;
      r.setRenderTarget(target);
      r.render(g.scene, g.camera);
      const data = new Uint16Array(target.width * target.height * 4);
      r.readRenderTargetPixels(target, 0, 0, target.width, target.height, data);
      buffers.push(data);
    }
    const [before, after] = buffers;
    let near = 0,
      nearError = 0,
      far = 0,
      farDifference = 0;
    for (let i = 0; i < before.length; i += 4) {
      const distance = DataUtils.fromHalfFloat(before[i + 3]) - 1;
      if (distance <= 0) continue;
      const delta = [0, 1, 2].map((c) =>
        Math.abs(
          DataUtils.fromHalfFloat(before[i + c]) -
            DataUtils.fromHalfFloat(after[i + c]),
        ),
      );
      if (distance < g.scene.fog.near - 1) {
        near++;
        nearError = Math.max(nearError, ...delta);
      }
      if (distance > g.scene.fog.near + 1) {
        far++;
        farDifference += delta.reduce((a, b) => a + b, 0) / 3;
      }
    }
    return {
      near,
      nearError,
      far,
      farMeanDifference: farDifference / Math.max(1, far),
      gl: r.getContext().getError(),
    };
  } finally {
    for (const [o, m] of originals) o.material = m;
    for (const o of hidden) o.visible = true;
    for (const c of clones.values()) c.dispose();
    g.atmosphere.uniforms.airBorderEnabled.value = enabled;
    r.setRenderTarget(previous);
    r.autoClear = auto;
    r.toneMapping = tone;
    r.shadowMap.needsUpdate = shadow;
    r.shadowMap.autoUpdate = shadowAuto;
    target.dispose();
  }
}
