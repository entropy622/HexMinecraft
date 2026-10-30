import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  SkyAtmosphere,
  SUN_RADIUS,
  skyRadianceGLSL,
} from '../../src/sky-atmosphere.js';
import { applySkylight } from '../../src/skylight.js';
import {
  sampleSkyMap,
  sourceSkyProject,
  sourceSkyIrradiance,
} from './photon-skylight-oracle.js';

export function createSkySampler(graphics) {
  const renderer = graphics.renderer,
    target = new THREE.WebGLRenderTarget(2, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    }),
    material = new THREE.ShaderMaterial({
      uniforms: graphics.skyEnvironment.uniforms,
      vertexShader: 'void main(){ gl_Position=vec4(position.xy,0,1); }',
      fragmentShader: `${skyRadianceGLSL}\nvoid main(){gl_FragColor=vec4(gl_FragCoord.x<1.0 ? hexSkyRadiance(vec3(0,1,0)) : photonDirectLight(),1);}`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material),
    a = graphics.skyEnvironment.atmosphere,
    pixels = new Uint16Array(8);
  return {
    sample() {
      const started = performance.now(),
        previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        quad.render(renderer);
        renderer.readRenderTargetPixels(target, 0, 0, 2, 1, pixels);
        const gpuZenith = Array.from(
            pixels,
            THREE.DataUtils.fromHalfFloat,
          ).slice(0, 3),
          cpuZenith = a.zenith.toArray();
        const gpuDirect = Array.from(
            pixels.slice(4, 7),
            THREE.DataUtils.fromHalfFloat,
          ),
          cpuDirect = a.directLight.toArray();
        return {
          direction: a.uniforms.skySunDirection.value.toArray(),
          coefficients: a.probe.sh.toArray(),
          gpuZenith,
          cpuZenith,
          gpuDirect,
          cpuDirect,
          directError: Math.max(
            ...gpuDirect.map(
              (v, c) =>
                Math.abs(v - cpuDirect[c]) /
                Math.max(0.01, Math.abs(cpuDirect[c])),
            ),
          ),
          mismatch: Math.max(
            ...gpuZenith.map((v, i) => Math.abs(v - cpuZenith[i])),
          ),
          pending: !!a.pending,
          gl: renderer.getContext().getError(),
          probeMilliseconds: performance.now() - started,
          rendererFrame: renderer.info.render.frame,
        };
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    dispose() {
      target.dispose();
      material.dispose();
      quad.dispose();
    },
  };
}

// GPU pixels are the input boundary. Projection, LightProbe and surface
// response below are production objects; no CPU copy of their algorithms.
export async function skyContracts(graphics) {
  const renderer = graphics.renderer,
    previous = renderer.getRenderTarget(),
    atmosphere = new SkyAtmosphere(),
    output = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    }),
    pixels = new Uint16Array(4),
    fields = [],
    quad = new FullScreenQuad(),
    input = new THREE.ShaderMaterial({
      uniforms: {
        ...atmosphere.uniforms,
        base: { value: new THREE.Vector3() },
        slope: { value: new THREE.Vector3() },
        axis: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0,1); }',
      fragmentShader: `${skyRadianceGLSL}
        varying vec2 vUv; uniform vec3 base; uniform vec3 slope; uniform vec3 axis;
        void main(){ gl_FragColor = vec4(base + slope * dot(skyDirection(vUv), axis), 1); }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new THREE.PlaneGeometry(2, 2),
    surface = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
  for (const [name, size] of [
    ['skylight', 1],
    ['rainExposure', 1],
    ['surfacePorosity', 1],
    ['blocklight', 3],
  ])
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(new Float32Array(4 * size), size),
    );
  applySkylight(surface, {
    ...graphics.dynamicLight.uniforms,
    terrainWetness: { value: 0 },
  });
  camera.position.z = 2;
  scene.add(new THREE.Mesh(geometry, surface), atmosphere.probe);
  const normals = [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const read = () => {
    renderer.readRenderTargetPixels(output, 0, 0, 1, 1, pixels);
    return Array.from(pixels, THREE.DataUtils.fromHalfFloat).slice(0, 3);
  };
  let transportMaterial;
  try {
    const state = {
      direction: new THREE.Vector3(0, 1, 0),
      height: 40,
      rain: 0,
      moon: 1,
      quality: 1.7,
      active: true,
      time: 150,
      dt: 0,
    };
    atmosphere.update(renderer, state);
    const previousRead = atmosphere.pending;
    // The real GPU read is in flight; an explicit clock jump invalidates it.
    atmosphere.update(renderer, {
      ...state,
      direction: new THREE.Vector3(1, 0, 0),
      time: 300,
    });
    await previousRead;
    const staleReadMaximum = Math.max(
      ...atmosphere.probe.sh.toArray().map(Math.abs),
    );
    atmosphere.dispose();
    atmosphere.allocate(renderer, 1.7);
    // Isolate SH quadrature from the newly ported early-night source boost.
    atmosphere.work.skySunDirection.value.set(0, 1, 0);
    for (const spec of [
      { name: 'zero', base: [0, 0, 0], slope: [0, 0, 0], axis: [1, 0, 0] },
      {
        name: 'constant',
        base: [0.18, 0.5, 1],
        slope: [0, 0, 0],
        axis: [1, 0, 0],
      },
      { name: 'hdr', base: [16, 4, 2], slope: [0, 0, 0], axis: [1, 0, 0] },
      {
        name: 'x',
        base: [0.3, 0.4, 0.5],
        slope: [0.15, 0.2, 0.25],
        axis: [1, 0, 0],
      },
      {
        name: 'z',
        base: [0.3, 0.4, 0.5],
        slope: [0.15, 0.2, 0.25],
        axis: [0, 0, 1],
      },
    ]) {
      input.uniforms.base.value.fromArray(spec.base);
      input.uniforms.slope.value.fromArray(spec.slope);
      input.uniforms.axis.value.fromArray(spec.axis);
      quad.material = input;
      renderer.setRenderTarget(atmosphere.targets[1]);
      quad.render(renderer);
      renderer.setRenderTarget(previous);
      const map = atmosphere.targets[1],
        rawMap = new Uint16Array(map.width * map.height * 4);
      renderer.readRenderTargetPixels(map, 0, 0, map.width, map.height, rawMap);
      const mapValues = Array.from(rawMap, THREE.DataUtils.fromHalfFloat);
      const source = sourceSkyProject((d) =>
        sampleSkyMap(mapValues, map.width, map.height, d),
      );
      await atmosphere.project(renderer);
      const samples = [];
      let maxError = 0,
        invalid = 0;
      for (const gate of [0, 1])
        for (const normal of normals) {
          const attr = geometry.attributes;
          for (let i = 0; i < 4; i++) {
            attr.normal.setXYZ(i, ...normal);
            attr.skylight.setX(i, gate);
          }
          attr.normal.needsUpdate = attr.skylight.needsUpdate = true;
          renderer.setRenderTarget(output);
          renderer.render(scene, camera);
          const rgb = read(),
            expected = sourceSkyIrradiance(source, normal).map(
              (v) => (0.025 + gate * Math.max(0, v)) / Math.PI,
            );
          rgb.forEach((v, c) => {
            if (!Number.isFinite(v) || v < 0) invalid++;
            maxError = Math.max(
              maxError,
              Math.abs(v - expected[c]) / Math.max(1, expected[c]),
            );
          });
          samples.push({ gate, normal, rgb, expected });
        }
      fields.push({
        name: spec.name,
        maxError,
        invalid,
        samples,
        coefficients: atmosphere.probe.sh.toArray(),
      });
    }
    transportMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...graphics.skyEnvironment.uniforms,
        skyAerosol: {
          value: graphics.skyEnvironment.uniforms.skyAerosol.value,
        },
        skyObserverHeight: {
          value: graphics.skyEnvironment.uniforms.skyObserverHeight.value,
        },
        probeDirection: { value: new THREE.Vector3() },
        probeDistance: { value: 0 },
        probeMode: { value: 0 },
      },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy,0,1); }',
      fragmentShader: `${skyRadianceGLSL}
        uniform vec3 probeDirection; uniform float probeDistance; uniform float probeMode;
        void main(){
          vec3 color = probeMode > 1.5 ? skyLightTransmittance(vec3(0, SKY_RADIUS + skyObserverHeight, 0), probeDirection, ${SUN_RADIUS}) :
            (probeMode > 0.5 ? hexSkyRadiance(probeDirection) : hexAirTransmittance(probeDistance, probeDirection));
          gl_FragColor = vec4(color,1);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    quad.material = transportMaterial;
    const transport = {
      invalid: 0,
      minimum: Infinity,
      maximum: -Infinity,
      monotonicError: 0,
      samples: [],
    };
    for (const direction of [
      [0, 1, 0],
      [1, 0, 0],
      [1, -0.05, 0],
    ]) {
      transportMaterial.uniforms.probeDirection.value
        .fromArray(direction)
        .normalize();
      let last = [1, 1, 1];
      for (const distance of [0, 10, 100, 1000, 10000]) {
        transportMaterial.uniforms.probeDistance.value = distance;
        renderer.setRenderTarget(output);
        quad.render(renderer);
        const rgb = read();
        for (let c = 0; c < 3; c++) {
          if (!Number.isFinite(rgb[c])) transport.invalid++;
          transport.minimum = Math.min(transport.minimum, rgb[c]);
          transport.maximum = Math.max(transport.maximum, rgb[c]);
          transport.monotonicError = Math.max(
            transport.monotonicError,
            rgb[c] - last[c],
          );
        }
        transport.samples.push({ direction, distance, rgb });
        last = rgb;
      }
    }
    const sunlight = [];
    transportMaterial.uniforms.probeMode.value = 2;
    for (const height of [0.02, 1, 5])
      for (const aerosol of [1, 6])
        for (const elevation of [0.5, 0.05, -0.2]) {
          const u = transportMaterial.uniforms;
          u.skyObserverHeight.value = height;
          u.skyAerosol.value = aerosol;
          u.probeDirection.value.set(1, elevation, 0).normalize();
          renderer.setRenderTarget(output);
          quad.render(renderer);
          sunlight.push({ height, aerosol, elevation, rgb: read() });
        }
    transportMaterial.uniforms.probeMode.value = 1;
    const seam = [];
    for (const z of [-0.00001, 0.00001]) {
      transportMaterial.uniforms.probeDirection.value
        .set(-1, 0.04, z)
        .normalize();
      renderer.setRenderTarget(output);
      quad.render(renderer);
      seam.push(read());
    }
    return {
      fields,
      transport,
      sunlight,
      shaderPrograms: window.__skyShaderDiagnostics,
      staleReadMaximum,
      seamError: Math.max(...seam[0].map((v, i) => Math.abs(v - seam[1][i]))),
      gl: renderer.getContext().getError(),
    };
  } finally {
    renderer.setRenderTarget(previous);
    atmosphere.dispose();
    output.dispose();
    input.dispose();
    surface.dispose();
    geometry.dispose();
    transportMaterial?.dispose();
    quad.dispose();
  }
}
