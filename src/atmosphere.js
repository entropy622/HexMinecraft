import { Color, MathUtils, Vector3 } from 'three';
import { RAYLEIGH_PER_KM } from './sky-transport.js';
import { airTransportGLSL } from './air-transport.js';

// Shared RGB height profiles and illumination for the marched and analytic
// paths. The four direct orders remain an approximation, not a multiple-scattering LUT.
export class Atmosphere {
  constructor(camera) {
    this.uniforms = {
      airCameraWorld: { value: camera.matrixWorld },
      airCameraPosition: { value: camera.position },
      airDensity: { value: 0.009 },
      airBaseHeight: { value: 8 },
      airFalloff: { value: 0.14 },
      airRayleighBaseHeight: { value: 8 },
      airRayleighFalloff: { value: (0.14 * 7) / 30 },
      airRayleigh: {
        value: new Vector3(...RAYLEIGH_PER_KM).multiplyScalar(0.02),
      },
      airMieExtinction: { value: 0.009 },
      airMieScattering: { value: 0.0081 },
      airSkyMean: { value: new Color() },
      airHorizon: { value: new Color() },
      airSunColor: { value: new Color() },
      airSunDirection: { value: new Vector3() },
      airSunPower: { value: 0 },
      airAmbient: { value: 1 },
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
    biome,
    rain,
    dusk,
    horizon,
    sun,
    skyProbe,
    cameraSky,
    medium,
    volume,
    flight = false,
  }) {
    const u = this.uniforms,
      overworld = dimension === 'overworld',
      submerged = !!medium;
    let density = overworld
      ? 0.008 + dusk * 0.006 + rain * 0.008
      : dimension === 'nether'
        ? 0.018
        : 0.004;
    if (biome === '沙漠') density *= 0.55;
    if (biome === '雪原') density *= 1.15;
    u.airDensity.value = submerged
      ? 0
      : MathUtils.damp(u.airDensity.value, density, 2, dt);
    u.airBaseHeight.value = dimension === 'end' ? 20 : 8;
    u.airFalloff.value = overworld ? 0.14 : 0.035;
    u.airRayleighBaseHeight.value = u.airBaseHeight.value;
    u.airRayleighFalloff.value = (u.airFalloff.value * 7) / 30;
    // Keep base-height green extinction at the existing weather density. The
    // molecular component uses the same spectrum as the sky, at 20 m/local unit.
    u.airRayleigh.value
      .set(...RAYLEIGH_PER_KM)
      .multiplyScalar(overworld && !submerged ? 0.02 : 0);
    u.airMieExtinction.value = Math.max(
      0,
      u.airDensity.value - u.airRayleigh.value.y,
    );
    u.airMieScattering.value = u.airMieExtinction.value * (overworld ? 0.9 : 1);
    if (overworld && skyProbe) {
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
    u.airSunPower.value = overworld ? sun.intensity * (1 + dusk * 0.65) : 0;
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
          outgoingLight = mix(outgoingLight, fogColor, airEdge);
        #endif
        #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () =>
      cacheKey.call(material) + '-rgb-height-air-v3';
    material.needsUpdate = true;
  }
}
