import {
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FloatType,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  PointLight,
  Scene,
  WebGLRenderTarget,
} from 'three';
import { applySkylight } from '../../src/skylight.js';
import {
  foliageUniforms,
  leafMaterials,
  plantMaterials,
} from '../../src/foliage-shader.js';

// Exercise the production terrain callback and both production foliage factories.
// Isolated lights avoid the world's changing sky; read their actual direct term.
export function probeSurfaceDiffuse(g) {
  const renderer = g.renderer,
    previous = renderer.getRenderTarget(),
    shadowType = renderer.shadowMap.type,
    shadowEnabled = renderer.shadowMap.enabled,
    auto = renderer.autoClear,
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new PlaneGeometry(2, 2),
    target = new WebGLRenderTarget(2, 2, { type: FloatType }),
    weather = {
      ...g.dynamicLight.uniforms,
      terrainWetness: { value: 0 },
      surfaceBounce: { value: 0 },
      surfaceDiffuse: { value: 1 },
      waterSunlight: { value: 0 },
      glassSunlight: { value: 0 },
    },
    foliage = foliageUniforms(),
    color = new Color(0.4, 0.6, 0.2),
    terrain = new MeshLambertMaterial({ color, vertexColors: true }),
    leaves = leafMaterials(null, weather, foliage),
    plants = plantMaterials(null, weather, foliage),
    light = new DirectionalLight(new Color(0.9, 0.7, 0.5), 1),
    point = new PointLight(new Color(0.3, 0.8, 1), 0, 10),
    raw = new Float32Array(16),
    samples = [];
  applySkylight(terrain, weather, true);
  for (const [name, size, value] of [
    ['color', 3, 0.7],
    ['skylight', 1, 1],
    ['rainExposure', 1, 0],
    ['surfacePorosity', 1, 0],
    ['blocklight', 3, 0],
    ['ambientOcclusion', 1, 1],
    ['leafAmbient', 1, 0],
  ])
    geometry.setAttribute(
      name,
      new Float32BufferAttribute(new Float32Array(4 * size).fill(value), size),
    );
  camera.position.z = 2;
  light.position.z = 4;
  light.castShadow = true;
  light.shadow.mapSize.set(64, 64);
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 10;
  light.shadow.camera.left = light.shadow.camera.bottom = -2;
  light.shadow.camera.right = light.shadow.camera.top = 2;
  point.position.z = 2;
  const mesh = new Mesh(geometry, terrain);
  mesh.receiveShadow = true;
  scene.add(mesh, light, light.target, point);
  const read = () => {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 2, 2, raw);
    return Array.from(raw.slice(0, 3));
  };
  try {
    renderer.autoClear = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    for (const [name, material] of [
      ['terrain', terrain],
      ['leaves', leaves.material],
      ['plants', plants.material],
    ]) {
      material.color.copy(color);
      material.toneMapped = material.fog = false;
      const compile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, r) => {
        compile.call(material, shader, r);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\ngl_FragColor=vec4(reflectedLight.directDiffuse,1.0);',
        );
      };
      const cacheKey = material.customProgramCacheKey();
      material.customProgramCacheKey = () =>
        cacheKey + '-surface-diffuse-probe';
      mesh.material = material;
      for (const noL of [-1, -0.1, 0, 0.01, 0.1, 0.25, 0.5, 0.9, 1])
        for (const ao of [0, 0.25, 0.5, 1])
          for (const amount of name === 'terrain' ? [0] : [0, 0.5, 1]) {
            light.position.set(Math.sqrt(1 - noL * noL) * 4, 0, noL * 4);
            geometry.attributes.ambientOcclusion.array.fill(ao);
            geometry.attributes.ambientOcclusion.needsUpdate = true;
            foliage.leafSssAmount.value = amount;
            weather.surfaceDiffuse.value = 1;
            const on = read();
            weather.surfaceDiffuse.value = 0;
            const off = read();
            samples.push({ name, noL, ao, amount, on, off });
          }
      light.intensity = 0;
      point.intensity = 3;
      foliage.leafSssAmount.value = 1;
      geometry.attributes.ambientOcclusion.array.fill(0.5);
      geometry.attributes.ambientOcclusion.needsUpdate = true;
      weather.surfaceDiffuse.value = 1;
      const on = read();
      weather.surfaceDiffuse.value = 0;
      samples.push({ name, local: true, on, off: read() });
      light.intensity = 1;
      point.intensity = 0;
    }
    return {
      samples,
      albedo: color.toArray(),
      light: light.color.toArray(),
      faceShade: 0.7,
      gl: renderer.getContext().getError(),
    };
  } finally {
    renderer.autoClear = auto;
    renderer.shadowMap.type = shadowType;
    renderer.shadowMap.enabled = shadowEnabled;
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(previous);
    target.dispose();
    geometry.dispose();
    terrain.dispose();
    leaves.material.dispose();
    leaves.depth.dispose();
    plants.material.dispose();
    plants.depth.dispose();
    light.shadow.map?.dispose();
  }
}
