import {
  DataTexture,
  DataUtils,
  FloatType,
  GLSL3,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from '../../src/cloud-field.js';
import { probeCloudField } from './cloud-field-probe.js';

// Hold every published climate/optical input fixed while moving only the map
// centre. Ordinary gameplay also changes the camera's local biome humidity,
// which must not be misdiagnosed as shadow-map reprojection error.
export function comparePreparedShadowCamera(graphics, points, delta) {
  const coverage = graphics.composer.passes[0].clouds.coverage,
    camera = graphics.camera.clone();
  try {
    coverage.prepare(graphics.renderer, camera);
    const before = probeCloudField(graphics, points);
    camera.position.add(new Vector3(...delta));
    coverage.prepare(graphics.renderer, camera);
    const after = probeCloudField(graphics, points);
    const errors = before.density
      .filter((_, i) => i % 4 === 3)
      .map((v, i) => Math.abs(v - after.density[i * 4 + 3]));
    return { before, after, errors };
  } finally {
    coverage.prepare(graphics.renderer, graphics.camera);
  }
}

// Independent double-precision projection/sphere geometry. The probe asks the
// production density field for the CPU intersections, then composes Photon's
// preparation coefficients on the CPU. This is not a second cloud-density oracle.
export function readPreparedCloudShadows(graphics) {
  const u = graphics.cloudSystem.uniforms,
    renderer = graphics.renderer;
  const atlas = graphics.composer.passes[0].clouds.coverage.target;
  if (!atlas || u.cloudShadowReady.value !== 1)
    throw Error('Prepared shadows not published');
  const packed = new Uint16Array(256 * 512 * 4);
  renderer.readRenderTargetPixels(atlas, 768, 0, 256, 512, packed);
  const texel = (x, y, c) =>
    DataUtils.fromHalfFloat(
      packed[
        (Math.max(0, Math.min(511, y)) * 256 +
          Math.floor(Math.max(0, Math.min(511, x)) / 2)) *
          4 +
          (Math.max(0, Math.min(511, x)) % 2) * 2 +
          c
      ],
    );
  const light = u.cloudLightDirection.value,
    inverse = u.cloudShadowInverse.value,
    layers = u.cloudLayers.value,
    optics = u.cloudOptics.value;
  const centre = u.cloudCurvatureOrigin.value,
    planet = 6371000 / 20;
  const rows = [],
    points = [];
  const sphere = (origin, height) => {
    const offset = new Vector3(
      origin.x - centre.x,
      origin.y + planet,
      origin.z - centre.y,
    );
    const b = offset.dot(light),
      c =
        (origin.x - centre.x) ** 2 +
        (origin.z - centre.y) ** 2 +
        (origin.y - height) * (2 * planet + origin.y + height);
    const root = Math.sqrt(Math.max(0, b * b - c));
    return origin
      .clone()
      .addScaledVector(light, b >= 0 ? -c / (b + root) : -b + root);
  };
  for (let y = 15; y < 512; y += 32)
    for (let x = 15; x < 512; x += 32) {
      const a = ((x + 0.5) / 512) * 2 - 1,
        b = ((y + 0.5) / 512) * 2 - 1,
        r = Math.hypot(a, b);
      if (r >= 0.85) continue;
      const origin = new Vector3(
        (a * 128) / (1 - r),
        (b * 128) / (1 - r),
        1,
      ).applyMatrix4(inverse);
      const hits = [
        sphere(origin, layers[0].x + 0.25 * layers[0].y),
        sphere(origin, layers[1].x + 0.5 * layers[1].y),
        sphere(origin, layers[2].x),
      ];
      const i = rows.length,
        height = [
          10,
          layers[0].x,
          layers[0].x + 0.5 * layers[0].y,
          layers[0].x + layers[0].y + 10,
        ][i % 4];
      const ground = origin
        .clone()
        .addScaledVector(light, (height - origin.y) / light.y);
      rows.push({ x, y, hits, ground });
      points.push(...hits, ground);
    }
  const coordinates = new Float32Array(rows.length * 4 * 4);
  points.forEach((p, i) => coordinates.set([...p.toArray(), 1], i * 4));
  const texture = new DataTexture(
    coordinates,
    4,
    rows.length,
    RGBAFormat,
    FloatType,
  );
  texture.needsUpdate = true;
  const target = new WebGLRenderTarget(rows.length, 2, {
    type: FloatType,
    depthBuffer: false,
  });
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    defines: { HEX_CLOUD_PREPARE: 1 },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...u,
      cloudNoise: { value: graphics.cloudSystem.noise },
      cloudNoiseScale: { value: 255 / 126 },
      cloudCoverageReady: { value: 0 },
      probePoints: { value: texture },
    },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
    fragmentShader: `${cloudFieldGLSL}
      uniform sampler2D probePoints;out vec4 result;
      void main(){int i=int(gl_FragCoord.x);
        if(gl_FragCoord.y<1.0){vec3 p0=texelFetch(probePoints,ivec2(0,i),0).xyz,p1=texelFetch(probePoints,ivec2(1,i),0).xyz,p2=texelFetch(probePoints,ivec2(2,i),0).xyz;
          vec2 high=hexCloudHighDensity(p2.xz+cloudNoiseOffset,cloudLayerWind[2],cloudLayers[2].zw,0.5,cloudOptics[2].z);
          result=vec4(hexCloudLayerDensity(p0,0),hexCloudLayerDensity(p1,1),high.x+high.y,0);return;}
        vec3 p=texelFetch(probePoints,ivec2(3,i),0).xyz;
        result=vec4(hexCloudPreparedShadow(p),hexCloudShadow(p),hexCloudShadowWeight(p));
      }`,
  });
  // The consumer samples the published atlas; the density row uses the original
  // header to avoid comparing a cached macro field to its analytic preparation.
  const densityMaterial = material;
  const consumerMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { ...u, probePoints: { value: texture } },
    vertexShader: material.vertexShader,
    fragmentShader: material.fragmentShader,
  });
  const quad = new FullScreenQuad(material),
    old = renderer.getRenderTarget(),
    face = renderer.getActiveCubeFace(),
    mip = renderer.getActiveMipmapLevel(),
    clear = renderer.autoClear;
  const density = new Float32Array(rows.length * 2 * 4),
    consumer = new Float32Array(density.length);
  try {
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    quad.render(renderer);
    renderer.readRenderTargetPixels(target, 0, 0, rows.length, 2, density);
    quad.material = consumerMaterial;
    quad.render(renderer);
    renderer.readRenderTargetPixels(target, 0, 0, rows.length, 2, consumer);
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const pulse = 1 - smooth(0, 1, Math.abs(light.y + 0.01) / 0.2),
      rain = Math.max(0, Math.min(1, (1 - optics[1].y) * 4));
    const sigma = [
      0.25 * optics[0].x,
      (0.05 + 0.05 * optics[2].z) * 0.1 * (1 - 0.33 * rain),
      optics[2].x,
    ];
    const weights = (f) => {
      const n = [1, 2, 3, 4].map((v) => (v - f) ** 3),
        x = n[0],
        y = n[1] - 4 * n[0],
        z = n[2] - 4 * n[1] + 6 * n[0];
      return [x, y, z, 6 - x - y - z].map((v) => v / 6);
    };
    let mapError = 0,
      filterError = 0,
      shadowError = 0,
      minimum = 1,
      maximum = 0,
      upper = 0,
      invalid = 0,
      outsideErrors = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const t = texel(x, y, 0),
          cu = texel(x, y, 1);
        minimum = Math.min(minimum, t);
        maximum = Math.max(maximum, t);
        upper = Math.max(upper, cu - t);
        if (!Number.isFinite(t) || t < 0 || t > cu + 0.0005 || cu > 1)
          invalid++;
        if (
          Math.hypot((x + 0.5) / 256 - 1, (y + 0.5) / 256 - 1) >= 1 &&
          (t !== 1 || cu !== 1)
        )
          outsideErrors++;
      }
    rows.forEach(({ x, y, hits, ground }, i) => {
      const tau = hits.map(
        (p, j) =>
          ((Math.pow(
            2,
            -1e-8 *
              pulse *
              Math.hypot((p.x - centre.x) * 20, (p.y + planet) * 20),
          ) *
            sigma[j] *
            20 *
            layers[j].y) /
            (Math.abs(light.y) + 1e-6)) *
          density[i * 4 + j],
      );
      const cu = Math.exp(-tau[0]),
        total = cu * Math.exp(-tau[1]) * (0.5 + 0.5 * Math.exp(-tau[2]));
      mapError = Math.max(
        mapError,
        Math.abs(total - texel(x, y, 0)),
        Math.abs(cu - texel(x, y, 1)),
      );
      const projected = ground.clone().applyMatrix4(u.cloudShadowView.value),
        px = projected.x / 128,
        py = projected.y / 128,
        r = Math.hypot(px, py);
      const pixel = [
          (0.5 + (0.5 * px) / (1 + r)) * 512 - 0.5,
          (0.5 + (0.5 * py) / (1 + r)) * 512 - 0.5,
        ],
        base = pixel.map(Math.floor),
        w = pixel.map((v, j) => weights(v - base[j]));
      const expected = [0, 0];
      for (let yy = 0; yy < 4; yy++)
        for (let xx = 0; xx < 4; xx++)
          for (let c = 0; c < 2; c++)
            expected[c] +=
              texel(base[0] + xx - 1, base[1] + yy - 1, c) *
              w[0][xx] *
              w[1][yy];
      const out = consumer.subarray(
          (rows.length + i) * 4,
          (rows.length + i + 1) * 4,
        ),
        fade =
          0.8 *
          smooth(0.05, 0.15, light.y) *
          (1 -
            Math.max(0, Math.min(1, (ground.y - layers[0].x) / layers[0].y)));
      filterError = Math.max(
        filterError,
        Math.abs(out[0] - expected[0]),
        Math.abs(out[1] - expected[1]),
      );
      shadowError = Math.max(
        shadowError,
        Math.abs(out[2] - (1 - fade + fade * expected[0])),
        Math.abs(out[3] - fade),
      );
    });
    return {
      samples: rows.length,
      mapError,
      filterError,
      shadowError,
      minimum,
      maximum,
      upper,
      invalid,
      outsideErrors,
      gl: renderer.getContext().getError(),
      light: light.toArray(),
      ready: u.cloudShadowReady.value,
      target: [atlas.width, atlas.height],
    };
  } finally {
    renderer.setRenderTarget(old, face, mip);
    renderer.autoClear = clear;
    target.dispose();
    densityMaterial.dispose();
    consumerMaterial.dispose();
    texture.dispose();
    quad.dispose();
  }
}
