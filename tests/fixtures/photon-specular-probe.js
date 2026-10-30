import {
  DataTexture,
  FloatType,
  GLSL3,
  NearestFilter,
  RawShaderMaterial,
  RGBAFormat,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { photonSpecularGLSL } from '../../src/photon-specular.js';
export function probePhotonSpecular(g, cases) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear;
  const input = new Float32Array(cases.length * 12);
  cases.forEach((s, i) =>
    input.set(
      [...s.albedo, s.mask, s.nl, s.nv, s.lv, s.lh, s.radius, 0, 0, 0],
      i * 12,
    ),
  );
  const texture = new DataTexture(
    input,
    3,
    cases.length,
    RGBAFormat,
    FloatType,
  );
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  const target = new WebGLRenderTarget(cases.length, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    mode = { value: 0 };
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { caseData: { value: texture }, mode },
    vertexShader:
      'precision highp float;in vec3 position;void main(){gl_Position=vec4(position,1.0);}',
    fragmentShader: /* glsl */ `precision highp float;uniform highp sampler2D caseData;uniform int mode;out vec4 result;
    ${photonSpecularGLSL}
    void main(){int index=int(gl_FragCoord.x);vec4 a=texelFetch(caseData,ivec2(0,index),0),b=texelFetch(caseData,ivec2(1,index),0);float radius=texelFetch(caseData,ivec2(2,index),0).x;
      PhotonSurfaceOptics optical=photonSurfaceOptics(a.rgb,a.a);
      if(mode==0)result=vec4(photonSurfaceHighlight(a.rgb,optical,b.x,b.y,b.z,b.w,radius),1.0);
      else result=vec4(optical.roughness,optical.f0,optical.metal,b.x>0.000001?photonSurfaceDiskNoH2(b.x,b.y,b.z,radius):0.0);
    }`,
  });
  const quad = new FullScreenQuad(material),
    output = [];
  try {
    r.autoClear = true;
    for (let i = 0; i < 2; i++) {
      mode.value = i;
      r.setRenderTarget(target);
      quad.render(r);
      const raw = new Float32Array(cases.length * 4);
      r.readRenderTargetPixels(target, 0, 0, cases.length, 1, raw);
      output.push(Array.from(raw));
    }
    return { output, gl: r.getContext().getError() };
  } finally {
    r.autoClear = auto;
    r.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
    texture.dispose();
  }
}
