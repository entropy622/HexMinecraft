import { Color, MathUtils, Vector3 } from 'three';
import { airTransportGLSL } from './air-transport.js';
import { FogBiomes, photonFogParameters } from './photon-fog.js';

// Shared RGB height profiles and illumination for the marched and analytic
// paths. The four direct orders remain an approximation, not a multiple-scattering LUT.
export class Atmosphere {
  constructor(camera) {
    this.biomes = new FogBiomes();
    this.camera = camera;
    this.targetRayleigh = new Vector3();
    this.dimension = null;
    this.uniforms = {
      airCameraWorld: { value: camera.matrixWorld },
      airCameraPosition: { value: camera.position },
      airDensity: { value: 0.009 },
      airBaseHeight: { value: 8 },
      airFalloff: { value: 0.14 },
      airRayleighBaseHeight: { value: 8 },
      airRayleighFalloff: { value: (0.14 * 7) / 30 },
      airRayleigh: {
        value: new Vector3(),
      },
      airMieExtinction: { value: 0.009 },
      airMieScattering: { value: 0.0081 },
      airSkyMean: { value: new Color() },
      airHorizon: { value: new Color() },
      airSunColor: { value: new Color() },
      airSunDirection: { value: new Vector3() },
      airSunPower: { value: 0 },
      airAmbient: { value: 1 },
      airDirectMultiplier: { value: 1 },
      airScatterMultiplier: { value: 1 },
      airFogDistance: { value: 118 },
      airSkyFogActive: { value: 0 },
      airCameraSky: { value: 1 },
      airTime: { value: 0 },
      airVolume: { value: 0 },
      waterCamera: { value: 0 },
      airFlight: { value: 0 },
    };
  }

  update({
    time,
    dt,
    dimension,
    world,
    climate,
    sunDirection,
    rain,
    horizon,
    sun,
    skyProbe,
    fogSnapshot = null,
    cameraSky,
    medium,
    volume,
    flight = false,
  }) {
    const u = this.uniforms,
      overworld = dimension === 'overworld',
      submerged = !!medium;
    const fog = overworld
      ? fogSnapshot?.parameters ||
        photonFogParameters({
          sunDirection,
          humidity: climate.humidity,
          temperature: climate.temperature,
          rain,
          biomes: this.biomes.sample(world, this.camera.position),
        })
      : {
          rayleigh: [0, 0, 0],
          mieExtinction: dimension === 'nether' ? 0.018 : 0.004,
          mieScattering: dimension === 'nether' ? 0.018 : 0.004,
          direct: 1,
          glow: 1,
        };
    // The game publishes fog with the completed sky epoch. Standalone callers
    // retain render-time damping; dimensions never inherit each other's mist.
    const blend =
      fogSnapshot || this.world !== world || this.dimension !== dimension
        ? 1
        : 1 - Math.exp(-2 * Math.max(0, dt));
    this.world = world;
    this.dimension = dimension;
    u.airRayleigh.value.lerp(
      this.targetRayleigh.fromArray(fog.rayleigh),
      blend,
    );
    u.airMieExtinction.value = MathUtils.lerp(
      u.airMieExtinction.value,
      fog.mieExtinction,
      blend,
    );
    u.airMieScattering.value = MathUtils.lerp(
      u.airMieScattering.value,
      fog.mieScattering,
      blend,
    );
    u.airDensity.value = submerged
      ? 0
      : u.airRayleigh.value.y + u.airMieExtinction.value;
    u.airDirectMultiplier.value = fog.direct;
    u.airScatterMultiplier.value = fog.glow;
    u.airBaseHeight.value = dimension === 'end' ? 20 : 8;
    u.airFalloff.value = overworld ? 0.14 : 0.035;
    u.airRayleighBaseHeight.value = u.airBaseHeight.value;
    u.airRayleighFalloff.value = (u.airFalloff.value * 7) / 30;
    u.airFogDistance.value = fogSnapshot?.distance || 118;
    u.airSkyFogActive.value = overworld && fogSnapshot ? 1 : 0;
    if (overworld && fogSnapshot) {
      // Raw clear-sky incident light is independent of the fogged SH result.
      u.airSkyMean.value.copy(fogSnapshot.ambient);
    } else if (overworld && skyProbe) {
      const mean = skyProbe.sh.coefficients[0];
      u.airSkyMean.value
        .setRGB(Math.max(0, mean.x), Math.max(0, mean.y), Math.max(0, mean.z))
        .multiplyScalar(0.28209479177 * skyProbe.intensity);
    } else u.airSkyMean.value.copy(horizon);
    u.airHorizon.value.copy(horizon);
    u.airSunColor.value.copy(sun.color);
    u.airSunDirection.value
      .subVectors(sun.position, sun.target.position)
      .normalize();
    // The shared Photon controller already applies the source's time curve.
    u.airSunPower.value = overworld ? sun.intensity : 0;
    u.airAmbient.value = overworld ? 1 : dimension === 'nether' ? 0.18 : 0.65;
    u.airCameraSky.value = cameraSky;
    u.airTime.value = time;
    u.airVolume.value = volume ? 1 : 0;
    u.waterCamera.value = medium === 'water' ? 1 : 0;
    u.airFlight.value = MathUtils.damp(
      u.airFlight.value,
      flight ? 1 : 0,
      5,
      dt,
    );
  }

