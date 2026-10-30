import { FloatType, ShaderMaterial, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function probeCloudOptics(g) {
  const a = g.skyEnvironment.atmosphere,
    r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear;
  const target = new WebGLRenderTarget(3, 1, {
    type: FloatType,
    depthBuffer: false,
  });
  const material = new ShaderMaterial({
    uniforms: { cloudOptics: g.cloudSystem.uniforms.cloudOptics },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
    fragmentShader:
      'uniform vec4 cloudOptics[3];void main(){gl_FragColor=cloudOptics[int(gl_FragCoord.x)];}',
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new FullScreenQuad(material);
  try {
    r.autoClear = true;
    r.setRenderTarget(target);
    quad.render(r);
    const pixels = new Float32Array(12);
    r.readRenderTargetPixels(target, 0, 0, 3, 1, pixels);
    return {
      gpu: [...pixels],
      cpu: a.uniforms.cloudOptics.value.flatMap((v) => v.toArray()),
      work: a.work.cloudOptics.value.flatMap((v) => v.toArray()),
      sun: a.uniforms.skySunDirection.value.toArray(),
      workSun: a.work.skySunDirection.value.toArray(),
      pending: !!a.pending,
      shared: g.cloudSystem.uniforms.cloudOptics === a.uniforms.cloudOptics,
      isolated:
        a.work.cloudOptics.value !== a.uniforms.cloudOptics.value &&
        a.work.cloudOptics.value.every(
          (v, i) => v !== a.uniforms.cloudOptics.value[i],
        ),
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}
