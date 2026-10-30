import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function probePhotonGrading(g, colors, cases) {
  const r = g.renderer,
    pass = g.composer.effects.output,
    output = [],
    previous = {
      target: r.getRenderTarget(),
      viewport: r.getViewport(new THREE.Vector4()),
      exposure: r.toneMappingExposure,
      screen: pass.renderToScreen,
      texture: pass.uniforms.tDiffuse.value,
    },
    texture = new THREE.DataTexture(
      new Float32Array(colors.flatMap((c) => [...c, 0.37])),
      colors.length,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    ),
    target = new THREE.WebGLRenderTarget(colors.length, 1, {
      type: THREE.FloatType,
      depthBuffer: false,
    });
  texture.needsUpdate = true;
  pass.renderToScreen = false;
  try {
    for (const entry of cases) {
      // Isolate the pointwise grade; CAS's spatial output is tested separately.
      pass.setOptions({
        ...g.postOptions,
        ...entry.settings,
        sharpening: false,
      });
      r.toneMappingExposure = entry.exposure ?? 1;
      pass.render(r, target, { texture });
      const data = new Float32Array(colors.length * 4);
      r.readRenderTargetPixels(target, 0, 0, colors.length, 1, data);
      output.push(Array.from(data));
    }
  } finally {
    pass.setOptions(g.postOptions);
    pass.renderToScreen = previous.screen;
    pass.uniforms.tDiffuse.value = previous.texture;
    r.toneMappingExposure = previous.exposure;
    r.setRenderTarget(previous.target);
    r.setViewport(previous.viewport);
    target.dispose();
  }
  // Independent direct-render path, as used by balanced/fast quality. Exercise
  // real ShaderMaterial tone mapping + display conversion, not another manual
  // call to the output pass. No window or native pointer APIs are involved.
  const direct = new THREE.WebGLRenderer({
    canvas: document.createElement('canvas'),
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  direct.setPixelRatio(1);
  direct.setSize(colors.length, 1, false);
  direct.toneMapping = THREE.CustomToneMapping;
  direct.toneMappingExposure = 1;
  const material = new THREE.ShaderMaterial({
      uniforms: { source: { value: texture } },
      depthTest: false,
      depthWrite: false,
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=texture2D(source,vUv);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
    quad = new FullScreenQuad(material),
    data = new Uint8Array(colors.length * 4);
  try {
    quad.render(direct);
    const gl = direct.getContext();
    gl.readPixels(0, 0, colors.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return {
      output,
      direct: Array.from(data),
      gl: r.getContext().getError(),
      directGl: gl.getError(),
    };
  } finally {
    texture.dispose();
    material.dispose();
    quad.dispose();
    direct.dispose();
    direct.forceContextLoss();
  }
}
