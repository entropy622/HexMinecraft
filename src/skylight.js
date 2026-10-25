import { ShaderChunk, Color } from 'three';

// Reduce sky fill under solid ceilings while leaving point-light illumination intact.
export function applySkylight(material) {
  const uniforms = {
    terrainWetness: { value: 0 },
    wetSky: { value: new Color('#7c96a5') },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `attribute float skylight; attribute float rainExposure;
      varying float vSkylight; varying float vWetTop; varying vec3 wetPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkylight = skylight;
        vWetTop = rainExposure * max(0.0, normal.y);
        wetPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    const lighting = ShaderChunk.lights_fragment_begin.replace(
      'irradiance += getHemisphereLightIrradiance',
      'irradiance += vSkylight * getHemisphereLightIrradiance',
    );
    shader.fragmentShader =
      `varying float vSkylight; varying float vWetTop; varying vec3 wetPosition;
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
  material.customProgramCacheKey = () => 'hex-skylight-wet-v2';
  return uniforms;
}
