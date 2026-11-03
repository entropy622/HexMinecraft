import { ShaderChunk, Vector2 } from 'three';
import { waterLightingGLSL } from './water-lighting.js';
import { installSurfaceProgram } from './surface-program.js';
export const visionUniforms = { nightVision: { value: 0 } };

// Both static surfaces and moving models use the same response to voxel light.
export const voxelLightingChunk = ShaderChunk.lights_fragment_begin
  .replace(
    'irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );',
    'irradiance += vSkylight * max(vec3(0.0), getLightProbeIrradiance( lightProbe, geometryNormal ));',
  )
  .replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );
    #ifdef HEX_GEOMETRIC_SHADE
      vec3 geometricIncident=directLight.color;
    #endif
    #ifdef HEX_WATER_RECEIVER
      vec3 waterLightDirection = inverseTransformDirection(directLight.direction, viewMatrix);
      vec3 waterBounceResponse;
      directLight.color *= waterSunResponse(vLightPosition, inverseTransformDirection(normal, viewMatrix), waterLightDirection, vSkylight,waterBounceResponse);
      #ifdef HEX_GEOMETRIC_SHADE
        geometricIncident*=waterBounceResponse;
      #endif
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

// Three's existing material classes remain adapters for texture/light uniforms.
// Geometric surfaces own their shader stages; independent legacy models keep
// their existing host path until their material semantics are migrated.
export function applySkylight(
  material,
  sharedUniforms,
  geometricShade = false,
) {
  material.userData.voxelLighting = 'surface';
  material.userData.geometricShade = geometricShade;
  if (geometricShade)
    material.defaultAttributeValues = {
      ...material.defaultAttributeValues,
      ambientOcclusion: [1],
      surfaceOptics: [0],
      biomeTint: [0, 0, 0, 0],
    };
  const uniforms = sharedUniforms || { terrainWetness: { value: 0 } };
  uniforms.surfaceBounce ??= { value: 0 };
  uniforms.terrainRain ??= { value: 0 };
  uniforms.surfaceDiffuse ??= { value: 1 };
  uniforms.surfaceSpecular ??= { value: 1 };
  uniforms.surfaceLightRadius ??= { value: Math.PI / 90 };
  uniforms.surfacePackEnabled ??= { value: 0 };
  uniforms.surfacePackGrid ??= { value: new Vector2(1, 1) };
  uniforms.biomeGrassOverlay ??= { value: null };
  uniforms.biomeTileSize ??= { value: 16 };
  if (geometricShade) {
    installSurfaceProgram(material, uniforms, visionUniforms);
    return uniforms;
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, visionUniforms);
    shader.vertexShader = (
      'attribute float skylight;attribute float rainExposure;attribute float surfacePorosity;attribute vec3 blocklight;\n' +
      'varying vec3 vBlockLight;varying float vSkylight,vWetTop,vPorosity;varying vec3 vLightPosition;\n' +
      shader.vertexShader
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSkylight=skylight;vBlockLight=blocklight;vPorosity=surfacePorosity;vWetTop=rainExposure*max(0.0,normal.y);vLightPosition=(modelMatrix*vec4(position,1.0)).xyz;',
    );
    shader.fragmentShader = (
      (!material.transparent
        ? '#define HEX_WATER_RECEIVER\n' + waterLightingGLSL
        : '') +
      'varying vec3 vBlockLight;varying float vSkylight,vWetTop,vPorosity;varying vec3 vLightPosition;uniform float terrainWetness,terrainRain,nightVision,surfaceDiffuse;\n' +
      shader.fragmentShader
    )
      .replace('#include <lights_fragment_begin>', voxelLightingChunk)
      .replace(
        '#include <opaque_fragment>',
        'float wet=terrainWetness*vWetTop;outgoingLight*=1.0-wet*(0.12+0.18*vPorosity);\n#include <opaque_fragment>',
      );
  };
  material.customProgramCacheKey = () =>
    'hex-legacy-voxel-v16-' + Number(!!material.userData.wetSurface);
  return uniforms;
}
