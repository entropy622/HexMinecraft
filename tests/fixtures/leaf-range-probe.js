import { FloatType, ShaderMaterial, Vector3, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { World } from '../../src/world.js';
import { VoxelLight } from '../../src/voxel-light.js';
import { DynamicLight } from '../../src/dynamic-light.js';
import { axialToWorld } from '../../src/core.js';
import { lightVolumeGLSL } from '../../src/light-volume-shader.js';
import { leafLightingGLSL } from '../../src/leaf-lighting.js';
import { leafTransmissionGLSL } from '../../src/leaf-transmission.js';

// Fine independent ray integration: nearest-center classification, without
// cube rounding, face exits or the production shader's DDA traversal.
function oracle(field, position, direction, top) {
  if (direction[1] <= 0.00001) return { blocked: true };
  const start = position.map((v, c) => v + direction[c] * 0.015),
    ds = 0.0002;
  const cellIndex = (p, height = Math.floor(p[1])) => {
    const fq = p[0] / Math.sqrt(3) - p[2] / 3,
      fr = (2 * p[2]) / 3;
    let q,
      r,
      best = Infinity;
    for (let a = Math.round(fq) - 1; a <= Math.round(fq) + 1; a++)
      for (let b = Math.round(fr) - 1; b <= Math.round(fr) + 1; b++) {
        const center = axialToWorld(a, b),
          d = (center.x - p[0]) ** 2 + (center.z - p[2]) ** 2;
        if (d < best) {
          best = d;
          q = a;
          r = b;
        }
      }
    return field.index(q, height, r);
  };
  if (start[1] >= 64)
    return cellIndex(start, 63) < 0
      ? { blocked: true }
      : { blocked: false, thickness: 0.06, leaves: 0 };
  if (cellIndex(start) < 0) return { blocked: true };
  let thickness = 0.06,
    leaves = 0,
    previous = -1;
  for (
    let t = ds * 0.5;
    t < Math.max(0, (top - start[1]) / direction[1]);
    t += ds
  ) {
    const p = start.map((v, c) => v + direction[c] * t),
      i = cellIndex(p);
    if (
      i < 0 ||
      field.cost[i] >= 16 ||
      field.medium[i] === 13 ||
      (field.medium[i] > 0 && field.medium[i] < 12)
    )
      return { blocked: true };
    if (field.medium[i] === 12) {
      thickness += ds;
      if (i !== previous) leaves++;
    }
    previous = i;
  }
  return { blocked: false, thickness, leaves };
}

export function probeLeafRange(g) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    output = new WebGLRenderTarget(1, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    pixels = new Float32Array(4),
    world = new World(624, 'overworld', { load: false }),
    volume = new DynamicLight(),
    rows = [],
    fades = [],
    material = new ShaderMaterial({
      uniforms: {
        ...volume.uniforms,
        leafVolumeTop: { value: 64 },
        leafSunDirection: { value: new Vector3(0, 1, 0) },
        vLightPosition: { value: new Vector3(0, 45.2, 0) },
        albedo: { value: new Vector3(0.16, 0.37, 0.08) },
        probeMode: { value: 0 },
        probeProjection: { value: new Vector3() },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${lightVolumeGLSL}\n${leafLightingGLSL}
        uniform vec3 leafSunDirection; uniform vec3 vLightPosition; uniform vec3 albedo;
        ${leafTransmissionGLSL}
        uniform int probeMode; uniform vec3 probeProjection;
        void main(){gl_FragColor=vec4(probeMode==0?leafFarTransmittance(albedo):vec3(leafShadowRangeFade(probeProjection)),1);}`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material);
  world.ensureAround(0, 0, 1);
  for (const [key] of [...world.blocks])
    if (+key.split(',')[1] >= 40)
      world.set(...key.split(',').map(Number), null);
  world.set(0, 45, 0, 'leaves');
  const read = () => {
    r.setRenderTarget(output);
    quad.render(r);
    r.readRenderTargetPixels(output, 0, 0, 1, 1, pixels);
    return Array.from(pixels).slice(0, 3);
  };
  try {
    for (const spec of [
      { name: 'thin' },
      {
        name: 'thick',
        cells: [
          [0, 46, 0, 'leaves'],
          [0, 47, 0, 'leaves'],
        ],
      },
      { name: 'roof', cells: [[0, 47, 0, 'stone']] },
      { name: 'slab', cells: [[0, 47, 0, 'stoneSlab']] },
      { name: 'glass', cells: [[0, 47, 0, 'redStainedGlass']] },
      { name: 'water', water: true },
      {
        name: 'unknown',
        cells: [[-7, 63, -7, 'stone']],
        directions: [[0.99, 0.05, 0.1]],
      },
      { name: 'outside', position: [1000, 45.2, 1000] },
      { name: 'top-leaf', position: [0, 64, 0], cells: [[0, 63, 0, 'leaves']] },
      { name: 'outside-top', position: [1000, 64, 1000] },
      { name: 'outside-above-loaded-top', position: [1000, 60, 1000] },
      { name: 'below-world', position: [0, -1, 0] },
      { name: 'horizontal', directions: [[1, 0, 0]] },
    ]) {
      for (const cell of spec.cells || []) world.set(...cell);
      if (spec.water) world.fluids.source(0, 47, 0, 'water');
      const field = new VoxelLight(world);
      field.update(0, true);
      volume.upload(field);
      material.uniforms.leafVolumeTop.value = field.opticalTop;
      const position = spec.position || [0, 45.2, 0];
      material.uniforms.vLightPosition.value.fromArray(position);
      for (const raw of spec.directions || [
        [0, 1, 0],
        [0.3, 0.9, 0.2],
      ]) {
        const direction = raw.map((v) => v / Math.hypot(...raw));
        material.uniforms.leafSunDirection.value.fromArray(direction);
        rows.push({
          name: spec.name,
          position,
          direction,
          top: field.opticalTop,
          rgb: read(),
          oracle: oracle(field, position, direction, field.opticalTop),
        });
      }
      for (const [q, y, rr] of spec.cells || []) world.set(q, y, rr, null);
      if (spec.water) world.fluids.write(0, 47, 0, null);
    }
    material.uniforms.probeMode.value = 1;
    for (let axis = 0; axis < 3; axis++)
      for (const side of [-1, 1])
        for (let i = 0; i <= 100; i++) {
          const p = [0.5, 0.5, 0.5];
          p[axis] = 0.5 + side * (0.44 + i * 0.0008);
          material.uniforms.probeProjection.value.fromArray(p);
          fades.push({ axis, side, p, value: read()[0] });
        }
    return {
      rows,
      fades,
      albedo: material.uniforms.albedo.value.toArray(),
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    output.dispose();
    material.dispose();
    quad.dispose();
    volume.uniforms.entityLightVolume.value?.dispose();
  }
}
