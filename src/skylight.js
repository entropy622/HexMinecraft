import { ShaderChunk, Color } from 'three';

// Shared weather uniforms; terrain receives persistent voxel light instead of
// unoccluded point lights selected by distance to the camera.
export function applySkylight(material, sharedUniforms) {
  const uniforms = sharedUniforms || {
    terrainWetness: { value: 0 },
    wetSky: { value: new Color('#7c96a5') },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
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
    const lighting = ShaderChunk.lights_fragment_begin
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
        'vec3 irradiance = vec3(0.025) + vBlockLight * 3.8;',
      )
      .replace(
        'irradiance += getHemisphereLightIrradiance',
        'irradiance += vSkylight * getHemisphereLightIrradiance',
      );
    shader.fragmentShader =
      `varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying vec3 wetPosition;
      uniform float terrainWetness; uniform vec3 wetSky;\n${shader.fragmentShader}`
        .replace('#include <lights_fragment_begin>', lighting)
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
