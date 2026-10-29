import {
  BasicShadowMap,
  Color,
  DataUtils,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  HalfFloatType,
  LightProbe,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderTarget,
} from 'three';
import { applySkylight } from '../../src/skylight.js';

// Actual forward shader, real SH uniforms and real directional shadow map.
// A color/depth-write-disabled caster remains visible only to the shadow pass.
export function probeSurfaceIndirect(g) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    shadowState = {
      enabled: r.shadowMap.enabled,
      type: r.shadowMap.type,
      autoUpdate: r.shadowMap.autoUpdate,
      needsUpdate: r.shadowMap.needsUpdate,
    },
    target = new WebGLRenderTarget(1, 1, { type: HalfFloatType }),
    pixels = new Uint16Array(4),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    scene = new Scene(),
    geometry = new PlaneGeometry(4, 4),
    material = new MeshLambertMaterial({
      color: new Color(0.4, 0.6, 0.2),
      vertexColors: true,
      toneMapped: false,
    }),
    casterGeometry = new PlaneGeometry(1, 1),
    casterMaterial = new MeshBasicMaterial({
      side: DoubleSide,
      colorWrite: false,
      depthWrite: false,
    }),
    receiver = new Mesh(geometry, material),
    caster = new Mesh(casterGeometry, casterMaterial),
    sun = new DirectionalLight(new Color(0.9, 0.7, 0.5), 1),
    probe = new LightProbe(),
    bounce = { value: 0 },
    samples = [],
    fields = [],
    nativeSkyEncoding = [];
  g.scene.traverseVisible((o) => {
    if (nativeSkyEncoding.length >= 12) return;
    const values = o.geometry?.attributes.skylight,
      indices = o.geometry?.userData.lightSamples?.indices;
    if (!values || !indices) return;
    for (let j = 0; j < values.count && nativeSkyEncoding.length < 12; j++) {
      const raw = indices[j] < 0 ? 0 : g.voxelLight.sky[indices[j]];
      if (raw > 0 && raw < 15)
        nativeSkyEncoding.push({ raw, factor: values.array[j] });
    }
  });
  for (const [name, size, value] of [
    ['color', 3, 1],
    ['ambientOcclusion', 1, 1],
    ['skylight', 1, 1],
    ['rainExposure', 1, 0],
    ['surfacePorosity', 1, 1],
    ['blocklight', 3, 0],
  ])
    geometry.setAttribute(
      name,
      new Float32BufferAttribute(new Float32Array(4 * size).fill(value), size),
    );
  applySkylight(
    material,
    {
      ...g.dynamicLight.uniforms,
      terrainWetness: { value: 0 },
      surfaceBounce: bounce,
    },
    true,
  );
  camera.position.z = 4;
  sun.position.z = 3;
  sun.castShadow = true;
  sun.shadow.mapSize.set(128, 128);
  Object.assign(sun.shadow.camera, {
    left: -2,
    right: 2,
    bottom: -2,
    top: 2,
    near: 0.1,
    far: 10,
  });
  sun.shadow.camera.updateProjectionMatrix();
  receiver.receiveShadow = true;
  caster.castShadow = true;
  caster.position.z = 1;
  scene.add(receiver, caster, sun, sun.target, probe);
  const attr = (name, value) => {
    geometry.attributes[name].array.fill(value);
    geometry.attributes[name].needsUpdate = true;
  };
  const normal = (n) => {
    for (let i = 0; i < 4; i++) geometry.attributes.normal.setXYZ(i, ...n);
    geometry.attributes.normal.needsUpdate = true;
  };
  const read = () => {
    r.setRenderTarget(target);
    r.shadowMap.needsUpdate = true;
    r.render(scene, camera);
    r.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
    return Array.from(pixels, DataUtils.fromHalfFloat).slice(0, 3);
  };
  try {
    r.autoClear = true;
    r.shadowMap.enabled = true;
    r.shadowMap.type = BasicShadowMap;
    r.shadowMap.autoUpdate = true;
    caster.visible = false;
    sun.intensity = 0;
    for (const spec of [
      {
        name: 'constant',
        normal: [0, 0, 1],
        base: [0.3, 0.35, 0.4],
        linear: [0, 0, 0],
        quadratic: [0, 0, 0],
      },
      {
        name: 'directional-z',
        normal: [0, 0, 1],
        base: [0.3, 0.35, 0.4],
        linear: [0.1, -0.08, 0.12],
        quadratic: [0.08, 0.04, -0.08],
      },
      {
        name: 'directional-x',
        normal: [1, 0, 0],
        base: [0.3, 0.35, 0.4],
        linear: [0.1, -0.08, 0.12],
        quadratic: [0.08, 0.04, -0.08],
      },
      {
        name: 'all-nine-rotated-camera',
        normal: [0.48, 0.64, 0.6],
        axis: [0.3, 0.4, Math.sqrt(0.75)],
        camera: [3, 2, 4],
        base: [0.3, 0.35, 0.4],
        linear: [0.1, -0.08, 0.12],
        quadratic: [0.08, 0.04, -0.08],
      },
    ]) {
      spec.axis ??= [0, 0, 1];
      camera.position.fromArray(spec.camera ?? [0, 0, 4]);
      camera.lookAt(0, 0, 0);
      for (const c of probe.sh.coefficients) c.setScalar(0);
      probe.sh.coefficients[0]
        .fromArray(spec.base)
        .multiplyScalar(Math.sqrt(4 * Math.PI));
      const [x, y, z] = spec.axis;
      for (const [index, weight] of [
        [1, y],
        [2, z],
        [3, x],
      ])
        probe.sh.coefficients[index]
          .fromArray(spec.linear)
          .multiplyScalar(Math.sqrt((4 * Math.PI) / 3) * weight);
      for (const [index, weight] of [
        [4, Math.sqrt(3) * x * y],
        [5, Math.sqrt(3) * y * z],
        [6, (3 * z * z - 1) / 2],
        [7, Math.sqrt(3) * x * z],
        [8, (Math.sqrt(3) / 2) * (x * x - y * y)],
      ])
        probe.sh.coefficients[index]
          .fromArray(spec.quadratic)
          .multiplyScalar(Math.sqrt((4 * Math.PI) / 5) * weight);
      normal(spec.normal);
      for (const ao of [0, 0.25, 0.64, 1]) {
        attr('ambientOcclusion', ao);
        probe.intensity = 0;
        const base = read();
        probe.intensity = 1;
        fields.push({ spec, ao, base, lit: read() });
      }
    }
    probe.intensity = 0;
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    normal([0, 0, 1]);
    for (const [name, ao, sky, shade, blocked, power] of [
      ['open', 1, 1, 1, false, 1],
      ['shadow', 1, 1, 1, true, 1],
      ['occluded', 0.25, 1, 1, true, 1],
      ['low-sky', 1, 0.5, 1, true, 1],
      ['sealed', 1, 0, 1, true, 1],
      ['face-shade', 1, 1, 0.5, true, 1],
      ['no-source', 1, 1, 1, true, 0],
      ['default-ao', 1, 1, 1, true, 1],
    ]) {
      attr('ambientOcclusion', ao);
      if (name === 'default-ao') geometry.deleteAttribute('ambientOcclusion');
      attr('skylight', sky);
      attr('color', shade);
      caster.visible = blocked;
      sun.intensity = power;
      bounce.value = 0;
      const off = read();
      bounce.value = 1;
      const on = read();
      samples.push({ name, ao, sky, shade, blocked, power, off, on });
    }
    return {
      nativeSkyEncoding,
      fields,
      samples,
      albedo: material.color.toArray(),
      sun: sun.color.toArray(),
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    Object.assign(r.shadowMap, shadowState);
    target.dispose();
    geometry.dispose();
    casterGeometry.dispose();
    material.dispose();
    casterMaterial.dispose();
    sun.dispose();
  }
}
