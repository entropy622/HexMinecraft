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
    shader.fragmentShader =
      `uniform vec3 leafSunDirection,leafSunColor;uniform float leafSheen,leafSssAmount;
    vec3 distantLeafFilter=vec3(1.0);
    ${leafLightingGLSL}\n` +
      shader.fragmentShader
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
        vec3 transmission=leafBeerTransmission(diffuseColor.rgb,0.0,leafSssAmount)*leafRangeResponse(1.0,NoL,vAmbientOcclusion,0.0);
        outgoingLight+=leafSunColor*clamp(distantLeafFilter,vec3(0),vec3(1))*leafSolarResponse(diffuseColor.rgb,mu,transmission,leafSheen,leafSssAmount);
      }
      #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () =>
    cache.call(material) + '-distant-photon-leaf-v1';
}
