import * as THREE from 'three';
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js';

export const resourceLayout = {
  typeBytes: Object.fromEntries([
    [THREE.UnsignedByteType, 1],
    [THREE.ByteType, 1],
    [THREE.ShortType, 2],
    [THREE.UnsignedShortType, 2],
    [THREE.HalfFloatType, 2],
    [THREE.IntType, 4],
    [THREE.UnsignedIntType, 4],
    [THREE.FloatType, 4],
    [THREE.UnsignedInt248Type, 4],
  ]),
  channels: Object.fromEntries([
    [THREE.RedFormat, 1],
    [THREE.RedIntegerFormat, 1],
    [THREE.RGFormat, 2],
    [THREE.RGIntegerFormat, 2],
    [THREE.RGBAFormat, 4],
    [THREE.RGBAIntegerFormat, 4],
    [THREE.DepthFormat, 1],
    [THREE.DepthStencilFormat, 1],
  ]),
};

export function distribution(values) {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!a.length) return null;
  const percentile = (p) =>
    a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
  return {
    count: a.length,
    min: a[0],
    median: percentile(0.5),
    p90: percentile(0.9),
    p95: percentile(0.95),
    max: a.at(-1),
  };
}

// Called in the page after measurement. Enumerates real public render resources;
// this is a known-resource estimate, not browser process VRAM or driver residency.
export function readReferenceFrame(layout) {
  const g = window.__hexwild.graphics,
    state = window.__hexwild.state,
    gl = g.renderer.getContext(),
    debug = gl.getExtension('WEBGL_debug_renderer_info'),
    seen = new WeakSet(),
    textures = new Set(),
    targets = new Set(),
    geometries = new Set();
  function walk(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      seen.has(value) ||
      ArrayBuffer.isView(value) ||
      value instanceof Element
    )
      return;
    seen.add(value);
    if (value.isTexture) {
      textures.add(value);
      return;
    }
    if (value.isBufferGeometry) {
      geometries.add(value);
      return;
    }
    if (value.isWebGLRenderTarget) {
      targets.add(value);
      for (const texture of value.textures) textures.add(texture);
      if (value.depthTexture) textures.add(value.depthTexture);
      return;
    }
    if (value === g.renderer || value === g.world) return;
    if (value instanceof Map || value instanceof Set) {
      for (const v of value.values()) walk(v);
    } else
      for (const [key, v] of Object.entries(value))
        if (!key.startsWith('_')) walk(v);
  }
  walk(g);
  const targetTextures = new Set(
    [...targets].flatMap((t) =>
      [...t.textures, t.depthTexture].filter(Boolean),
    ),
  );
  const bytesPerPixel = (texture) => {
    const n = layout.typeBytes[texture.type],
      c = layout.channels[texture.format];
    if (!n || !c) return null;
    return n * c;
  };
  const renderTargets = [...targets].map((t) => {
    const color = t.textures.map(bytesPerPixel);
    const depth = t.depthBuffer
      ? t.depthTexture
        ? bytesPerPixel(t.depthTexture)
        : 4
      : 0;
    const known = color.every((n) => n !== null) && depth !== null;
    return {
      width: t.width,
      height: t.height,
      samples: t.samples,
      colorBytesPerPixel: color,
      depthBytesPerPixel: depth,
      estimatedBytes: known
        ? t.width *
          t.height *
          (color.reduce((a, b) => a + b, 0) * (1 + t.samples) +
            depth * Math.max(1, t.samples))
        : null,
    };
  });
  let standaloneTextureBytes = 0,
    unknownTextures = 0;
  for (const texture of textures) {
    if (targetTextures.has(texture)) continue;
    const images = Array.isArray(texture.image)
      ? texture.image
      : [texture.image];
    const bpp = bytesPerPixel(texture);
    if (!bpp || images.some((i) => !i?.width || !i?.height)) {
      unknownTextures++;
      continue;
    }
    standaloneTextureBytes +=
      images.reduce(
        (n, i) => n + i.width * i.height * (i.depth || 1) * bpp,
        0,
      ) * (texture.generateMipmaps ? 4 / 3 : 1);
  }
  const buffers = new Set();
  for (const geometry of geometries) {
    for (const attr of [
      ...Object.values(geometry.attributes),
      geometry.index,
    ].filter(Boolean))
      buffers.add(
        attr.isInterleavedBufferAttribute ? attr.data.array : attr.array,
      );
  }
  const direction = g.sun.position
    .clone()
    .sub(g.sun.target.position)
    .normalize();
  const matrix = g.camera.matrixWorld.elements;
  const sunNDC = g.sun.position.clone().project(g.camera);
  const errors = [];
  for (let i = 0, e; i < 16 && (e = gl.getError()) !== gl.NO_ERROR; i++)
    errors.push(e);
  return {
    seed: state.world.seed,
    dimension: state.dimension,
    time: state.time,
    position: state.position,
    camera: {
      fov: g.camera.fov,
      near: g.camera.near,
      far: g.camera.far,
      rotation: g.camera.rotation.toArray().slice(0, 3),
      direction: [-matrix[8], -matrix[9], -matrix[10]],
    },
    terrain: {
      loadedChunks: state.world.chunks.size,
      renderedChunks: g.chunks.size,
      fogNear: g.scene.fog.near,
      fogFar: g.scene.fog.far,
      relightPending: g.relightQueue.size,
      worldLightRevision: state.world.lightRevision,
      volumeLightRevision: g.voxelLight.revision,
    },
    skyLighting: {
      pending: !!g.skyEnvironment.atmosphere.pending,
      coefficients: g.skyEnvironment.atmosphere.probe.sh.toArray(),
      zenith: g.skyEnvironment.atmosphere.zenith.toArray(),
      horizon: g.skyEnvironment.atmosphere.horizon.toArray(),
      fogColor: g.scene.fog.color.toArray(),
      airDensity: g.atmosphere.uniforms.airDensity.value,
      cameraSky: g.atmosphere.uniforms.airCameraSky.value,
    },
    settings: {
      quality: g.quality,
      post: g.postOptions,
      toneMapping: g.renderer.toneMapping,
      exposure: g.renderer.toneMappingExposure,
      outputColorSpace: g.renderer.outputColorSpace,
    },
    canvas: {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      pixelRatio: g.renderer.getPixelRatio(),
    },
    sun: {
      direction: direction.toArray(),
      ndc: sunNDC.toArray(),
      inFrustum:
        Math.abs(sunNDC.x) <= 1 &&
        Math.abs(sunNDC.y) <= 1 &&
        sunNDC.z >= -1 &&
        sunNDC.z <= 1,
      elevationDegrees: (Math.asin(direction.y) * 180) / Math.PI,
      azimuthDegrees: (Math.atan2(direction.x, -direction.z) * 180) / Math.PI,
      intensity: g.sun.intensity,
      color: g.sun.color.toArray(),
    },
    activePasses: g.composer.passes
      .filter((p) => p.enabled)
      .map((p) => p.constructor.name),
    clouds: {
      geometricVisible: g.clouds.visible,
      volumeClass: g.composer.passes[0].clouds.constructor.name,
      historyCount: g.composer.passes[0].clouds.histories.size,
    },
    device: {
      renderer: gl.getParameter(gl.RENDERER),
      vendor: gl.getParameter(gl.VENDOR),
      unmaskedRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : null,
      unmaskedVendor: debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : null,
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      contextLost: gl.isContextLost(),
    },
    glErrors: errors,
    resources: {
      renderTargets,
      renderTargetBytes: renderTargets.reduce(
        (n, t) => n + (t.estimatedBytes || 0),
        0,
      ),
      standaloneTextureBytes: Math.ceil(standaloneTextureBytes),
      unknownTextures,
      geometryAttributeBytes: [...buffers].reduce(
        (n, b) => n + b.byteLength,
        0,
      ),
      rendererInfo: {
        memory: { ...g.renderer.info.memory },
        programs: g.renderer.info.programs.length,
      },
      limitation:
        'Known public resources; mip storage approximated. Excludes driver alignment, shader binaries, browser/compositor allocations and unexposed resources. Not process VRAM.',
    },
  };
}

