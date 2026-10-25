import { ShaderChunk, Color } from 'three';
export const visionUniforms = { nightVision: { value: 0 } };

// Both static surfaces and moving models use the same response to voxel light.
export const voxelLightingChunk = ShaderChunk.lights_fragment_begin
  .replace(
    'getPointLightInfo( pointLight, geometryPosition, directLight );',
    'getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color = vec3(0.0);',
  )
  .replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= smoothstep(0.45, 0.95, vSkylight);',
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
// unoccluded point lights selected by distance to the camera.
export function applySkylight(material, sharedUniforms) {
  material.userData.voxelLighting = 'surface';
  const uniforms = sharedUniforms || {
    terrainWetness: { value: 0 },
    wetSky: { value: new Color('#7c96a5') },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, visionUniforms);
    shader.vertexShader =
      `attribute float skylight; attribute float rainExposure; attribute vec3 blocklight;
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying vec3 wetPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkylight = skylight;
        vBlockLight = blocklight;
        vWetTop = rainExposure * max(0.0, normal.y);
        wetPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      `varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying vec3 wetPosition;
      uniform float terrainWetness; uniform vec3 wetSky; uniform float nightVision;\n${shader.fragmentShader}`
        .replace('#include <lights_fragment_begin>', voxelLightingChunk)
        .replace(
          '#include <opaque_fragment>',
          `
        vec2 pixel = floor(wetPosition.xz * 4.0);
        float grain = fract(sin(dot(pixel, vec2(12.9898, 78.233))) * 43758.5453);
        float wet = terrainWetness * vWetTop * (0.35 + smoothstep(0.3, 0.7, grain) * 0.65);
        float grazing = pow(1.0 - abs(normalize(cameraPosition - wetPosition).y), 4.0);
        outgoingLight *= 1.0 - wet * 0.18;
        outgoingLight = mix(outgoingLight, wetSky, wet * (0.04 + grazing * 0.38));
        #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () => 'hex-colored-voxel-wet-v3';
  return uniforms;
}
