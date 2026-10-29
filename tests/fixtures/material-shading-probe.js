import {
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LightProbe,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  DirectionalLight,
  WebGLRenderTarget,
  DataUtils,
} from 'three';
import { applySkylight } from '../../src/skylight.js';

// Actual forward material, lights and shader callbacks; no CPU BRDF model.
export function probeMaterialShading(g) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new PlaneGeometry(2, 2),
    target = new WebGLRenderTarget(1, 1, { type: HalfFloatType }),
    material = new MeshLambertMaterial({
      color: new Color(0.4, 0.6, 0.2),
      vertexColors: true,
      toneMapped: false,
    }),
    light = new DirectionalLight(new Color(0.9, 0.7, 0.5), 1),
    probe = new LightProbe(),
    mode = { value: 0 },
    pixels = new Uint16Array(4),
    samples = [];
  for (const [name, size, value] of [
    ['color', 3, 1],
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
    { ...g.dynamicLight.uniforms, terrainWetness: { value: 0 } },
    true,
  );
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.shadingProbeMode = mode;
    shader.fragmentShader =
      'uniform int shadingProbeMode;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      if(shadingProbeMode==0)outgoingLight=diffuseColor.rgb;
      #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'material-shading-probe-v1';
  probe.sh.coefficients[0]
    .set(0.18, 0.5, 1)
    .multiplyScalar(Math.sqrt(4 * Math.PI));
  camera.position.z = 2;
  light.position.z = 2;
  scene.add(new Mesh(geometry, material), light, probe);
  const read = () => {
    r.setRenderTarget(target);
    r.render(scene, camera);
    r.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
    return Array.from(pixels, DataUtils.fromHalfFloat).slice(0, 3);
  };
  try {
    r.autoClear = true;
    for (const shade of [0.25, 1]) {
      geometry.attributes.color.array.fill(shade);
      geometry.attributes.color.needsUpdate = true;
      mode.value = 0;
      samples.push({ shade, name: 'albedo', rgb: read() });
      mode.value = 1;
      for (const [name, sun, sky, emission] of [
        ['base', 0, 0, 0],
        ['sun', 1, 0, 0],
        ['sky', 0, 1, 0],
        ['emission', 0, 0, 1],
      ]) {
        light.intensity = sun;
        probe.intensity = sky;
        material.emissive.setRGB(
          emission * 0.1,
          emission * 0.2,
          emission * 0.3,
        );
        samples.push({ shade, name, rgb: read() });
      }
    }
    return { samples, gl: r.getContext().getError() };
  } finally {
    r.autoClear = auto;
    r.setRenderTarget(previous);
    target.dispose();
    geometry.dispose();
    material.dispose();
  }
}
