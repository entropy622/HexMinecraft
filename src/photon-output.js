import {
  ColorManagement,
  GLSL3,
  Matrix3,
  ShaderChunk,
  SRGBTransfer,
  Vector4,
} from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { photonGradingGLSL, photonWhiteBalance } from './photon-grading.js';
import { photonCasGLSL } from './photon-cas.js';

// Use Three's documented CustomToneMapping slot. Default grading also reaches
// direct-rendered balanced/fast materials, without another render target/pass.
export function installPhotonOutput() {
  if (ShaderChunk.tonemapping_pars_fragment.includes('HEX_PHOTON_OUTPUT'))
    return;
  const tone = /vec3 CustomToneMapping\s*\(\s*vec3 color\s*\)\s*\{[^}]*\}/;
  const transfer =
    /vec4 sRGBTransferOETF\s*\(\s*in vec4 value\s*\)\s*\{[^}]*\}/;
  if (
    !tone.test(ShaderChunk.tonemapping_pars_fragment) ||
    !transfer.test(ShaderChunk.colorspace_pars_fragment)
  )
    throw Error('Three output shader contract changed');
  ShaderChunk.tonemapping_pars_fragment =
    ShaderChunk.tonemapping_pars_fragment.replace(
      tone,
      `
    // HEX_PHOTON_OUTPUT
    ${photonGradingGLSL}
    vec3 CustomToneMapping(vec3 color){
      return photonGrade(color*toneMappingExposure,vec4(1.0,1.0,1.0,6500.0),vec4(0.0,0.1,0.0,0.0),mat3(1.0));
    }`,
    );
  // Only the final display transfer changes; texture sRGB decoding stays intact.
  // This helper must also work on untone-mapped materials that do not include
  // the tone mapping chunk, so keep its small source expression self-contained.
  ShaderChunk.colorspace_pars_fragment =
    ShaderChunk.colorspace_pars_fragment.replace(
      transfer,
      `
    vec4 sRGBTransferOETF(in vec4 value){
      vec3 linear=clamp(value.rgb,0.0,1.0);
      return vec4(1.14374*(-0.126893*linear+sqrt(linear)),value.a);
    }`,
    );
}

export class PhotonOutputPass extends OutputPass {
  constructor() {
    super();
    installPhotonOutput();
    this.material.name = 'PhotonOutput';
    this.material.depthTest = this.material.depthWrite = false;
    this.uniforms.photonInputGrade = { value: new Vector4(1, 1, 1, 6500) };
    this.uniforms.photonSelective = { value: new Vector4(0, 0.1, 0, 0) };
    this.uniforms.photonWhiteBalance = { value: new Matrix3() };
    this.uniforms.photonCasEnabled = { value: true };
    this.uniforms.photonSharpness = { value: 0.5 };
    this.material.glslVersion = GLSL3;
    this.material.vertexShader = /* glsl */ `
      precision highp float;
      in vec3 position;
      in vec2 uv;
      out vec2 vUv;
      void main(){vUv=uv;gl_Position=vec4(position,1.0);}`;
    this.material.fragmentShader = /* glsl */ `
      precision highp float;
      uniform highp sampler2D tDiffuse;
      uniform vec4 photonInputGrade,photonSelective;
      uniform mat3 photonWhiteBalance;
      uniform bool photonCasEnabled;
      uniform float photonSharpness;
      in vec2 vUv;
      out vec4 outputColor;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      ${photonCasGLSL}
      vec3 photonCasTap(ivec2 p){
        // Explicit repeated-edge taps; texelFetch outside the image is undefined.
        p=clamp(p,ivec2(0),textureSize(tDiffuse,0)-1);
        vec3 hdr=texelFetch(tDiffuse,p,0).rgb*toneMappingExposure;
        return photonDisplayTransfer(photonGrade(hdr,photonInputGrade,photonSelective,photonWhiteBalance));
      }
      void main(){
        #ifdef SRGB_TRANSFER
          if(photonCasEnabled){
            ivec2 p=clamp(ivec2(vUv*vec2(textureSize(tDiffuse,0))),ivec2(0),textureSize(tDiffuse,0)-1);
            vec3 taps[9];
            for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)taps[(y+1)*3+x+1]=photonCasTap(p+ivec2(x,y));
            // CAS already operates in display RGB; do not encode it again.
            outputColor=vec4(photonCas(taps,photonSharpness),texelFetch(tDiffuse,p,0).a);
            return;
          }
        #endif
        vec4 color=texture(tDiffuse,vUv);
        color.rgb=photonGrade(color.rgb*toneMappingExposure,photonInputGrade,photonSelective,photonWhiteBalance);
        #ifdef SRGB_TRANSFER
          color=sRGBTransferOETF(color);
        #endif
        outputColor=color;
      }`;
  }
  prepare(renderer) {
    // Match OutputPass's defines for this renderer's fixed CustomToneMapping.
    // Its ordinary render() still owns and checks the output configuration.
    this.material.defines = { CUSTOM_TONE_MAPPING: '' };
    if (ColorManagement.getTransfer(renderer.outputColorSpace) === SRGBTransfer)
      this.material.defines.SRGB_TRANSFER = '';
    this.material.needsUpdate = true;
  }
  setOptions(s) {
    this.uniforms.photonCasEnabled.value = s.sharpening;
    this.uniforms.photonSharpness.value = s.sharpness;
    this.uniforms.photonInputGrade.value.set(
      s.brightness,
      s.contrast,
      s.saturation,
      s.whiteBalance,
    );
    this.uniforms.photonSelective.value.set(
      s.orangeSaturation,
      s.tealSaturation,
      s.greenSaturation,
      s.greenHue,
    );
    this.uniforms.photonWhiteBalance.value.copy(
      photonWhiteBalance(s.whiteBalance),
    );
  }
}
