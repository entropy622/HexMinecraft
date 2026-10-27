import {
  Color,
  DoubleSide,
  MeshDepthMaterial,
  MeshLambertMaterial,
  RGBADepthPacking,
  Vector3,
} from 'three';
import { applySkylight } from './skylight.js';

export const foliageUniforms = () => ({
  leafTime: { value: 0 },
  leafWind: { value: 0 },
  leafSunDirection: { value: new Vector3(0, 1, 0) },
  leafSunColor: { value: new Color(0) },
  leafViewer: { value: new Vector3() },
});

// World-space phases keep neighboring leaf faces and chunk seams together.
// Grass anchors at the integral ground height; full leaf blocks sway gently.
export function applyFoliageWind(material, uniforms, grass = false) {
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `uniform float leafTime; uniform float leafWind; uniform vec3 leafViewer;\n${material.isMeshDepthMaterial ? 'attribute float skylight;\n' : ''}` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vec3 leafWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        float leafGust = sin(leafWorld.x * 0.47 + leafWorld.z * 0.31 + leafTime * 1.1);
        float leafFlutter = sin(leafWorld.x * 1.37 - leafWorld.z * 0.81 + leafTime * 2.8 + leafWorld.y * 0.7);
        float leafAnchor = ${grass ? 'clamp(fract(position.y + 0.001) * 1.4, 0.0, 1.0)' : '1.0'};
        float leafShelter = 0.15 + 0.85 * sqrt(clamp(skylight, 0.0, 1.0));
        transformed.xz += vec2(leafGust + leafFlutter * 0.3, leafGust * 0.45 - leafFlutter * 0.2) * leafWind * leafAnchor * leafShelter;
        ${
          grass
            ? `vec2 leafToPlayer = leafViewer.xz - leafWorld.xz;
        float leafTouch = exp(-dot(leafToPlayer, leafToPlayer) * 3.0 - abs(leafWorld.y - leafViewer.y + 1.5) * 2.0);
        transformed.xz -= leafToPlayer * leafTouch * 0.22 * leafAnchor;`
            : ''
        }
      `,
      );
  };
  material.customProgramCacheKey = () =>
    cacheKey + (grass ? '-grass-wind-v1' : '-leaf-wind-v1');
}

export function leafMaterials(atlas, weather, uniforms) {
  const material = new MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  applySkylight(material, weather);
  applyFoliageWind(material, uniforms);
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader =
      `uniform vec3 leafSunDirection; uniform vec3 leafSunColor;\n` +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        // A small forward-scattering approximation for sunlit foliage.
        float leafTransmission = pow(max(dot(normalize(vLightPosition - cameraPosition), leafSunDirection), 0.0), 4.0);
        outgoingLight += diffuseColor.rgb * leafSunColor * leafTransmission * vSkylight;
        #include <opaque_fragment>
      `,
      );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + '-transmission-v1';
  const depth = new MeshDepthMaterial({
    map: atlas,
    depthPacking: RGBADepthPacking,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  applyFoliageWind(depth, uniforms);
  return { material, depth };
}
