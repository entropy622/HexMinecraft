import {
  FloatType,
  GLSL3,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from '../../src/cloud-field.js';

// Find a real upper-deck shadow through a lower-deck opening. Selecting only
// the nearest visible cumulus bodies often puts every ground ray under opaque
// low cloud, which cannot establish whether the upper decks affect shadows.
export function probeCloudShadowGrid(graphics) {
  const size = 64,
    span = 512,
    center = new Vector2(
      graphics.camera.position.x,
      graphics.camera.position.z,
    ),
    renderer = graphics.renderer,
    target = new WebGLRenderTarget(size, size, {
      type: FloatType,
      depthBuffer: false,
    }),
    material = new ShaderMaterial({
      glslVersion: GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        ...graphics.cloudSystem.uniforms,
        probeCenter: { value: center },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${cloudFieldGLSL}
        uniform vec2 probeCenter;out vec4 transmission;
        void main(){
          vec2 p=probeCenter+(gl_FragCoord.xy/${size.toFixed(1)}-0.5)*${span.toFixed(1)};
          vec3 ground=vec3(p.x,10.0,p.y),t=vec3(1.0);
          for(int layer=0;layer<3;layer++){
            vec2 interval=hexCloudInterval(ground,cloudLightDirection,layer,cloudFar);
            if(interval.y>interval.x)t[layer]=exp(-20.0*cloudOptics[layer].x*
              hexCloudLayerOpticalDepth(ground+cloudLightDirection*interval.x,
                cloudLightDirection,interval.y-interval.x,layer,4));
          }
          transmission=vec4(t,cloudShade*smoothstep(0.04,0.18,cloudLightDirection.y));
        }`,
    }),
    quad = new FullScreenQuad(material),
    previous = renderer.getRenderTarget(),
    data = new Float32Array(size * size * 4);
  try {
    renderer.setRenderTarget(target);
    quad.render(renderer);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, data);
    let maximum = 0,
      witness = null;
    for (let i = 0; i < size * size; i++) {
      const t = Array.from(data.subarray(i * 4, i * 4 + 4)),
        upper = t[3] * t[0] * (1 - t[1] * t[2]);
      if (upper > maximum) {
        maximum = upper;
        witness = {
          point: [
            center.x + (((i % size) + 0.5) / size - 0.5) * span,
            10,
            center.y + ((Math.floor(i / size) + 0.5) / size - 0.5) * span,
          ],
          transmission: t,
        };
      }
    }
    return {
      size,
      span,
      maximum,
      witness,
      finite: data.every(Number.isFinite),
      gl: renderer.getContext().getError(),
    };
  } finally {
    renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}
