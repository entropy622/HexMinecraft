import { ShaderChunk } from 'three';
import { waterLightingGLSL } from './water-lighting.js';
import { surfaceIndirectGLSL } from './surface-indirect.js';
import { photonSpecularGLSL } from './photon-specular.js';
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
// Only the directional-light invocation gets Photon's direct diffuse response.
// Leave the incident energy used by SSS/bounce and every local light unchanged.
const directionalLoop =
  /(getDirectionalLightInfo\( directionalLight, directLight \);[\s\S]*?)(RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)/;
if (!directionalLoop.test(voxelLightingChunk))
  throw Error('Directional light loop changed; update Photon surface diffuse.');
const geometricLightingChunk = voxelLightingChunk
  .replace(
    directionalLoop,
    (_, setup, draw) => `${setup}
    // Specular receives the filtered, shadowed incident light before the
    // artistic diffuse response or SSS energy allocation changes it.
    if(surfaceSpecular>0.5){
      float surfaceLoV=clamp(dot(directLight.direction,geometryViewDir),-1.0,1.0);
      reflectedLight.directSpecular+=directLight.color*
      photonSurfaceHighlight(material.diffuseColor,surfaceOptical,
        dot(geometryNormal,directLight.direction),max(0.0,dot(geometryNormal,geometryViewDir)),
        surfaceLoV,sqrt(max(0.0,0.5+0.5*surfaceLoV)),surfaceLightRadius);
    }
    #ifdef HEX_LEAF_PRIMARY_SSS
      directLight.color*=1.0-0.5*clamp(leafSssAmount,0.0,1.0);
    #endif
    // lift(NoL, 0.25) / NoL has this finite form, including grazing NoL=0.
    // The common geometry attenuation below supplies one AO factor already.
    float surfaceNoL=clamp(dot(geometryNormal,directLight.direction),0.0,1.0);
    directLight.color*=mix(1.0,1.25/(1.0+0.25*surfaceNoL)*clamp(vAmbientOcclusion,0.0,1.0),surfaceDiffuse);
    ${draw}`,
  )
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
      surfaceOptics: [0],
    };
  const uniforms = sharedUniforms || {
    terrainWetness: { value: 0 },
  };
  uniforms.surfaceBounce ??= { value: 0 };
  uniforms.surfaceDiffuse ??= { value: 1 };
  uniforms.surfaceSpecular ??= { value: 1 };
  uniforms.surfaceLightRadius ??= { value: Math.PI / 90 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, visionUniforms);
    shader.vertexShader =
      `${geometricShade ? 'attribute float ambientOcclusion; varying float vAmbientOcclusion; attribute float surfaceOptics; varying float vSurfaceOptics;\n' : ''}
      attribute float skylight; attribute float rainExposure; attribute float surfacePorosity; attribute vec3 blocklight;
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying float vPorosity; varying vec3 vLightPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkylight = skylight;
        ${geometricShade ? 'vAmbientOcclusion=clamp(ambientOcclusion,0.0,1.0);vSurfaceOptics=surfaceOptics;' : ''}
        vBlockLight = blocklight;
        vPorosity = surfacePorosity;
        vWetTop = rainExposure * max(0.0, normal.y);
        vLightPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      `${geometricShade ? '#define HEX_GEOMETRIC_SHADE\nvarying float vAmbientOcclusion; varying float vSurfaceOptics; uniform float surfaceSpecular,surfaceLightRadius;\n' : ''}
      ${!material.transparent ? '#define HEX_WATER_RECEIVER\n' + waterLightingGLSL : ''}
      varying vec3 vBlockLight; varying float vSkylight; varying float vWetTop; varying float vPorosity; varying vec3 vLightPosition;
      uniform float terrainWetness; uniform float nightVision; uniform float surfaceDiffuse;\n${shader.fragmentShader}`
        .replace(
          '#include <lights_pars_begin>',
          '#include <lights_pars_begin>\n' +
            (geometricShade ? surfaceIndirectGLSL + photonSpecularGLSL : ''),
        )
        .replace(
          '#include <lights_fragment_begin>',
          geometricShade
            ? 'PhotonSurfaceOptics surfaceOptical=photonSurfaceOptics(material.diffuseColor,vSurfaceOptics);\n' +
                geometricLightingChunk
            : voxelLightingChunk,
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
          reflectedLight.indirectDiffuse *= vAmbientOcclusion;
          // Photon keeps half the diffuse on metals in its default SSR model.
          float surfaceMetalDiffuse=mix(1.0,0.5,surfaceOptical.metal);
          reflectedLight.directDiffuse*=surfaceMetalDiffuse;
          reflectedLight.indirectDiffuse*=surfaceMetalDiffuse;`
              : ''
          }`,
        )
        .replace(
          '#include <opaque_fragment>',
          `
        float wet = terrainWetness * vWetTop;
        outgoingLight *= 1.0 - wet * (0.12 + 0.18 * vPorosity);
        ${geometricShade ? 'outgoingLight+=reflectedLight.directSpecular;' : ''}
        #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () =>
    'hex-colored-voxel-wet-sky-v11-optics-' + Number(geometricShade);
  return uniforms;
}
