import {
  DataUtils,
  HalfFloatType,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Offscreen diagnostic clones retain the production material callbacks, vertex
// attributes, alpha test, lights and shadows. Only their final output changes.
// The original scene/materials and render state are restored before returning.
export function readForestLighting(g) {
  const r = g.renderer,
    frame = g.composer.passes[0],
    width = frame.target.width,
    height = frame.target.height,
    length = width * height * 4,
    read = (target) => {
      const data = new Uint16Array(length);
      r.readRenderTargetPixels(target, 0, 0, width, height, data);
      return data;
    },
    sceneColor = read(frame.target),
    output = g.composer.passes.at(-1).uniforms.tDiffuse.value,
    outputTarget = [g.composer.renderTarget1, g.composer.renderTarget2].find(
      (t) => t.texture === output,
    );
  if (!outputTarget) throw Error('Missing real output input target');
  const finalColor = read(outputTarget),
    camera = g.camera.clone(),
    history = frame.clouds.histories.get(frame.target);
  // Match the actual last scene projection, including its subpixel jitter.
  camera.projectionMatrix
    .copy(history.viewProjection)
    .multiply(camera.matrixWorld);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const target = new WebGLRenderTarget(width, height, { type: HalfFloatType }),
    previous = r.getRenderTarget(),
    autoClear = r.autoClear,
    shadowAuto = r.shadowMap.autoUpdate,
    shadowUpdate = r.shadowMap.needsUpdate,
    clones = new Map(),
    originals = new Map(),
    mode = { value: 0 },
    buffers = [];
  const clone = (material) => {
    if (
      !material?.isMeshLambertMaterial ||
      material.userData.voxelLighting !== 'surface'
    )
      return material;
    if (clones.has(material)) return clones.get(material);
    const result = material.clone(),
      compile = material.onBeforeCompile;
    result.defaultAttributeValues = { ...material.defaultAttributeValues };
    result.toneMapped = false;
    result.premultipliedAlpha = false;
    result.onBeforeCompile = (shader, renderer) => {
      compile.call(result, shader, renderer);
      Object.assign(shader.uniforms, {
        forestMode: mode,
        forestLeaf: { value: material === g.leafMaterials.material ? 1 : 0 },
      });
      shader.fragmentShader =
        `uniform int forestMode; uniform float forestLeaf;\n` +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
        if(forestMode==0) outgoingLight=diffuseColor.rgb;
        else if(forestMode==1) outgoingLight=vec3(vSkylight);
        else if(forestMode==2) outgoingLight=reflectedLight.directDiffuse;
        else if(forestMode==3) outgoingLight=reflectedLight.indirectDiffuse;
        else if(forestMode==5) {
          #ifdef USE_COLOR
            outgoingLight=vColor.rgb;
          #else
            outgoingLight=vec3(1.0);
          #endif
        }
        else if(forestMode==6) {
          #ifdef HEX_GEOMETRIC_SHADE
            outgoingLight=vec3(vAmbientOcclusion);
          #else
            outgoingLight=vec3(1.0);
          #endif
        }
        #include <opaque_fragment>
        gl_FragColor.a=forestLeaf>0.5?1.0+length(vLightPosition-cameraPosition):0.0;`,
        );
    };
    result.customProgramCacheKey = () =>
      material.customProgramCacheKey() + '-forest-light-diagnostic-v1';
    clones.set(material, result);
    return result;
  };
  try {
    g.scene.traverseVisible((object) => {
      if (!object.isMesh) return;
      originals.set(object, object.material);
      object.material = Array.isArray(object.material)
        ? object.material.map(clone)
        : clone(object.material);
    });
    r.autoClear = true;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    for (mode.value = 0; mode.value < 7; mode.value++) {
      r.setRenderTarget(target);
      r.render(g.scene, camera);
      buffers.push(read(target));
    }
  } finally {
    for (const [object, material] of originals) object.material = material;
    r.autoClear = autoClear;
    r.shadowMap.autoUpdate = shadowAuto;
    r.shadowMap.needsUpdate = shadowUpdate;
    r.setRenderTarget(previous);
    for (const material of clones.values()) material.dispose();
    target.dispose();
  }
  const half = DataUtils.fromHalfFloat,
    mask = new Uint8Array(width * height),
    selected = [],
    groups = { open: [], sheltered: [] };
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x,
        distance = half(buffers[0][index * 4 + 3]) - 1;
      if (distance < 0.8 || distance > 70) continue;
      let interior = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (half(buffers[0][((y + dy) * width + x + dx) * 4 + 3]) <= 1.8)
            interior = false;
      if (!interior) continue;
      mask[index] = 1;
      selected.push(index);
      const sky = half(buffers[1][index * 4]);
      if (sky > 0.9) groups.open.push(index);
      if (sky < 0.5) groups.sheltered.push(index);
    }
  const stats = (data, indices) => {
    const channel = [[], [], []],
      luminance = [];
    for (const i of indices) {
      const values = [0, 1, 2].map((c) => half(data[i * 4 + c]));
      values.forEach((v, c) => channel[c].push(v));
      luminance.push(
        values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722,
      );
    }
    const distribution = (values) => {
      values.sort((a, b) => a - b);
      const q = (p) => values[Math.floor((values.length - 1) * p)] ?? null;
      return { p10: q(0.1), median: q(0.5), p90: q(0.9) };
    };
    return {
      count: indices.length,
      finite: channel.flat().every(Number.isFinite),
      rgb: channel.map(distribution),
      luminance: distribution(luminance),
    };
  };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d'),
    pixels = ctx.createImageData(width, height),
    encode = (data, onlyMask = false) => {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const source = y * width + x,
            dest = ((height - 1 - y) * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const linear = onlyMask
              ? mask[source]
              : Math.max(0, half(data[source * 4 + c]));
            const srgb =
              linear <= 0.0031308
                ? linear * 12.92
                : 1.055 * linear ** (1 / 2.4) - 0.055;
            pixels.data[dest + c] = Math.min(255, Math.round(srgb * 255));
          }
          pixels.data[dest + 3] = 255;
        }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    };
  const names = [
      'albedo',
      'skylight',
      'direct',
      'indirect',
      'surface-total',
      'vertex-color',
      'geometric-ao',
    ],
    maps = buffers.map((data, i) => ({
      name: names[i],
      png: encode(data),
      stats: stats(data, selected),
      open: stats(data, groups.open),
      sheltered: stats(data, groups.sheltered),
    }));
  maps.push({
    name: 'scene-prefix',
    png: encode(sceneColor),
    stats: stats(sceneColor, selected),
  });
  maps.push({
    name: 'post-hdr',
    png: encode(finalColor),
    stats: stats(finalColor, selected),
  });
  const fog = g.composer.passes.find(
      (p) => p.constructor.name === 'AtmospherePass',
    ).target,
    fogPixels = new Uint16Array(fog.width * fog.height * 4),
    rgbTransmission = new Uint16Array(fog.width * fog.height * 4),
    fullFog = new Uint16Array(length),
    fogT = new Uint16Array(length);
  r.readRenderTargetPixels(fog, 0, 0, fog.width, fog.height, fogPixels);
  const transmissionTarget = new WebGLRenderTarget(fog.width, fog.height, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    transmissionMaterial = new ShaderMaterial({
      uniforms: {
        columns: { value: fog.textures[1] },
        rayleigh: g.atmosphere.uniforms.airRayleigh,
        mie: g.atmosphere.uniforms.airMieExtinction,
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
      fragmentShader:
        'varying vec2 vUv;uniform sampler2D columns;uniform vec3 rayleigh;uniform float mie;void main(){vec2 c=texture2D(columns,vUv).rg;gl_FragColor=vec4(exp(-rayleigh*c.x-mie*c.y),1);}',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    transmissionQuad = new FullScreenQuad(transmissionMaterial);
  try {
    r.setRenderTarget(transmissionTarget);
    transmissionQuad.render(r);
    r.readRenderTargetPixels(
      transmissionTarget,
      0,
      0,
      fog.width,
      fog.height,
      rgbTransmission,
    );
  } finally {
    r.setRenderTarget(previous);
    transmissionTarget.dispose();
    transmissionMaterial.dispose();
    transmissionQuad.dispose();
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        j =
          (Math.floor((y * fog.height) / height) * fog.width +
            Math.floor((x * fog.width) / width)) *
          4;
      for (let c = 0; c < 4; c++) fullFog[i + c] = fogPixels[j + c];
      for (let c = 0; c < 3; c++) fogT[i + c] = rgbTransmission[j + c];
    }
  maps.push({
    name: 'fog-scattering-nearest',
    png: encode(fullFog),
    stats: stats(fullFog, selected),
  });
  maps.push({
    name: 'fog-transmission-nearest',
    png: encode(fogT),
    stats: stats(fogT, selected),
  });
  let prefixSquared = 0;
  for (const i of selected)
    for (let c = 0; c < 3; c++)
      prefixSquared +=
        (half(buffers[4][i * 4 + c]) - half(sceneColor[i * 4 + c])) ** 2;
  maps.push({ name: 'leaf-mask', png: encode(buffers[0], true) });
  const occlusionGeometry = {
    vertices: 0,
    bytes: 0,
    min: 1,
    max: 0,
    meshes: 0,
  };
  g.scene.traverseVisible((o) => {
    const a = o.geometry?.attributes.ambientOcclusion;
    if (!a) return;
    occlusionGeometry.meshes++;
    occlusionGeometry.vertices += a.count;
    occlusionGeometry.bytes += a.array.byteLength;
    for (const v of a.array) {
      occlusionGeometry.min = Math.min(occlusionGeometry.min, v);
      occlusionGeometry.max = Math.max(occlusionGeometry.max, v);
    }
  });
  return {
    occlusionGeometry,
    width,
    height,
    leafPixels: selected.length,
    prefixRMSError: Math.sqrt(prefixSquared / (selected.length * 3)),
    maps,
    light: {
      color: g.sun.color.toArray(),
      intensity: g.sun.intensity,
      direction: g.cloudSystem.uniforms.cloudLightDirection.value.toArray(),
    },
    air: {
      density: g.atmosphere.uniforms.airDensity.value,
      base: g.atmosphere.uniforms.airBaseHeight.value,
      falloff: g.atmosphere.uniforms.airFalloff.value,
      rayleigh: g.atmosphere.uniforms.airRayleigh.value.toArray(),
      mieExtinction: g.atmosphere.uniforms.airMieExtinction.value,
      skyMean: g.atmosphere.uniforms.airSkyMean.value.toArray(),
    },
    gl: r.getContext().getError(),
    restored:
      [...originals].every(
        ([object, material]) => object.material === material,
      ) && r.getRenderTarget() === previous,
    scope:
      'Offscreen production surface clones expose existing linear albedo/skylight/direct/indirect/output. Other scene objects remain original; volume clouds and later effects are not recomputed. Statistics use eroded leaf interiors at 0.8..70 local distance. PNGs apply sRGB and clip above 1; statistics retain linear HDR. Scene-prefix and post-hdr are original production targets read before diagnosis.',
  };
}
