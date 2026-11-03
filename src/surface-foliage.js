import { foliageWindGLSL } from './foliage-wind.js';
import { leafLightingGLSL } from './leaf-lighting.js';
import { leafTransmissionGLSL } from './leaf-transmission.js';

export function windSurfaceFeature(uniforms, thin) {
  return {
    id: 'foliage-wind',
    version: 2,
    order: 30,
    uniforms,
    stages: {
      vertex_pars: `uniform float leafTime,leafWind;uniform vec3 leafViewer;\n${foliageWindGLSL}`,
      vertex_begin: /* glsl */ `
      vec3 leafWorld=(modelMatrix*vec4(position,1.0)).xyz;
      float leafAnchor=${thin ? 'clamp(fract(position.y)*1.4,0.0,1.0)' : '1.0'};
      transformed+=hexFoliageWind(leafWorld,leafTime,leafWind,clamp(skylight,0.0,1.0))*leafAnchor*${thin ? '1.0' : '0.5'};
      ${
        thin
          ? `vec2 leafToPlayer=leafViewer.xz-leafWorld.xz;
      float leafTouch=exp(-dot(leafToPlayer,leafToPlayer)*3.0-abs(leafWorld.y-leafViewer.y+1.5)*2.0);
      transformed.xz-=leafToPlayer*leafTouch*0.22*leafAnchor;`
          : ''
      }
      // Voxel transport remains anchored to the logical block position.
      // Visible/cloud/shadow positions use transformed in the project stage.
      `,
    },
  };
}

export function leafSurfaceFeature(uniforms, thin) {
  return {
    id: thin ? 'plant-lighting' : 'leaf-lighting',
    version: 1,
    order: 40,
    uniforms,
    stages: {
      defines: `#define HEX_LEAF_PRIMARY_SSS\n${thin ? '#define HEX_THIN_PLANT' : ''}`,
      vertex_pars: 'attribute float leafAmbient;varying float vLeafAmbient;',
      vertex_begin: `vLeafAmbient=leafAmbient;vSurfaceOptics=${thin ? 2 : 5}.0;`,
      fragment_pars: `varying float vLeafAmbient;uniform vec3 leafSunDirection,leafSunColor;uniform float leafSheen,leafDepthOnly;\n${leafLightingGLSL}`,
      shadow_helpers: leafTransmissionGLSL,
      after_alpha: 'if(leafDepthOnly>0.5){gl_FragColor=vec4(0);return;}',
      directional_capture:
        'leafLightTransmission=directLight.color/max(vec3(0.00001),directionalLight.color);',
      sky_irradiance: /* glsl */ `vec3 leafSkyUp=max(vec3(0),shGetIrradianceAt(vec3(0,1,0),lightProbe));
      ${thin ? 'irradiance+=surfaceSkyLevel*mix(surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion),0.5*leafSkyUp,leafSssAmount);' : 'irradiance+=0.5*surfaceSkyLevel*leafSkyUp;'}`,
      after_indirect: /* glsl */ `
      #if defined(USE_LIGHT_PROBES)
        vec3 leafFaceShade=vec3(1);
        #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
          leafFaceShade=vColor.rgb;
        #endif
        reflectedLight.indirectDiffuse+=BRDF_Lambert(material.diffuseColor)*leafSkyUp*surfaceSkyLevel*clamp(vLeafAmbient,0.0,1.0)${thin ? '*leafSssAmount' : ''}*leafFaceShade;
      #endif`,
      output: /* glsl */ `
      if(leafSssAmount>=0.000001&&max(max(leafSunColor.r,leafSunColor.g),leafSunColor.b)>0.00001&&surfaceSkyLevel>=0.01){
        float leafMu=dot(normalize(vLightPosition-cameraPosition),leafSunDirection);
        float leafNoL=dot(inverseTransformDirection(geometryNormal,viewMatrix),leafSunDirection);
        outgoingLight+=leafSunColor*clamp(leafLightTransmission,vec3(0),vec3(1))*leafSolarResponse(diffuseColor.rgb,leafMu,leafTransmittance(diffuseColor.rgb,leafNoL,vAmbientOcclusion,0.5*clamp(vLeafAmbient,0.0,1.0)),leafSheen,leafSssAmount);
      }`,
    },
  };
}

export function distantLeafSurfaceFeature(uniforms) {
  return {
    id: 'distant-foliage',
    version: 1,
    order: 40,
    uniforms,
    stages: {
      vertex_pars:
        'attribute float leafAmbient;varying float vDistantLeafAmbient;',
      vertex_begin: 'vDistantLeafAmbient=leafAmbient;',
      fragment_pars: `varying float vDistantLeafAmbient;uniform vec3 leafSunDirection,leafSunColor;uniform float leafSheen,leafSssAmount;vec3 distantLeafFilter=vec3(1);\n${leafLightingGLSL}`,
      directional_capture:
        'if(int(floor(vSurfaceOptics+0.5))==5)distantLeafFilter=directLight.color/max(vec3(0.00001),directionalLight.color);',
      sky_irradiance: /* glsl */ `
      if(int(floor(vSurfaceOptics+0.5))==5){vec3 leafSkyUp=max(vec3(0),shGetIrradianceAt(vec3(0,1,0),lightProbe));irradiance+=0.5*surfaceSkyLevel*leafSkyUp;}
      else irradiance+=surfaceSkyLevel*surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion);`,
      after_indirect: /* glsl */ `
      #if defined(USE_LIGHT_PROBES)
        if(int(floor(vSurfaceOptics+0.5))==5){
          vec3 canopySkyUp=max(vec3(0),shGetIrradianceAt(vec3(0,1,0),lightProbe)),canopyFaceShade=vec3(1);
          #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
            canopyFaceShade=vColor.rgb;
          #endif
          reflectedLight.indirectDiffuse+=BRDF_Lambert(material.diffuseColor)*canopySkyUp*surfaceSkyLevel*clamp(vDistantLeafAmbient,0.0,1.0)*canopyFaceShade;
        }
      #endif`,
      after_diffuse:
        'if(int(floor(vSurfaceOptics+0.5))==5)reflectedLight.directDiffuse*=1.0-0.5*clamp(leafSssAmount,0.0,1.0);',
      output: /* glsl */ `
      if(int(floor(vSurfaceOptics+0.5))==5&&leafSssAmount>0.000001){
        float mu=dot(normalize(vLightPosition-cameraPosition),leafSunDirection);
        float NoL=dot(inverseTransformDirection(geometryNormal,viewMatrix),leafSunDirection);
        vec3 transmission=leafBeerTransmission(diffuseColor.rgb,0.0,leafSssAmount)*leafRangeResponse(1.0,NoL,vAmbientOcclusion,0.5*clamp(vDistantLeafAmbient,0.0,1.0));
        outgoingLight+=leafSunColor*clamp(distantLeafFilter,vec3(0),vec3(1))*leafSolarResponse(diffuseColor.rgb,mu,transmission,leafSheen,leafSssAmount);
      }`,
    },
  };
}