  attach(scene) {
    scene.traverseVisible((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (
          !material ||
          !material.fog ||
          material.isShaderMaterial ||
          material.userData.airFog
        )
          continue;
        this.apply(material);
      }
    });
  }

  apply(material) {
    material.userData.airFog = true;
    const previous = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey;
    const sky = ['surface', 'dynamic'].includes(material.userData.voxelLighting)
      ? 'vSkylight'
      : 'airCameraSky';
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        `varying vec3 vAirWorldPosition; uniform mat4 airCameraWorld;\n` +
        shader.vertexShader.replace(
          '#include <fog_vertex>',
          `#include <fog_vertex>
        vAirWorldPosition = (airCameraWorld * mvPosition).xyz;`,
        );
      shader.fragmentShader =
        `varying vec3 vAirWorldPosition;
        uniform vec3 airCameraPosition;
        ${airTransportGLSL}
        uniform float airCameraSky; uniform float airVolume; uniform float airFlight;\n` +
        shader.fragmentShader.replace('#include <fog_fragment>', '').replace(
          '#include <opaque_fragment>',
          /* glsl */ `
        #ifdef USE_FOG
          vec3 airDelta = vAirWorldPosition - airCameraPosition;
          float airDistance = length(airDelta);
          // The post path integrates air once after the scene; skip this work
          // uniformly rather than computing it only to mix it away.
          if(airVolume<0.5 && airDensity>0.0) {
            vec3 airRay = airDelta / max(airDistance, 0.001);
            vec2 columns = airColumns(airCameraPosition,airRay,airDistance);
            vec3 airTransmission = exp(-airOpticalDepth(columns));
            float airSky = max(${sky}, airCameraSky * 0.3);
            vec3 airScatter = airScattering(columns,airDirectPhase(dot(airRay,airSunDirection)),
              airSky,vec3(0.0),airSunColor*airSunPower*airSky);
            outgoingLight=outgoingLight*airTransmission+airScatter;
          }
          // Keep the streaming boundary hidden in both rendering paths.
          float edgeDistance = mix(airDistance, length(vec3(airDelta.x, airDelta.y * 0.15, airDelta.z)), airFlight);
          float airEdge = smoothstep(fogNear, fogFar, edgeDistance);
          vec3 boundary = fogColor;
          if(airVolume<0.5 && airDensity>0.0 && airSkyFogActive>0.5 && airEdge>0.0) {
            vec3 ray=airDelta/max(airDistance,0.001);
            vec2 columns=airColumns(airCameraPosition,ray,airFogDistance);
            boundary=boundary*exp(-airOpticalDepth(columns))+
              airScattering(columns,airDirectPhase(dot(ray,airSunDirection)),airCameraSky,
                vec3(0),airSunColor*airSunPower*airCameraSky);
          }
          outgoingLight = mix(outgoingLight, boundary, airEdge);
        #endif
        #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () =>
      cacheKey.call(material) + '-photon-sky-air-v5';
    material.needsUpdate = true;
  }
}
