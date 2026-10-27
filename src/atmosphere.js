import { Color, MathUtils, Vector3 } from 'three';

// Original height-dependent single-scattering approximation, informed by
// Photon's separation of air density, ambient scattering and sun scattering.
export class Atmosphere {
  constructor(camera) {
    this.uniforms = {
      airCameraWorld: { value: camera.matrixWorld },
      airCameraPosition: { value: camera.position },
      airDensity: { value: 0.009 },
      airBaseHeight: { value: 8 },
      airFalloff: { value: 0.14 },
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
        uniform vec3 airCameraPosition; uniform float airDensity; uniform float airBaseHeight;
        uniform float airFalloff; uniform vec3 airHorizon; uniform vec3 airSunColor;
        uniform vec3 airSunDirection; uniform float airSunPower; uniform float airAmbient;
        uniform float airCameraSky; uniform float airVolume; uniform float airFlight;\n` +
        shader.fragmentShader.replace('#include <fog_fragment>', '').replace(
          '#include <opaque_fragment>',
          /* glsl */ `
        #ifdef USE_FOG
          vec3 airDelta = vAirWorldPosition - airCameraPosition;
          float airDistance = length(airDelta);
          vec3 airRay = airDelta / max(airDistance, 0.001);
          float airStart = exp(clamp(-(airCameraPosition.y - airBaseHeight) * airFalloff, -8.0, 1.4));
          float airEnd = exp(clamp(-(vAirWorldPosition.y - airBaseHeight) * airFalloff, -8.0, 1.4));
          float airMass = abs(airRay.y) < 0.001 ? airStart * airDistance :
            (airStart - airEnd) / (airFalloff * airRay.y);
          float airFog = 1.0 - exp(-airDensity * max(0.0, airMass));
          float airSky = max(${sky}, airCameraSky * 0.3);
          float airForward = pow(max(0.0, dot(airRay, airSunDirection)), 12.0);
          vec3 airSource = mix(vec3(0.003, 0.004, 0.005), airHorizon * airAmbient, airSky) +
            airSunColor * airSunPower * airForward * airSky * 0.3;
          outgoingLight = mix(outgoingLight, airSource, airFog * (1.0 - airVolume));
          // Keep the streaming boundary hidden in both rendering paths.
          float edgeDistance = mix(airDistance, length(vec3(airDelta.x, airDelta.y * 0.15, airDelta.z)), airFlight);
          float airEdge = smoothstep(fogNear, fogFar, edgeDistance);
          outgoingLight = mix(outgoingLight, fogColor, airEdge);
        #endif
        #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () =>
      cacheKey.call(material) + '-height-air-v2';
    material.needsUpdate = true;
  }
}
