import { ShaderChunk } from 'three';

// Reduce sky fill under solid ceilings while leaving point-light illumination intact.
export function applySkylight(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `attribute float skylight; varying float vSkylight;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSkylight = skylight;',
      );
    const lighting = ShaderChunk.lights_fragment_begin.replace(
      'irradiance += getHemisphereLightIrradiance',
      'irradiance += vSkylight * getHemisphereLightIrradiance',
    );
    shader.fragmentShader =
      `varying float vSkylight;\n${shader.fragmentShader}`.replace(
        '#include <lights_fragment_begin>',
        lighting,
      );
  };
  material.customProgramCacheKey = () => 'hex-skylight-v1';
}
