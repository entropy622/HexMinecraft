import { FloatType, WebGLRenderTarget } from 'three';
import { worldToAxial } from '../../src/core.js';

// Actual native material, atlas, lighting attributes and main camera. Temporary
// diagnostic target only; no synthetic material/lighting replaces the product.
export function readNativeWet(g) {
  const r = g.renderer,
    original = g.material,
    copy = original.clone(),
    compile = original.onBeforeCompile,
    mode = { value: 0 },
    protection = g.composer.effects.protection.target,
    width = protection.width,
    height = protection.height,
    target = new WebGLRenderTarget(width, height, { type: FloatType }),
    previous = r.getRenderTarget(),
    wetness = g.weatherUniforms.terrainWetness.value,
    shadowAuto = r.shadowMap.autoUpdate,
    shadowUpdate = r.shadowMap.needsUpdate,
    objects = [],
    hidden = [],
    masks = new Uint8Array(width * height * 4),
    albedos = new Uint8Array(masks.length),
    geometries = new Uint8Array(masks.length);
  for (const [data, attachment] of [
    [masks, 0],
    [albedos, 1],
    [geometries, 2],
  ])
    r.readRenderTargetPixels(
      protection,
      0,
      0,
      width,
      height,
      data,
      0,
      attachment,
    );
  copy.defaultAttributeValues = { ...original.defaultAttributeValues };
  copy.fog = copy.toneMapped = false;
  copy.onBeforeCompile = (shader, renderer) => {
    compile.call(copy, shader, renderer);
    shader.uniforms.wetProbeMode = mode;
    shader.fragmentShader =
      'uniform int wetProbeMode;\n' +
      shader.fragmentShader.replace(
        '// HEX_SURFACE_DATA_READY',
        `
      vec3 data=diffuseColor.rgb;
      if(wetProbeMode==1)data=vec3(surfaceOptical.roughness,surfaceOptical.f0,surfaceOptical.ssr);
      if(wetProbeMode==2)data=vec3(surfacePuddle,surfacePuddleCoverage,surfacePorosity);
      if(wetProbeMode==3)data=vLightPosition;
      if(wetProbeMode==4)data=normalize(inverseTransformDirection(normal,viewMatrix));
      bool top=abs(vLightPosition.y-49.0)<0.005;
      gl_FragColor=vec4(data,top?2.0:-1.0);return;
      // HEX_SURFACE_DATA_READY`,
      );
  };
  copy.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-native-wet-probe';
  g.scene.traverse((object) => {
    if (object.material === original) {
      objects.push(object);
      object.material = copy;
    }
  });
  for (const object of [...g.camera.children, g.outline, g.shapeOutline]) {
    hidden.push([object, object.visible]);
    object.visible = false;
  }
  function read(component, wet) {
    mode.value = component;
    g.weatherUniforms.terrainWetness.value = wet;
    r.setRenderTarget(target);
    r.render(g.scene, g.camera);
    const pixels = new Float32Array(masks.length);
    r.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return pixels;
  }
  const encode = (v) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  const oct = (normal) => {
    const length = normal.reduce((sum, v) => sum + Math.abs(v), 0),
      [x, y, z] = normal.map((v) => v / length);
    return z < 0
      ? [
          (1 - Math.abs(y)) * Math.sign(x),
          (1 - Math.abs(x)) * Math.sign(y),
        ].map((v) => v * 0.5 + 0.5)
      : [x * 0.5 + 0.5, y * 0.5 + 0.5];
  };
  try {
    r.shadowMap.autoUpdate = r.shadowMap.needsUpdate = false;
    const dry = read(0, 0),
      dryOptics = read(1, 0),
      wet = read(0, wetness),
      optics = read(1, wetness),
      factors = read(2, wetness),
      position = read(3, wetness),
      normal = read(4, wetness),
      groups = {};
    let invalid = 0,
      maxAlbedoError = 0,
      maxOpticsError = 0,
      maxCoverageError = 0,
      maxNormalError = 0,
      gbufferSamples = 0;
    for (let i = 0; i < masks.length; i += 4) {
      if (position[i + 3] !== 2) continue;
      const cell = worldToAxial(position[i], position[i + 2]);
      if (Math.abs(cell.q) > 6 || Math.abs(cell.r) > 5) continue;
      const roof = cell.q <= -3 && cell.r >= 3,
        type = roof ? 'sheltered' : g.world.get(cell.q, 48, cell.r),
        row = (groups[type] ??= {
          samples: 0,
          puddled: 0,
          darkening: 0,
          coverage: 0,
        }),
        p = factors[i],
        c = factors[i + 1],
        porosity = factors[i + 2];
      row.samples++;
      row.puddled += p > 0.01 ? 1 : 0;
      row.coverage += c;
      const dark = (1 - 0.67 * porosity * p) * (1 - 0.33 * p * (1 - porosity));
      row.darkening += dark;
      for (let channel = 0; channel < 3; channel++) {
        if (
          !Number.isFinite(wet[i + channel]) ||
          !Number.isFinite(optics[i + channel]) ||
          !Number.isFinite(normal[i + channel])
        )
          invalid++;
        maxAlbedoError = Math.max(
          maxAlbedoError,
          Math.abs(wet[i + channel] - dry[i + channel] * dark),
        );
      }
      const expected = [
        p >= 0.000001 ? 0.002 : dryOptics[i],
        Math.max(dryOptics[i + 1], dryOptics[i + 1] * (1 - c) + 0.02 * c),
        Math.max(dryOptics[i + 2], c),
      ];
      for (let channel = 0; channel < 3; channel++)
        maxOpticsError = Math.max(
          maxOpticsError,
          Math.abs(optics[i + channel] - expected[channel]),
        );
      maxCoverageError = Math.max(
        maxCoverageError,
        Math.abs(c - p * (1 - porosity)),
      );
      const encoded = oct([normal[i], normal[i + 1], normal[i + 2]]);
      for (let channel = 0; channel < 2; channel++)
        maxNormalError = Math.max(
          maxNormalError,
          Math.abs(geometries[i + channel] / 255 - encoded[channel]),
        );
      for (let channel = 0; channel < 3; channel++)
        maxAlbedoError = Math.max(
          maxAlbedoError,
          Math.abs(albedos[i + channel] / 255 - encode(wet[i + channel])),
        );
      maxCoverageError = Math.max(
        maxCoverageError,
        Math.abs(masks[i + 2] / 255 - c),
      );
      gbufferSamples++;
    }
    for (const row of Object.values(groups))
      for (const name of ['coverage', 'darkening']) row[name] /= row.samples;
    return {
      groups,
      invalid,
      maxAlbedoError,
      maxOpticsError,
      maxCoverageError,
      maxNormalError,
      gbufferSamples,
      attachments: protection.textures.length,
      gl: r.getContext().getError(),
    };
  } finally {
    for (const object of objects) object.material = original;
    for (const [object, visible] of hidden) object.visible = visible;
    r.shadowMap.autoUpdate = shadowAuto;
    r.shadowMap.needsUpdate = shadowUpdate;
    g.weatherUniforms.terrainWetness.value = wetness;
    r.setRenderTarget(previous);
    target.dispose();
    copy.dispose();
  }
}
