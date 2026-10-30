import {
  DataTexture,
  FloatType,
  RGBAFormat,
  NearestFilter,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudScatteringGLSL } from '../../src/cloud-scattering.js';
import { transportGLSL } from '../../src/sky-transport.js';

export function probeCloudLighting(g, cases, lights) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear;
  const input = new Float32Array(cases.length * 16);
  cases.forEach((s, i) =>
    input.set(
      [
        s.layer,
        s.mu,
        s.opacity,
        s.density,
        ...s.depth,
        s.albedo,
        s.extinction,
        s.stratus,
        s.shadow,
        s.elevation,
        s.boost,
        0,
        0,
        0,
      ],
      i * 16,
    ),
  );
  const texture = new DataTexture(
    input,
    4,
    cases.length,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  const u = {
    ...g.skyEnvironment.uniforms,
    skySunDirection: { value: new Vector3() },
    skyAerosol: { value: 1 },
    skyMoonPhase: { value: 0 },
    probeCases: { value: texture },
    probeMode: { value: 0 },
    probeMu: { value: 0 },
    probeHeight: { value: 0 },
    probeMoon: { value: false },
    probeAlto: { value: false },
    probeCoverage: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms: u,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
    fragmentShader: `${transportGLSL}\n${cloudScatteringGLSL}
      uniform sampler2D probeCases;uniform int probeMode;
      uniform float probeMu,probeHeight,probeCoverage;uniform bool probeMoon,probeAlto;
      void main(){if(probeMode==1){gl_FragColor=vec4(photonCloudLight(probeMu,probeHeight,probeMoon)*(probeAlto?photonAltoLightBoost(probeCoverage):1.0),1);return;}
        int i=int(gl_FragCoord.x);vec4 a=texelFetch(probeCases,ivec2(0,i),0),
          b=texelFetch(probeCases,ivec2(1,i),0),c=texelFetch(probeCases,ivec2(2,i),0);
        float boost=texelFetch(probeCases,ivec2(3,i),0).x;
        vec2 value=hexCloudScatter(b.xyz,a.w,a.y,0.23,a.z,vec4(c.x,b.w,c.y,c.z),int(a.x),c.w,boost);
        gl_FragColor=vec4(value,0,1);}`,
  });
  const target = new WebGLRenderTarget(cases.length, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    quad = new FullScreenQuad(material);
  try {
    r.autoClear = true;
    r.setRenderTarget(target);
    quad.render(r);
    const kernels = new Float32Array(cases.length * 4);
    r.readRenderTargetPixels(target, 0, 0, cases.length, 1, kernels);
    u.probeMode.value = 1;
    const light = [];
    for (const s of lights) {
      u.skySunDirection.value.set(Math.sqrt(1 - s.sunY * s.sunY), s.sunY, 0);
      u.skyAerosol.value = 1 + 5 * s.rain;
      u.skyMoonPhase.value = s.phase;
      u.probeMu.value = s.mu;
      u.probeHeight.value = s.height;
      u.probeMoon.value = s.moonlit;
      u.probeAlto.value = s.layer === 1;
      u.probeCoverage.value = s.coverage || 0;
      quad.render(r);
      const rgb = new Float32Array(4);
      r.readRenderTargetPixels(target, 0, 0, 1, 1, rgb);
      light.push([...rgb].slice(0, 3));
    }
    return { kernels: [...kernels], light, gl: r.getContext().getError() };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    quad.dispose();
    material.dispose();
    texture.dispose();
    target.dispose();
  }
}