// False color of the production history's nearest contributing cloud layer.
// Read only after timing; this does not isolate or replace the rendered layers.
export function readReferenceCloudLayers() {
  const g = window.__hexwild.graphics,
    scene = g.composer.passes[0],
    target = scene.clouds.histories.get(scene.target).history[0],
    color = new Uint16Array(target.width * target.height * 4),
    data = new Uint16Array(color.length);
  g.renderer.readRenderTargetPixels(
    target,
    0,
    0,
    target.width,
    target.height,
    color,
  );
  g.renderer.readRenderTargetPixels(
    target,
    0,
    0,
    target.width,
    target.height,
    data,
    undefined,
    1,
  );
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d'),
    pixels = ctx.createImageData(canvas.width, canvas.height),
    counts = [0, 0, 0],
    palette = [
      [255, 48, 48],
      [48, 255, 48],
      [48, 96, 255],
    ];
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const source = (y * canvas.width + x) * 4,
        destination = ((canvas.height - 1 - y) * canvas.width + x) * 4,
        layer = Math.round(THREE.DataUtils.fromHalfFloat(data[source + 3])),
        opacity = 1 - THREE.DataUtils.fromHalfFloat(color[source + 3]);
      const present = layer >= 0 && layer < 3 && opacity > 0.01;
      if (present) counts[layer]++;
      for (let c = 0; c < 3; c++)
        pixels.data[destination + c] = present
          ? palette[layer][c] * opacity
          : 12;
      pixels.data[destination + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  return {
    width: canvas.width,
    height: canvas.height,
    counts,
    bands: g.cloudSystem.uniforms.cloudLayers.value.map((v) => v.toArray()),
    legend: [
      'red: nearest cumulus',
      'green: nearest altocumulus',
      'blue: nearest cirrus',
    ],
    limitation:
      'Nearest contributing layer, not the dominant layer or isolated opacity. Dark pixels have less than 1 percent total cloud opacity.',
    png: canvas.toDataURL('image/png').split(',')[1],
  };
}

export async function readReferenceHDR() {
  const g = window.__hexwild.graphics,
    output = g.composer.passes.at(-1);
  const texture = output.uniforms.tDiffuse.value;
  const target = [g.composer.renderTarget1, g.composer.renderTarget2].find(
    (t) => t.texture === texture,
  );
  if (!target) throw Error('OutputPass input is not a composer render target');
  const data = new Uint16Array(target.width * target.height * 4);
  await g.renderer.readRenderTargetPixelsAsync(
    target,
    0,
    0,
    target.width,
    target.height,
    data,
  );
  const bytes = new Uint8Array(data.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return {
    width: target.width,
    height: target.height,
    type: target.texture.type,
    format: target.texture.format,
    colorSpace: texture.colorSpace,
    frame: window.__photonProbe.rendered,
    base64: btoa(binary),
  };
}

// Established file exporter; no lighting or color-transfer algorithm is copied.
// EXR keeps the actual half-float channels, including negative temporal ringing.
export async function encodeEXR(raw, width, height) {
  if (raw.byteLength !== width * height * 8)
    throw Error('RGBA16F size mismatch');
  const data = new Uint16Array(width * height * 4);
  let negativeChannels = 0,
    maxLinear = 0;
  for (let i = 0; i < data.length; i++) {
    const bits = raw.readUInt16LE(i * 2);
    if ((bits & 0x7c00) === 0x7c00) throw Error('Non-finite HDR channel');
    data[i] = bits;
    if (i % 4 !== 3) {
      const value = THREE.DataUtils.fromHalfFloat(bits);
      if (value < 0) negativeChannels++;
      maxLinear = Math.max(maxLinear, value);
    }
  }
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  const bytes = await new EXRExporter().parse(texture, {
    type: THREE.HalfFloatType,
    // Uncompressed scanlines also handle the 650/1080 heights' partial ZIP
    // blocks correctly in the bundled exporter/loader pair.
    compression: 0,
  });
  return { buffer: Buffer.from(bytes), negativeChannels, maxLinear };
}
