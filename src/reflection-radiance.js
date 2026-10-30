import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Premultiplied validity prevents protected foreground colors from bleeding
// into a neighboring hit when the HDR pyramid is filtered.
export const reflectionColorGLSL = /* glsl */ `
vec4 filteredReflectionColor(sampler2D radiance,vec2 uv,float level){
  vec4 color=textureLod(radiance,uv,level);
  return vec4(color.rgb/max(color.a,0.00001),clamp(color.a,0.0,1.0));
}
`;

// One HDR copy of the existing frame, with standard GPU mip generation. No
// second geometry capture or temporal feedback from the composer's reuse.
export class ReflectionRadiance {
  constructor() {
    this.width = this.height = 1;
    this.target = null;
    this.material = new ShaderMaterial({
      uniforms: {
        sourceColor: { value: null },
        sourceProtection: { value: null },
        protectionReady: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:
        'uniform sampler2D sourceColor,sourceProtection;uniform float protectionReady;void main(){ivec2 p=ivec2(gl_FragCoord.xy);float valid=protectionReady>0.5?1.0-step(0.5,texelFetch(sourceProtection,p,0).r):1.0;gl_FragColor=vec4(texelFetch(sourceColor,p,0).rgb*valid,valid);}',
    });
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.target?.setSize(this.width, this.height);
  }
  update(renderer, source, protection = null) {
    this.target ??= new WebGLRenderTarget(this.width, this.height, {
      type: HalfFloatType,
      depthBuffer: false,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: true,
    });
    this.material.uniforms.sourceColor.value = source;
    this.material.uniforms.sourceProtection.value = protection;
    this.material.uniforms.protectionReady.value = protection ? 1 : 0;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    return this.target.texture;
  }
  release() {
    this.target?.dispose();
    this.target = null;
    this.material.uniforms.sourceColor.value = null;
    this.material.uniforms.sourceProtection.value = null;
    this.material.uniforms.protectionReady.value = 0;
  }
  dispose() {
    this.release();
    this.material.dispose();
    this.quad.dispose();
  }
}
