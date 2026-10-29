import { DataUtils, PointLight, Vector3 } from 'three';

// Keep the native material, alpha test, wind, lights, voxel transport and pass.
// The solar pair disables only the real source uniform in the second draw.
export function readPlantLighting(
  g,
  position,
  pointLight = false,
  { full = true, water = false } = {},
) {
  const r = g.renderer,
    frame = g.composer.passes[0],
    original = g.foliageMaterial,
    clone = original.clone(),
    compile = original.onBeforeCompile,
    objects = [],
    mode = { value: 0 },
    u = g.plantUniforms,
    source = u.leafSunColor.value.clone(),
    strength = u.leafSssAmount.value,
    intensity = g.sun.intensity,
    target = r.getRenderTarget(),
    root = new Vector3(...position);
  let point;
  clone.defaultAttributeValues = { ...original.defaultAttributeValues };
  clone.toneMapped = clone.fog = false;
  clone.onBeforeCompile = (shader, renderer) => {
    compile.call(clone, shader, renderer);
    shader.uniforms.plantProbeMode = mode;
    shader.fragmentShader =
      'uniform int plantProbeMode;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        if(plantProbeMode==1) gl_FragColor.rgb=reflectedLight.directDiffuse;
        if(plantProbeMode==2) gl_FragColor.rgb=leafTransmittance(diffuseColor.rgb);
        if(plantProbeMode==3) gl_FragColor.rgb=leafLightTransmission;
        if(plantProbeMode==4) gl_FragColor.rgb=vec3(vSkylight);
        gl_FragColor.a=2.0;`,
      );
  };
  clone.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-native-plant-probe-v1';
  g.scene.traverse((o) => {
    if (o.material !== original) return;
    objects.push(o);
    o.material = clone;
  });
  const read = (component = 0) => {
    mode.value = component;
    r.shadowMap.needsUpdate = true;
    if (water) frame.render(r, g.composer.writeBuffer, g.composer.readBuffer);
    else frame.beauty.render(r, null, frame.target);
    const t = water ? frame.opaque : frame.target,
      raw = new Uint16Array(t.width * t.height * 4),
      center = root.clone().project(g.camera),
      x = Math.round((center.x * 0.5 + 0.5) * t.width),
      y = Math.round((center.y * 0.5 + 0.5) * t.height),
      pixels = [];
    r.readRenderTargetPixels(t, 0, 0, t.width, t.height, raw);
    for (let dy = -15; dy <= 15; dy++)
      for (let dx = -15; dx <= 15; dx++) {
        const i = ((y + dy) * t.width + x + dx) * 4;
        pixels.push(Array.from(raw.slice(i, i + 4), DataUtils.fromHalfFloat));
      }
    return pixels;
  };
  try {
    const on = read();
    u.leafSunColor.value.setRGB(0, 0, 0);
    const off = read();
    u.leafSunColor.value.copy(source);
    if (!full)
      return {
        on,
        off,
        strength,
        sheen: u.leafSheen.value,
        source: source.toArray(),
        captureReady: g.fluidRenderer.waterUniforms.waterSceneReady.value,
        gl: r.getContext().getError(),
      };
    const transmission = read(2),
      filter = read(3),
      sky = read(4),
      direct = read(1);
    u.leafSssAmount.value = 0;
    const directBase = read(1);
    u.leafSssAmount.value = strength;
    let local;
    if (pointLight) {
      g.sun.intensity = 0;
      point = new PointLight('#ffffff', 4, 12);
      point.position.copy(g.camera.position);
      g.scene.add(point);
      const on = read(1);
      u.leafSssAmount.value = 0;
      local = { on, off: read(1) };
    }
    return {
      on,
      off,
      transmission,
      filter,
      sky,
      direct,
      directBase,
      local,
      strength,
      sheen: u.leafSheen.value,
      source: source.toArray(),
      shadow: root.applyMatrix4(g.sun.shadow.matrix).toArray(),
      gl: r.getContext().getError(),
    };
  } finally {
    for (const object of objects) object.material = original;
    u.leafSunColor.value.copy(source);
    u.leafSssAmount.value = strength;
    g.sun.intensity = intensity;
    if (point) g.scene.remove(point);
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(target);
    clone.dispose();
  }
}
