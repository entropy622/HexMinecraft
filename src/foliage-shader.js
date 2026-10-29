import {
  Color,
  DoubleSide,
  MeshDepthMaterial,
  MeshLambertMaterial,
  RGBADepthPacking,
  Vector3,
} from 'three';
import { applySkylight } from './skylight.js';
import { leafLightingGLSL } from './leaf-lighting.js';
import { leafTransmissionGLSL } from './leaf-transmission.js';

export const foliageUniforms = () => ({
  leafTime: { value: 0 },
  leafWind: { value: 0 },
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
        ${!material.isMeshDepthMaterial ? 'vLightPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''}
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
  applySkylight(material, weather, true);
  material.defaultAttributeValues.leafAmbient = [0];
  applyFoliageWind(material, uniforms);
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader =
      'attribute float leafAmbient; varying float vLeafAmbient;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLeafAmbient=leafAmbient;',
      );
    shader.fragmentShader =
      `#define HEX_LEAF_PRIMARY_SSS\nvarying float vLeafAmbient; uniform vec3 leafSunDirection; uniform vec3 leafSunColor; uniform float leafSheen; uniform float leafDepthOnly;\n${leafLightingGLSL}\n` +
      shader.fragmentShader
        .replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
          if (leafDepthOnly > 0.5) { gl_FragColor=vec4(0.0); return; }`,
        )
        .replace(
          'irradiance += vSkylight * surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion);',
          `vec3 leafSkyUp=max(vec3(0.0),shGetIrradianceAt(vec3(0.0,1.0,0.0),lightProbe));
          irradiance += 0.5 * vSkylight * leafSkyUp;`,
        )
        .replace(
          'reflectedLight.indirectDiffuse *= vAmbientOcclusion;',
          `reflectedLight.indirectDiffuse *= vAmbientOcclusion;
          #if defined(USE_LIGHT_PROBES)
            vec3 leafFaceShade=vec3(1.0);
            #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
              leafFaceShade=vColor.rgb;
            #endif
            // Photon separates AO-weighted diffuse sky from ambient SSS.
            // vSkylight is already raw sky squared. Visibility is a normalized
            // byte from the real local canopy, not an exposure multiplier.
            reflectedLight.indirectDiffuse += BRDF_Lambert(material.diffuseColor) *
              leafSkyUp * vSkylight * clamp(vLeafAmbient,0.0,1.0) * leafFaceShade;
          #endif`,
        )
        .replace(
          '#include <shadowmap_pars_fragment>',
          '#include <shadowmap_pars_fragment>\n' + leafTransmissionGLSL,
        )
        .replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          `getDirectionalLightInfo( directionalLight, directLight );
        leafLightTransmission = directLight.color / max(vec3(0.00001), directionalLight.color);`,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
        // Photon gates at raw sky 0.1; vSkylight already contains raw sky squared.
        if (leafSssAmount >= 0.000001 && max(max(leafSunColor.r, leafSunColor.g), leafSunColor.b) > 0.00001 && vSkylight >= 0.01) {
          float leafMu = dot(normalize(vLightPosition - cameraPosition), leafSunDirection);
          outgoingLight += leafSunColor * clamp(leafLightTransmission, vec3(0.0), vec3(1.0)) *
            leafSolarResponse(diffuseColor.rgb,leafMu,leafTransmittance(diffuseColor.rgb),leafSheen,leafSssAmount);
        }
        #include <opaque_fragment>
      `,
        );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () =>
    key + '-transmission-v6-sky-subsurface-v1-primary-sheen-range-depth';
  const depth = new MeshDepthMaterial({
    map: atlas,
    depthPacking: RGBADepthPacking,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  applyFoliageWind(depth, uniforms);
  return { material, depth };
}
