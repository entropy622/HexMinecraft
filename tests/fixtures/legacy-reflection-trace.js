import { reflectionTraceGLSL } from '../../src/reflection-trace.js';
import { ShaderMaterial } from 'three';

// Controlled ablation: 0.105's 40+6 world-space traversal, with the CURRENT
// HDR mip/color/protection/shading path held fixed. This is not the old release.
const legacy = /* glsl */ `
vec3 legacyReflectionView(vec2 uv,float depth){vec4 p=wetInverse*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);return p.xyz/p.w;}
bool reflectionTrace(sampler2D depthMap,mat4 projection,vec3 origin,vec3 direction,
    float dither,int steps,int refinements,out vec3 hit){
  hit=vec3(0.0);float previous=0.035,travel=0.1;
  for(int i=0;i<40;i++){
    vec3 p=origin+direction*travel;if(p.z>=-0.08)break;
    vec4 clip=projection*vec4(p,1.0);vec2 uv=clip.xy/clip.w*0.5+0.5;
    if(any(lessThan(uv,vec2(0.002)))||any(greaterThan(uv,vec2(0.998))))break;
    float depth=textureLod(depthMap,uv,0.0).r;
    float gap=depth<0.999999?-p.z+legacyReflectionView(uv,depth).z:-10000.0;
    if(gap>0.0){
      float low=previous,high=travel;
      for(int j=0;j<6;j++){
        float mid=(low+high)*0.5;vec3 point=origin+direction*mid;
        vec4 projected=projection*vec4(point,1.0);vec2 sampleUv=projected.xy/projected.w*0.5+0.5;
        float d=textureLod(depthMap,sampleUv,0.0).r;
        float delta=d<0.999999?-point.z+legacyReflectionView(sampleUv,d).z:-10000.0;
        if(delta>0.0)high=mid;else low=mid;
      }
      p=origin+direction*high;clip=projection*vec4(p,1.0);uv=clip.xy/clip.w*0.5+0.5;
      depth=textureLod(depthMap,uv,0.0).r;gap=-p.z+legacyReflectionView(uv,depth).z;
      if(depth<0.999999&&gap<max(0.16,-p.z*0.015)){hit=vec3(uv,clip.z/clip.w*0.5+0.5);return true;}
      break;
    }
    previous=travel;travel+=0.1+travel*0.14;
  }
  return false;
}
`;

export function beginLegacyReflectionTrace() {
  if (window.__restoreLegacyReflectionTrace)
    throw Error('Legacy trace already installed');
  const pass = window.__hexwild.graphics.composer.effects.wet,
    original = pass.material;
  if (!original.fragmentShader.includes(reflectionTraceGLSL))
    throw Error('Production trace boundary changed');
  // Uniforms intentionally share the live frame targets; cloning render-
  // target textures is unsupported by Three and would invalidate this control.
  const material = new ShaderMaterial({
    name: 'ControlledLegacy40Reflection',
    uniforms: original.uniforms,
    defines: original.defines,
    vertexShader: original.vertexShader,
    fragmentShader: original.fragmentShader.replace(
      reflectionTraceGLSL,
      legacy,
    ),
    glslVersion: original.glslVersion,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  pass.material = material;
  pass.quad.material = material;
  window.__restoreLegacyReflectionTrace = () => {
    pass.material = original;
    pass.quad.material = original;
    material.dispose();
    delete window.__restoreLegacyReflectionTrace;
  };
  return true;
}
export function endLegacyReflectionTrace() {
  if (!window.__restoreLegacyReflectionTrace)
    throw Error('Legacy trace missing');
  window.__restoreLegacyReflectionTrace();
  return true;
}
