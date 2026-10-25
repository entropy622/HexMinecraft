export const sawClock = { value: 0 };
export function animateSawMaterial(material) {
  const previous = material.onBeforeCompile,
    cache = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.sawClock = sawClock;
    shader.vertexShader =
      'attribute vec2 sawNextUV; attribute vec2 sawLastUV; uniform float sawClock;\n' +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
      #ifdef USE_MAP
        float sawFrame = mod(floor(sawClock * 8.0), 3.0);
        if (sawFrame > 1.5) vMapUv = (mapTransform * vec3(sawLastUV, 1.0)).xy;
        else if (sawFrame > 0.5) vMapUv = (mapTransform * vec3(sawNextUV, 1.0)).xy;
      #endif`,
      );
  };
  material.customProgramCacheKey = () => cache.call(material) + '-hex-saw-v1';
}
