import {
  Color,
  DataUtils,
  HalfFloatType,
  LightProbe,
  LinearFilter,
  RepeatWrapping,
  ShaderMaterial,
  UniformsUtils,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createPhotonScattering, photonSkyGLSL } from './photon-sky.js';
import { photonSkylightGLSL } from './photon-skylight.js';
import { SkyClouds } from './sky-clouds.js';
import { FogBiomes, photonFogParameters } from './photon-fog.js';
import { createCloudOptics, setCloudOptics } from './cloud-optics.js';

import { SUN_RADIUS, transportGLSL, skyRadianceGLSL } from './sky-transport.js';
export {
  SUN_RADIUS,
  MOON_RADIUS,
  RAYLEIGH_PER_KM,
  skyRadianceGLSL,
} from './sky-transport.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function material(name, uniforms, fragmentShader) {
  return new ShaderMaterial({
    name,
    uniforms,
    vertexShader,
    fragmentShader: `varying vec2 vUv;\n${fragmentShader}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export class SkyAtmosphere {
  constructor() {
    this.probe = new LightProbe();
    this.clearIrradiance = { up: new Color(0), down: new Color(0) };
    this.zenith = new Color(0);
    this.horizon = new Color(0);
    this.sunTransmission = new Color(0);
    this.moonTransmission = new Color(0);
    this.directLight = new Color(0);
    this.sunDiskColor = new Color(0);
    this.moonDiskColor = new Color(0);
    this.sourceExposures = new Vector3(0, 0, 1);
    this.targets = [];
    this.generation = 0;
    this.pending = null;
    this.fogBiomes = new FogBiomes();
    this.fogSnapshot = null;
    this.fogAmbient = new Color(0);
    this.weatherColors = { rain: new Color(0), snow: new Color(0) };
    this.uniforms = {
      skyRadianceMap: { value: null },
      skyEnvironmentMap: { value: null },
      skyObserverHeight: { value: 0.2 },
      skyAerosol: { value: 1 },
      skySunDirection: { value: new Vector3(0, 1, 0) },
      skyMoonIllumination: { value: 1 },
      skyMoonPhase: { value: 0 },
      skySnowFraction: { value: 0 },
      cloudOptics: { value: createCloudOptics() },
      skyMultipleScatteringMap: { value: null },
    };
    this.work = UniformsUtils.clone(this.uniforms);
    this.scatter = material(
      'SkySphericalScattering',
      this.work,
      /* glsl */ `
      ${transportGLSL}
      ${photonSkyGLSL}
      void main() {
        gl_FragColor = vec4(photonSkyRadiance(skyDirection(vUv)),1.0);
      }
    `,
    );
    this.reduction = material(
      'SkySHProjection',
      this.work,
      /* glsl */ `
      ${skyRadianceGLSL}
      ${photonSkylightGLSL}
      uniform sampler2D skyEnvironmentMap;
      uniform float skySnowFraction;
      void main() {
        int index = int(gl_FragCoord.x);
        vec3 result = vec3(0.0), origin = vec3(0.0, SKY_RADIUS + skyObserverHeight, 0.0);
        if (index < 9) {
          result=photonSkyProject(index,skyEnvironmentMap);
        } else if (index == 9) result = hexSkyRadiance(vec3(0,1,0));
        else if (index == 10) {
          // These directions already have known azimuths. Avoid a cos/sin ->
          // atan2 round trip at cardinal points, where ANGLE's approximation
          // warns about tiny constant terms added to its polynomial.
          float elevation = atan(0.04);
          float v = 0.5 + 0.5 * sqrt(elevation / (0.5 * SKY_PI));
          for (int i = 0; i < 32; i++) {
            vec2 uv = vec2(fract(0.5 + float(i) / 32.0), v);
            result += textureLod(skyRadianceMap, uv, 0.0).rgb / 32.0;
          }
        } else if(index<=12) result = skyLightTransmittance(origin,index==11 ? skySunDirection : -skySunDirection,${SUN_RADIUS});
        else if(index==13)result=photonDirectLight();
        else if(index==14)result=photonTo709(photonSunColor()*skyDiskTransmittance2020(origin,skySunDirection,${SUN_RADIUS}))*(1.0-clamp((skyAerosol-1.0)/5.0,0.0,1.0));
        else if(index==15)result=10.0*photonTo709(photonMoonTint()*skyDiskTransmittance2020(origin,-skySunDirection,3.0*SKY_PI/180.0))*(1.0-clamp((skyAerosol-1.0)/5.0,0.0,1.0));
        else if(index==16)result=vec3(photonSunExposure(),photonMoonExposure(),photonSkylightBoost());
        else if(index<=18) {
          result=0.886227*photonSkyProject(0,skyRadianceMap)
            +(index==17?1.023328:-1.023328)*photonSkyProject(1,skyRadianceMap)
            -0.247708*photonSkyProject(6,skyRadianceMap)-0.429043*photonSkyProject(8,skyRadianceMap);
          // The source applies artistic skylight boost after sky composition.
          // Cloud incident light is raw irradiance, so it must not be boosted twice.
          result/=photonSkylightBoost();
        } else if(index==19){
          vec3 clear=1.13*max(vec3(0),textureLod(skyRadianceMap,skyUv(normalize(vec3(0,1,-0.8))),0.0).rgb);
          result=mix(clear,photonWeatherColor(skySunDirection.y,skySnowFraction,false),clamp((skyAerosol-1.0)/5.0,0.0,1.0));
        } else result=photonWeatherColor(skySunDirection.y,index==20?0.0:1.0,true);
        gl_FragColor = vec4(result, 1.0);
      }
    `,
    );
    this.quad = new FullScreenQuad(this.scatter);
  }

  attachClouds(uniforms) {
    this.cloudSky = new SkyClouds(uniforms);
  }

  allocate(renderer, quality) {
    const width = quality < 1 ? 96 : 192,
      volume = quality >= 1.7;
    if (this.targets[0]?.width === width) {
      if (this.captureQuality !== volume) {
        this.captureQuality = volume;
        this.generation++;
        this.key = null;
        this.updated = null;
      }
      return;
    }
    this.dispose();
    this.captureQuality = quality >= 1.7;
    this.multipleScattering = createPhotonScattering();
    this.uniforms.skyMultipleScatteringMap.value = this.multipleScattering;
    this.work.skyMultipleScatteringMap.value = this.multipleScattering;
    this.targets = [
      new WebGLRenderTarget(width, width / 2),
      new WebGLRenderTarget(width, width / 2),
      new WebGLRenderTarget(22, 1),
    ];
    for (const target of this.targets) {
      target.depthBuffer = false;
      target.texture.type = HalfFloatType;
      target.texture.minFilter = target.texture.magFilter = LinearFilter;
      target.texture.generateMipmaps = false;
    }
    this.targets[0].texture.wrapS = this.targets[1].texture.wrapS =
      RepeatWrapping;
    this.uniforms.skyRadianceMap.value = this.targets[0].texture;
    this.work.skyRadianceMap.value = this.targets[1].texture;
    this.uniforms.skyEnvironmentMap.value = this.targets[0].texture;
    this.work.skyEnvironmentMap.value = this.targets[1].texture;
    const previous = renderer.getRenderTarget(),
      clear = renderer.getClearColor(new Color()),
      alpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(this.targets[0]);
      renderer.setClearColor(0, 1);
      renderer.clear();
    } finally {
      renderer.setClearColor(clear, alpha);
      renderer.setRenderTarget(previous);
    }
  }

  async project(
    renderer,
    environmentMap = this.work.skyRadianceMap.value,
    fog = null,
  ) {
    this.work.skyEnvironmentMap.value = environmentMap;
    const generation = this.generation,
      previous = renderer.getRenderTarget(),
      target = this.targets[2],
      data = new Uint16Array(target.width * 4);
    this.quad.material = this.reduction;
    try {
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
    await renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      target.width,
      1,
      data,
    );
    if (generation !== this.generation) return;
    const values = Array.from(data, DataUtils.fromHalfFloat);
    // Publish a complete snapshot. The displayed map and CPU lighting never
    // expose a newer, in-flight atmosphere while its SH still belongs to an old map.
    [this.targets[0], this.targets[1]] = [this.targets[1], this.targets[0]];
    this.uniforms.skyRadianceMap.value = this.targets[0].texture;
    this.work.skyRadianceMap.value = this.targets[1].texture;
    this.cloudSky?.publish(environmentMap);
    this.uniforms.skyEnvironmentMap.value = environmentMap;
    this.uniforms.skySunDirection.value.copy(this.work.skySunDirection.value);
    for (const name of [
      'skyObserverHeight',
      'skyAerosol',
      'skyMoonIllumination',
      'skyMoonPhase',
      'skySnowFraction',
    ])
      this.uniforms[name].value = this.work[name].value;
    this.uniforms.cloudOptics.value.forEach((v, i) =>
      v.copy(this.work.cloudOptics.value[i]),
    );
    this.probe.sh.fromArray(
      values.flatMap((v, i) => (i < 36 && i % 4 < 3 ? [v] : [])),
    );
    this.zenith.fromArray(values, 36);
    this.horizon.fromArray(values, 40);
    this.sunTransmission.fromArray(values, 44);
    this.moonTransmission.fromArray(values, 48);
    this.directLight.fromArray(values, 52);
    this.sunDiskColor.fromArray(values, 56);
    this.moonDiskColor.fromArray(values, 60);
    this.sourceExposures.fromArray(values, 64);
    this.clearIrradiance.up.fromArray(values, 68);
    this.clearIrradiance.down.fromArray(values, 72);
    this.fogSnapshot = fog
      ? { ...fog, ambient: new Color().fromArray(values, 76) }
      : null;
    this.fogAmbient.fromArray(values, 76);
    this.weatherColors.rain.fromArray(values, 80);
    this.weatherColors.snow.fromArray(values, 84);
    if (!this.captureQuality && !fog) this.cloudSky?.release();
  }

  update(
    renderer,
    {
      direction,
      height,
      rain,
      moon,
      phase = 0,
      quality,
      active,
      time,
      dt,
      position = new Vector3(0, height, 0),
      fog = this.fogInput || null,
    },
  ) {
    this.probe.intensity = active ? 1 : 0;
    if (!active) {
      if (this.targets.length) this.dispose();
      return;
    }
    this.allocate(renderer, quality);
    // A save/world switch invalidates its pending fog with the sky epoch.
    if (this.fogInput?.world !== fog?.world) {
      this.generation++;
      this.key = this.updated = null;
    }
    this.fogInput = fog;
    const biomes = fog
      ? this.fogBiomes.sample(fog.world, position)
      : [1, 0, 0, 0];
    const fogState = fog
      ? {
          parameters: photonFogParameters({
            sunDirection: direction,
            humidity: fog.climate.humidity,
            temperature: fog.climate.temperature,
            rain,
            biomes,
          }),
          distance: fog.distance,
          skylight: fog.skylight,
        }
      : null;
    const cloudMode = this.cloudSky?.mode || 'clear';
    if (this.cloudMode !== undefined && this.cloudMode !== cloudMode) {
      this.generation++;
      this.key = null;
      this.updated = null;
    }
    this.cloudMode = cloudMode;
    if (
      this.lastTime !== null &&
      (time < this.lastTime - 1e-5 || time - this.lastTime > dt + 1e-5)
    ) {
      // Ordinary advancing time is coalesced, not cancelled. An explicit clock
      // discontinuity (save/load, jump or reset) invalidates the in-flight epoch.
      this.generation++;
      this.key = null;
      this.updated = null;
    }
    this.lastTime = time;
    const observerHeight = Math.max(0.02, Math.min(90, height * 0.02)),
      key = [
        ...direction.toArray().map((v) => Math.round(v * 500)),
        Math.round(observerHeight * 100),
        Math.round(rain * 100),
        moon,
        phase,
        biomes[2].toFixed(3),
        this.cloudSky?.key(position) || 'clear',
        fogState
          ? [
              position.y.toFixed(2),
              fogState.distance.toFixed(2),
              fogState.skylight.toFixed(3),
              ...fogState.parameters.rayleigh.map((v) => v.toFixed(8)),
              fogState.parameters.mieExtinction.toFixed(7),
            ].join(',')
          : 'no-fog',
      ].join(':');
    if (this.pending || this.key === key) return;
    const now = performance.now();
    if (this.updated !== null && now - this.updated < 250) return;
    this.key = key;
    this.updated = now;
    this.work.skySunDirection.value.copy(direction);
    this.work.skyObserverHeight.value = observerHeight;
    this.work.skyAerosol.value = 1 + rain * 5;
    this.work.skyMoonIllumination.value = moon;
    this.work.skyMoonPhase.value = phase;
    this.work.skySnowFraction.value = biomes[2];
    if (this.cloudSky)
      setCloudOptics(
        this.work.cloudOptics.value,
        direction,
        rain,
        this.cloudSky.uniforms.cloudLayers.value,
        this.cloudSky.uniforms.cloudCoverageRange.value,
      );
    const previous = renderer.getRenderTarget(),
      generation = this.generation;
    this.quad.material = this.scatter;
    try {
      renderer.setRenderTarget(this.targets[1]);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
    this.work.skyEnvironmentMap.value = this.work.skyRadianceMap.value;
    let environmentMap = this.work.skyRadianceMap.value;
    if ((cloudMode !== 'clear' && this.captureQuality) || fogState) {
      this.quad.material = this.reduction;
      try {
        renderer.setRenderTarget(this.targets[2]);
        this.quad.render(renderer);
      } finally {
        renderer.setRenderTarget(previous);
      }
      environmentMap =
        this.cloudSky.render(
          renderer,
          this.work,
          this.targets[2].texture,
          position,
          fogState,
        ) || environmentMap;
    }
    this.work.skyEnvironmentMap.value = environmentMap;
    const pending = this.project(renderer, environmentMap, fogState)
      .catch((error) => {
        if (
          generation === this.generation &&
          !renderer.getContext().isContextLost()
        )
          console.error('Sky lighting readback failed', error);
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null;
      });
    this.pending = pending;
  }

  dispose() {
    this.generation++;
    for (const target of this.targets) target.dispose();
    this.cloudSky?.dispose();
    this.targets = [];
    this.multipleScattering?.dispose();
    this.multipleScattering = null;
    this.uniforms.skyMultipleScatteringMap.value = null;
    this.work.skyMultipleScatteringMap.value = null;
    this.uniforms.skyRadianceMap.value = null;
    this.work.skyRadianceMap.value = null;
    this.uniforms.skyEnvironmentMap.value = null;
    this.work.skyEnvironmentMap.value = null;
    this.pending = null;
    this.fogSnapshot = null;
    this.fogAmbient.setRGB(0, 0, 0);
    this.weatherColors.rain.setRGB(0, 0, 0);
    this.weatherColors.snow.setRGB(0, 0, 0);
    const defaults = createCloudOptics();
    for (const u of [this.uniforms, this.work])
      u.cloudOptics.value.forEach((v, i) => v.copy(defaults[i]));
    this.fogInput = null;
    this.key = null;
    this.lastTime = null;
    this.updated = null;
    this.cloudMode = undefined;
    this.captureQuality = null;
    this.clearIrradiance.up.setRGB(0, 0, 0);
    this.clearIrradiance.down.setRGB(0, 0, 0);
    this.probe.sh.zero();
    for (const color of [
      this.zenith,
      this.horizon,
      this.sunTransmission,
      this.moonTransmission,
      this.directLight,
      this.sunDiskColor,
      this.moonDiskColor,
    ])
      color.setRGB(0, 0, 0);
    this.sourceExposures.set(0, 0, 1);
    for (const shader of [this.scatter, this.reduction]) shader.dispose();
    this.quad.dispose();
  }
}
