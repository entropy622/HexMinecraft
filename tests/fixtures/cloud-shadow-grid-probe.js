import {
  FloatType,
  GLSL3,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudShadowGLSL } from '../../src/cloud-field.js';
import { CLOUD_SHADOW_EXTENT } from '../../src/cloud-shadow.js';

// Find a real upper-deck shadow through a lower-deck opening. Selecting only
// the nearest visible bodies or a small horizontal patch can miss every thin
// upper cloud. Inspect the prepared map's radial light plane, not a different
// full-ray optical-depth approximation.
export function probeCloudShadowGrid(graphics) {
  const size = 64,
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
      uniforms: graphics.cloudSystem.uniforms,
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `${cloudShadowGLSL}
        out vec4 transmission;
        void main(){
          vec2 p=gl_FragCoord.xy/${size.toFixed(1)}*2.0-1.0;
          float radius=length(p);
          if(radius>=0.97){transmission=vec4(1.0,1.0,1.0,0.0);return;}
          p*=${CLOUD_SHADOW_EXTENT.toFixed(1)}/(1.0-radius);
          vec3 origin=(cloudShadowInverse*vec4(p,1.0,1.0)).xyz;
          vec3 ground=origin+cloudLightDirection*((10.0-origin.y)/cloudLightDirection.y);
          transmission=vec4(hexCloudPreparedShadow(ground),hexCloudShadow(ground),hexCloudShadowWeight(ground));
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
        upper = t[3] * (t[1] - t[0]);
      if (upper > maximum) {
        maximum = upper;
        const x = (((i % size) + 0.5) / size) * 2 - 1,
          y = ((Math.floor(i / size) + 0.5) / size) * 2 - 1,
          extent = CLOUD_SHADOW_EXTENT / (1 - Math.hypot(x, y)),
          u = graphics.cloudSystem.uniforms,
          point = new Vector3(x * extent, y * extent, 1).applyMatrix4(
            u.cloudShadowInverse.value,
          );
        point.addScaledVector(
          u.cloudLightDirection.value,
          (10 - point.y) / u.cloudLightDirection.value.y,
        );
        witness = {
          point: point.toArray(),
          transmission: t,
        };
      }
    }
    return {
      size,
      projection: 'source radial light plane',
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
