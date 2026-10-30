import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { airTransportGLSL } from '../../src/air-transport.js';

// Exercise the production GLSL and actual composite with independent synthetic
// fields. The live volume's MRT is read separately, without replacing its march.
export function probeAirTransport(g, rays) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    raw = new Uint16Array(4),
    quad = new FullScreenQuad(),
    textures = [],
    u = {
      ...g.atmosphere.uniforms,
      airSkyMean: { value: new Vector3(0.1, 0.2, 0.3) },
      origin: { value: new Vector3() },
      direction: { value: new Vector3(1, 0, 0) },
      distance: { value: 1 },
      mode: { value: 0 },
      columns: { value: new Vector2(4, 3) },
      sun: { value: new Vector3() },
      sky: { value: 1 },
      block: { value: new Vector3() },
    },
    material = new ShaderMaterial({
      uniforms: u,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${airTransportGLSL}
        uniform vec3 origin,direction,sun,block; uniform float distance,sky;
        uniform vec2 columns; uniform int mode;
        void main(){
          if(mode==0)gl_FragColor=vec4(airColumns(origin,direction,distance),0,1);
          else if(mode==1)gl_FragColor=vec4(exp(-airOpticalDepth(columns)),1);
          else gl_FragColor=vec4(airScattering(columns,airDirectPhase(dot(direction,airSunDirection)),sky,block,sun),1);
        }`,
    }),
    pass = g.composer.passes.find(
      (p) => p.constructor.name === 'AtmospherePass',
    ),
    composite = new ShaderMaterial({
      uniforms: { ...pass.composite.uniforms },
      vertexShader: pass.composite.vertexShader,
      fragmentShader: pass.composite.fragmentShader,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    }),
    live = new ShaderMaterial({
      uniforms: {
        color: { value: pass.target.texture },
        columns: { value: pass.target.textures[1] },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
      fragmentShader:
        'varying vec2 vUv;uniform sampler2D color,columns;void main(){gl_FragColor=vec4(texture2D(columns,vUv).rg,texture2D(color,vUv).a,1);}',
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
  const read = () => {
    r.setRenderTarget(target);
    quad.render(r);
    r.readRenderTargetPixels(target, 0, 0, 1, 1, raw);
    return Array.from(raw, DataUtils.fromHalfFloat).slice(0, 3);
  };
  const texture = (data) => {
    const t = new DataTexture(
      new Float32Array(data),
      2,
      2,
      RGBAFormat,
      FloatType,
    );
    t.minFilter = t.magFilter = NearestFilter;
    t.needsUpdate = true;
    textures.push(t);
    return t;
  };
  try {
    r.autoClear = true;
    quad.material = material;
    const profiles = rays.map((ray) => {
      u.origin.value.set(0, ray.height, 0);
      u.direction.value.set(Math.sqrt(1 - ray.y * ray.y), ray.y, 0);
      u.distance.value = ray.length;
      return read().slice(0, 2);
    });
    u.mode.value = 1;
    const transmission = read();
    u.mode.value = 2;
    const ambient = read();
    u.airSkyMean.value.multiplyScalar(2);
    const doubled = read();
    u.airSkyMean.value.setScalar(0);
    const dark = read();
    u.sun.value.set(1, 0.8, 0.6);
    const direct = read();
    u.sun.value.multiplyScalar(2);
    const directDoubled = read();
    const columns = [
        [0, 0],
        [40, 2],
        [2, 35],
        [80, 80],
      ],
      scatter = [0.01, 0.02, 0.03],
      color = [0.4, 0.3, 0.2];
    Object.assign(composite.uniforms, {
      sceneColor: { value: texture(columns.flatMap(() => [...color, 1])) },
      sceneDepth: { value: texture(columns.flatMap(() => [0.5, 0.5, 0.5, 1])) },
      fogBuffer: { value: texture(columns.flatMap(() => [...scatter, 1])) },
      fogColumns: { value: texture(columns.flatMap((c) => [...c, 0, 1])) },
      fogResolution: { value: new Vector2(2, 2) },
      waterCamera: { value: 0 },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 200 },
    });
    quad.material = composite;
    const compositeRGB = read();
    target.setSize(16, 16);
    quad.material = live;
    r.setRenderTarget(target);
    quad.render(r);
    const liveRaw = new Uint16Array(16 * 16 * 4);
    r.readRenderTargetPixels(target, 0, 0, 16, 16, liveRaw);
    const liveSamples = [];
    for (let i = 0; i < liveRaw.length; i += 4)
      liveSamples.push(
        Array.from(liveRaw.subarray(i, i + 3), DataUtils.fromHalfFloat),
      );
    return {
      profiles,
      transmission,
      ambient,
      doubled,
      dark,
      direct,
      directDoubled,
      composite: { rgb: compositeRGB, columns, scatter, color },
      liveSamples,
      coefficients: {
        rayleigh: u.airRayleigh.value.toArray(),
        mie: u.airMieExtinction.value,
        mieScattering: u.airMieScattering.value,
        skyMean: g.atmosphere.uniforms.airSkyMean.value.toArray(),
        expectedSkyMean:
          g.skyEnvironment.atmosphere.fogSnapshot?.ambient.toArray() ||
          g.skyEnvironment.atmosphere.probe.sh.coefficients[0]
            .toArray()
            .map(
              (v) =>
                Math.max(0, v) *
                0.28209479177 *
                g.skyEnvironment.atmosphere.probe.intensity,
            ),
        base: [u.airRayleighBaseHeight.value, u.airBaseHeight.value],
        falloff: [u.airRayleighFalloff.value, u.airFalloff.value],
      },
      attachments: pass.target.textures.map((t) => ({
        format: t.format,
        type: t.type,
      })),
      size: [pass.target.width, pass.target.height],
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    quad.dispose();
    target.dispose();
    material.dispose();
    composite.dispose();
    live.dispose();
    for (const t of textures) t.dispose();
  }
}
