import {
  Color,
  DataUtils,
  Float32BufferAttribute,
  HalfFloatType,
  LightProbe,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Uint8BufferAttribute,
  WebGLRenderTarget,
} from 'three';
import {
  leafMaterials,
  plantMaterials,
  foliageUniforms,
} from '../../src/foliage-shader.js';

export function probeLeafAmbient(g, plants = false) {
  const renderer = g.renderer,
    previous = renderer.getRenderTarget(),
    shadowEnabled = renderer.shadowMap.enabled,
    target = new WebGLRenderTarget(1, 1, { type: HalfFloatType }),
    data = new Uint16Array(4),
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new PlaneGeometry(4, 4),
    uniforms = foliageUniforms(),
    materials = (plants ? plantMaterials : leafMaterials)(
      null,
      {
        ...g.weatherUniforms,
        terrainWetness: { value: 0 },
        surfaceBounce: { value: 0 },
      },
      uniforms,
    ),
    material = materials.material,
    probe = new LightProbe(),
    samples = [];
  material.color = new Color(0.4, 0.6, 0.2);
  if (plants) uniforms.leafSssAmount.value = 0.5;
  material.toneMapped = false;
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
  const ambient = new Uint8BufferAttribute(new Uint8Array(4), 1, true);
  geometry.setAttribute('leafAmbient', ambient);
  scene.add(new Mesh(geometry, material), probe);
  const attr = (name, value) => {
    geometry.attributes[name].array.fill(value);
    geometry.attributes[name].needsUpdate = true;
  };
  const read = () => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, data);
    return Array.from(data, DataUtils.fromHalfFloat).slice(0, 3);
  };
  try {
    renderer.shadowMap.enabled = false;
    for (const field of [
      { base: [0.3, 0.35, 0.4], slope: [0, 0, 0] },
      { base: [0.3, 0.35, 0.4], slope: [0.1, -0.08, 0.12] },
    ]) {
      probe.sh.zero();
      probe.sh.coefficients[0]
        .fromArray(field.base)
        .multiplyScalar(Math.sqrt(4 * Math.PI));
      probe.sh.coefficients[1]
        .fromArray(field.slope)
        .multiplyScalar(Math.sqrt((4 * Math.PI) / 3));
      for (const rotated of [false, true]) {
        camera.position.set(...(rotated ? [2, 1, 4] : [0, 0, 4]));
        camera.lookAt(0, 0, 0);
        for (const sky of [0, 0.25, 1])
          for (const ao of [0, 0.64, 1])
            for (const byte of [0, 64, 255]) {
              attr('skylight', sky);
              attr('ambientOcclusion', ao);
              attr('leafAmbient', byte);
              // Alternate the geometric normal and face shade; sky SSS uses
              // upward world irradiance, independent of the face/camera frame.
              const n = byte === 64 ? [0, 1, 0] : [0, 0, 1],
                shade = byte === 64 ? 0.6 : 1;
              for (let i = 0; i < 4; i++)
                geometry.attributes.normal.setXYZ(i, ...n);
              geometry.attributes.normal.needsUpdate = true;
              attr('color', shade);
              probe.intensity = 0;
              const off = read();
              probe.intensity = 1;
              const on = read();
              let withoutAmbient;
              if (plants) {
                attr('leafAmbient', 0);
                withoutAmbient = read();
                attr('leafAmbient', byte);
              }
              samples.push({
                field,
                rotated,
                sky,
                ao,
                byte,
                shade,
                on,
                off,
                withoutAmbient,
              });
            }
      }
    }
    geometry.deleteAttribute('leafAmbient');
    attr('ambientOcclusion', 1);
    attr('color', 1);
    attr('skylight', 1);
    probe.sh.zero();
    probe.sh.coefficients[0]
      .set(1, 1, 1)
      .multiplyScalar(Math.sqrt(4 * Math.PI));
    probe.intensity = 0;
    const off = read();
    probe.intensity = 1;
    const on = read();
    return {
      samples,
      missingAttribute: { off, on },
      albedo: material.color.toArray(),
      gl: renderer.getContext().getError(),
    };
  } finally {
    renderer.setRenderTarget(previous);
    renderer.shadowMap.enabled = shadowEnabled;
    target.dispose();
    geometry.dispose();
    material.dispose();
    materials.depth.dispose();
  }
}
