import {
  DataTexture,
  FloatType,
  RGBAFormat,
  NearestFilter,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { transportGLSL } from '../../src/sky-transport.js';
import { cloudWeatherAerialGLSL } from '../../src/cloud-integral.js';

// The production GLSL kernels, batched at the GPU input/output boundary.
export function probeWeatherColor(g, cases) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    input = new Float32Array(cases.length * 8);
  cases.forEach((s, i) =>
    input.set(
      [
        s.y || 0,
        s.snow || 0,
        s.precipitation ? 1 : 0,
        s.rain || 0,
        s.edge || 0,
        s.transmission ?? 0.25,
        s.aerial ? 1 : 0,
        s.empty ? 0 : 1,
      ],
      i * 8,
    ),
  );
  const data = new DataTexture(input, 2, cases.length, RGBAFormat, FloatType);
  data.minFilter = data.magFilter = NearestFilter;
  data.needsUpdate = true;
  const output = new WebGLRenderTarget(cases.length, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    material = new ShaderMaterial({
      uniforms: { cases: { value: data } },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${transportGLSL}\n${cloudWeatherAerialGLSL}
        uniform sampler2D cases;
        void main(){float row=(floor(gl_FragCoord.x)+0.5)/float(textureSize(cases,0).y);
          vec4 a=texture2D(cases,vec2(0.25,row)),b=texture2D(cases,vec2(0.75,row));
          vec3 value=b.z<0.5?photonWeatherColor(a.x,a.y,a.z>0.5):
            hexCloudWeatherAerial(vec3(0.3,0.6,0.9)*b.w,b.y,vec3(0.2,0.5,0.8),vec3(0.2,0.5,0.8),vec3(0.1,0.2,0.4),a.w,b.x);
          gl_FragColor=vec4(value,1);}`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material);
  try {
    r.autoClear = true;
    r.setRenderTarget(output);
    quad.render(r);
    const pixels = new Float32Array(cases.length * 4);
    r.readRenderTargetPixels(output, 0, 0, cases.length, 1, pixels);
    return { pixels: [...pixels], gl: r.getContext().getError() };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    quad.dispose();
    material.dispose();
    data.dispose();
    output.dispose();
  }
}
