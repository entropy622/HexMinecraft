import { Matrix3, ShaderChunk, Vector4 } from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { photonGradingGLSL, photonWhiteBalance } from './photon-grading.js';

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
    this.uniforms.photonInputGrade = { value: new Vector4(1, 1, 1, 6500) };
    this.uniforms.photonSelective = { value: new Vector4(0, 0.1, 0, 0) };
    this.uniforms.photonWhiteBalance = { value: new Matrix3() };
    this.material.fragmentShader = /* glsl */ `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform vec4 photonInputGrade,photonSelective;
      uniform mat3 photonWhiteBalance;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      void main(){
        vec4 color=texture2D(tDiffuse,vUv);
        color.rgb=photonGrade(color.rgb*toneMappingExposure,photonInputGrade,photonSelective,photonWhiteBalance);
        #ifdef SRGB_TRANSFER
          color=sRGBTransferOETF(color);
        #endif
        gl_FragColor=color;
      }`;
  }
  setOptions(s) {
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
