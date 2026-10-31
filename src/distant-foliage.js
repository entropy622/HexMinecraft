import { leafLightingGLSL } from './leaf-lighting.js';

// Use the shared Photon far-shadow response for leaf-class fragments. The
// coarse scene has no complete local optical volume; do not march its unknown
// columns as if they were open sky or borrow a nearby roof's thickness.
export function applyDistantFoliage(material, uniforms) {
  const previous = material.onBeforeCompile,
    cache = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'attribute float leafAmbient; varying float vDistantLeafAmbient;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvDistantLeafAmbient=leafAmbient;',
      );
    shader.fragmentShader =
      `varying float vDistantLeafAmbient; uniform vec3 leafSunDirection,leafSunColor;uniform float leafSheen,leafSssAmount;
    vec3 distantLeafFilter=vec3(1.0);
    ${leafLightingGLSL}\n` +
      shader.fragmentShader
        .replace(
          'reflectedLight.indirectDiffuse *= vAmbientOcclusion;',
          `reflectedLight.indirectDiffuse *= vAmbientOcclusion;
      #if defined(USE_LIGHT_PROBES)
      if(int(floor(vSurfaceOptics+0.5))==5){
        vec3 canopySkyUp=max(vec3(0),shGetIrradianceAt(vec3(0,1,0),lightProbe));
        vec3 canopyFaceShade=vec3(1);
        #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
          canopyFaceShade=vColor.rgb;
        #endif
        reflectedLight.indirectDiffuse+=BRDF_Lambert(material.diffuseColor)*canopySkyUp*surfaceSkyLevel*clamp(vDistantLeafAmbient,0.0,1.0)*canopyFaceShade;
      }
      #endif`,
        )
        .replace(
          'irradiance += surfaceSkyLevel * surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion);',
          `
      if(int(floor(vSurfaceOptics+0.5))==5){
        vec3 leafSkyUp=max(vec3(0.0),shGetIrradianceAt(vec3(0,1,0),lightProbe));
        irradiance+=0.5*surfaceSkyLevel*leafSkyUp;
      }else irradiance+=surfaceSkyLevel*surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion);`,
        )
        .replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          `getDirectionalLightInfo( directionalLight, directLight );
      if(int(floor(vSurfaceOptics+0.5))==5)distantLeafFilter=directLight.color/max(vec3(0.00001),directionalLight.color);`,
        )
        .replace(
          'reflectedLight.directDiffuse*=surfaceMetalDiffuse;',
          `reflectedLight.directDiffuse*=surfaceMetalDiffuse;
      if(int(floor(vSurfaceOptics+0.5))==5)reflectedLight.directDiffuse*=1.0-0.5*clamp(leafSssAmount,0.0,1.0);`,
        )
        .replace(
          '#include <opaque_fragment>',
          `
      if(int(floor(vSurfaceOptics+0.5))==5 && leafSssAmount>0.000001){
        float mu=dot(normalize(vLightPosition-cameraPosition),leafSunDirection);
        float NoL=dot(inverseTransformDirection(geometryNormal,viewMatrix),leafSunDirection);
        vec3 transmission=leafBeerTransmission(diffuseColor.rgb,0.0,leafSssAmount)*leafRangeResponse(1.0,NoL,vAmbientOcclusion,0.5*clamp(vDistantLeafAmbient,0.0,1.0));
        outgoingLight+=leafSunColor*clamp(distantLeafFilter,vec3(0),vec3(1))*leafSolarResponse(diffuseColor.rgb,mu,transmission,leafSheen,leafSssAmount);
      }
      #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () =>
    cache.call(material) + '-distant-photon-leaf-v2-ambient';
}
