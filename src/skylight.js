import { ShaderChunk } from 'three';
import { waterLightingGLSL } from './water-lighting.js';
import { surfaceIndirectGLSL } from './surface-indirect.js';
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

const directionalShadow =
  /directLight\.color \*= (\( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \],[^\n]+ : 1\.0);/;
if (!directionalShadow.test(voxelLightingChunk))
  throw Error(
    'Directional shadow chunk changed; update surface indirect lighting.',
  );
const geometricLightingChunk = voxelLightingChunk
  .replace(
    'vSkylight * max(vec3(0.0), getLightProbeIrradiance( lightProbe, geometryNormal ))',
    'vSkylight * surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion)',
  )
  .replace(
    directionalShadow,
    (_, visibility) => `
    float geometricShadow=${visibility};
    directLight.color*=geometricShadow;
    // Photon's bounded shadow-bounce approximation. Incident RGB already
    // contains cloud/glass/water filtering; emission and local lights stay separate.
    float geometricAO=clamp(vAmbientOcclusion,0.0,1.0);
    float geometricUp=max(0.0,inverseTransformDirection(geometryNormal,viewMatrix).y);
    reflectedLight.indirectDiffuse += material.diffuseColor*geometricIncident *
      (0.033*surfaceBounce*(1.0-geometricShadow)*(1.0-0.1*geometricUp)*
        // The vertex attribute already contains (voxel sky level / 15)^2.
        sqrt(geometricAO)*pow(clamp(vSkylight,0.0,1.0),2.0));
    #ifdef HEX_LEAF_PRIMARY_SSS
      // Reduce only the ordinary directional diffuse after capturing the full
      // incident energy for transmission and bounce. Local RGB stays unchanged.
      directLight.color*=1.0-0.5*clamp(leafSssAmount,0.0,1.0);
    #endif
  `,
  );

// Shared weather uniforms; terrain receives persistent voxel light instead of
// static point-light pools. Two short-range moving fireball lights supplement it.
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
    };
  const uniforms = sharedUniforms || {
    terrainWetness: { value: 0 },
  };
  uniforms.surfaceBounce ??= { value: 0 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, visionUniforms);
    shader.vertexShader =
      `${geometricShade ? 'attribute float ambientOcclusion; varying float vAmbientOcclusion;\n' : ''}
      attribute float skylight; attribute float rainExposure; attribute float surfacePorosity; attribute vec3 blocklight;
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying float vPorosity; varying vec3 vLightPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkylight = skylight;
        ${geometricShade ? 'vAmbientOcclusion=clamp(ambientOcclusion,0.0,1.0);' : ''}
        vBlockLight = blocklight;
        vPorosity = surfacePorosity;
        vWetTop = rainExposure * max(0.0, normal.y);
        vLightPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      `${geometricShade ? '#define HEX_GEOMETRIC_SHADE\nvarying float vAmbientOcclusion;\n' : ''}
      ${!material.transparent ? '#define HEX_WATER_RECEIVER\n' + waterLightingGLSL : ''}
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying float vPorosity; varying vec3 vLightPosition;
      uniform float terrainWetness; uniform float nightVision;\n${shader.fragmentShader}`
        .replace(
          '#include <lights_pars_begin>',
          '#include <lights_pars_begin>\n' +
            (geometricShade ? surfaceIndirectGLSL : ''),
        )
        .replace(
          '#include <lights_fragment_begin>',
          geometricShade ? geometricLightingChunk : voxelLightingChunk,
        )
        .replace(
          '#include <color_fragment>',
          geometricShade
            ? `#ifdef USE_COLOR_ALPHA
                 diffuseColor.a *= vColor.a;
               #endif`
            : '#include <color_fragment>',
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          ${
            geometricShade
              ? `
          // Baked face shade/AO attenuates reflected light, but is not pigment.
          // Transmission and other material responses keep the texture albedo.
          #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
            reflectedLight.directDiffuse *= vColor.rgb;
            reflectedLight.indirectDiffuse *= vColor.rgb;
          #endif
          reflectedLight.directDiffuse *= vAmbientOcclusion;
          reflectedLight.indirectDiffuse *= vAmbientOcclusion;`
              : ''
          }`,
        )
        .replace(
          '#include <opaque_fragment>',
          `
        float wet = terrainWetness * vWetTop;
        outgoingLight *= 1.0 - wet * (0.12 + 0.18 * vPorosity);
        #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () =>
    'hex-colored-voxel-wet-sky-v9-' + Number(geometricShade);
  return uniforms;
}
