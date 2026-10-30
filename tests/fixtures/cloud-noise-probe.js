import { FloatType, ShaderMaterial, Vector3, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudDetailGLSL } from '../../src/cloud-detail-data.js';

// Read the real production texture, including its atlas, repeat wrapping
// and trilinear filtering. No cloud material or production uniform is replaced.
export function readCloudDetail(graphics, points) {
  const renderer = graphics.renderer,
    target = new WebGLRenderTarget(points.length, 1, {
      type: FloatType,
      depthBuffer: false,
    }),
    material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        cloudWorley: { value: graphics.cloudSystem.worley },
        points: { value: points.map((p) => new Vector3(...p)) },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `uniform highp sampler3D cloudWorley;uniform vec3 points[${points.length}];
        ${cloudDetailGLSL}
        void main(){vec3 p=points[int(gl_FragCoord.x)];vec2 n=vec2(hexCloudDetail(p,0.0),hexCloudDetail(p,1.0));gl_FragColor=vec4(n,0,1);}`,
    }),
    quad = new FullScreenQuad(material),
    previous = renderer.getRenderTarget(),
    data = new Float32Array(points.length * 4);
  try {
    renderer.setRenderTarget(target);
    quad.render(renderer);
    renderer.readRenderTargetPixels(target, 0, 0, points.length, 1, data);
    return {
      values: Array.from(data),
      error: renderer.getContext().getError(),
    };
  } finally {
    renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}
