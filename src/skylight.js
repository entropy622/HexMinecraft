import { ShaderChunk } from 'three';
import { waterLightingGLSL } from './water-lighting.js';
export const visionUniforms = { nightVision: { value: 0 } };

// Both static surfaces and moving models use the same response to voxel light.
export const voxelLightingChunk = ShaderChunk.lights_fragment_begin
  .replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );
    #ifdef HEX_WATER_RECEIVER
      vec3 waterLightDirection = inverseTransformDirection(directLight.direction, viewMatrix);
      directLight.color *= waterSunResponse(vLightPosition, inverseTransformDirection(normal, viewMatrix), waterLightDirection, vSkylight);
      directLight.direction = normalize((viewMatrix * vec4(waterLightDirection, 0.0)).xyz);
    #else
      directLight.color *= smoothstep(0.45, 0.95, vSkylight);
    #endif`,
  )
  .replace(
    'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );',
    'vec3 irradiance = vec3(0.025 + nightVision * 0.75) + vBlockLight * 3.8;',
  )
  .replace(
    'irradiance += getHemisphereLightIrradiance',
    'irradiance += vSkylight * getHemisphereLightIrradiance',
  );

// Shared weather uniforms; terrain receives persistent voxel light instead of
// static point-light pools. Two short-range moving fireball lights supplement it.
export function applySkylight(material, sharedUniforms) {
  material.userData.voxelLighting = 'surface';
  const uniforms = sharedUniforms || {
    terrainWetness: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, visionUniforms);
    shader.vertexShader =
      `attribute float skylight; attribute float rainExposure; attribute float surfacePorosity; attribute vec3 blocklight;
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying float vPorosity; varying vec3 vLightPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkylight = skylight;
        vBlockLight = blocklight;
        vPorosity = surfacePorosity;
        vWetTop = rainExposure * max(0.0, normal.y);
        vLightPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      `${!material.transparent ? '#define HEX_WATER_RECEIVER\n' + waterLightingGLSL : ''}
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying float vPorosity; varying vec3 vLightPosition;
      uniform float terrainWetness; uniform float nightVision;\n${shader.fragmentShader}`
        .replace('#include <lights_fragment_begin>', voxelLightingChunk)
        .replace(
          '#include <opaque_fragment>',
          `
        float wet = terrainWetness * vWetTop;
        outgoingLight *= 1.0 - wet * (0.12 + 0.18 * vPorosity);
        #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () => 'hex-colored-voxel-wet-v6';
  return uniforms;
}
