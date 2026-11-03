import {
  Color,
  DoubleSide,
  MeshDepthMaterial,
  RGBADepthPacking,
  Vector3,
} from 'three';
import { foliageWindGLSL } from './foliage-wind.js';
import { addSurfaceFeature } from './surface-program.js';
import { windSurfaceFeature, leafSurfaceFeature } from './surface-foliage.js';
import { createSurfaceMaterial } from './surface-material.js';

export const foliageUniforms = () => ({
  leafTime: { value: 0 },
  leafWind: { value: 0 },
  leafNoise: { value: null },
  leafSunDirection: { value: new Vector3(0, 1, 0) },
  leafSunColor: { value: new Color(0) },
  leafSheen: { value: 0.5 },
  leafSssAmount: { value: 0 },
  leafDepthOnly: { value: 0 },
  leafVolumeTop: { value: 64 },
  leafViewer: { value: new Vector3() },
});

// World-space phases keep neighboring leaf faces and chunk seams together.
// Grass anchors at the integral ground height; full leaf blocks sway gently.
export function applyFoliageWind(material, uniforms, grass = false) {
  if (addSurfaceFeature(material, windSurfaceFeature(uniforms, grass))) return;
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `uniform float leafTime; uniform float leafWind; uniform vec3 leafViewer;\n${foliageWindGLSL}\n${material.isMeshDepthMaterial ? 'attribute float skylight;\n' : ''}` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vec3 leafWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        float leafAnchor = ${grass ? 'clamp(fract(position.y) * 1.4, 0.0, 1.0)' : '1.0'};
        transformed += hexFoliageWind(leafWorld, leafTime, leafWind, clamp(skylight,0.0,1.0)) * leafAnchor * ${grass ? '1.0' : '0.5'};
        ${
          grass
            ? `vec2 leafToPlayer = leafViewer.xz - leafWorld.xz;
        float leafTouch = exp(-dot(leafToPlayer, leafToPlayer) * 3.0 - abs(leafWorld.y - leafViewer.y + 1.5) * 2.0);
        transformed.xz -= leafToPlayer * leafTouch * 0.22 * leafAnchor;`
            : ''
        }
        ${!material.isMeshDepthMaterial ? 'vLightPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''}
      `,
      );
  };
  material.customProgramCacheKey = () =>
    cacheKey + (grass ? '-grass-wind-v2-photon' : '-leaf-wind-v2-photon');
}

function subsurfaceMaterials(atlas, weather, uniforms, thin) {
  const { material } = createSurfaceMaterial(
    {
      map: atlas,
      vertexColors: true,
      alphaTest: 0.5,
      side: DoubleSide,
    },
    weather,
  );
  // Thick canopies benefit from early depth. Thin plants keep wind-aware
  // shadow depth without adding a second main/capture draw for every flower.
  material.userData.foliageDepthPrepass = !thin;
  material.defaultAttributeValues.leafAmbient = [0];
  applyFoliageWind(material, uniforms, thin);
  addSurfaceFeature(material, leafSurfaceFeature(uniforms, thin));
  const depth = new MeshDepthMaterial({
    map: atlas,
    depthPacking: RGBADepthPacking,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  applyFoliageWind(depth, uniforms, thin);
  return { material, depth };
}

export const leafMaterials = (atlas, weather, uniforms) =>
  subsurfaceMaterials(atlas, weather, uniforms, false);

export const plantMaterials = (atlas, weather, uniforms) =>
  subsurfaceMaterials(atlas, weather, uniforms, true);
