import {
  DataUtils,
  HalfFloatType,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function readReflectionSky(g) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    original = g.composer.effects.wet.material,
    direction = { value: new Vector3() },
    target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    material = new ShaderMaterial({
      uniforms: { ...original.uniforms, skyProbeDirection: direction },
      vertexShader: original.vertexShader,
      fragmentShader:
        'uniform vec3 skyProbeDirection;\n' +
        original.fragmentShader.replace(
          /void main\s*\(\s*\)\s*\{/,
          'void main(){gl_FragColor=vec4(surfaceSky(normalize(skyProbeDirection),1.0),1.0);return;',
        ),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material),
    data = new Uint16Array(4),
    out = [];
  try {
    for (const vector of [
      [0, 1, 0],
      [1, 0.4, 0],
      [0, 0.1, 1],
      [0, -1, 0],
    ]) {
      direction.value.fromArray(vector).normalize();
      r.setRenderTarget(target);
      quad.render(r);
      r.readRenderTargetPixels(target, 0, 0, 1, 1, data);
      out.push({
        direction: direction.value.toArray(),
        rgb: Array.from(data.slice(0, 3), DataUtils.fromHalfFloat),
      });
    }
    return out;
  } finally {
    r.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}
