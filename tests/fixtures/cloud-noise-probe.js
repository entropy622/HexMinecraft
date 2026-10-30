import {
  FloatType,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  RepeatWrapping,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudDetailGLSL } from '../../src/cloud-detail-data.js';
import { cloudCoverageNoiseGLSL } from '../../src/cloud-coverage-data.js';

export function readCloudCoverageNoise(graphics, points, sourceBytes) {
  // Independent source sampler: original 512² RGBA8 + linear/repeat, as in
  // Photon. Its hardware interpolation also has finite subtexel precision.
  const reference = new DataTexture(
    new Uint8Array(sourceBytes),
    512,
    512,
    RGBAFormat,
    UnsignedByteType,
  );
  reference.minFilter = reference.magFilter = LinearFilter;
  reference.wrapS = reference.wrapT = RepeatWrapping;
  reference.needsUpdate = true;
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
        cloudNoise: { value: null },
        probePacked: { value: 0 },
        points: { value: points.map((p) => new Vector2(...p)) },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: `uniform sampler2D cloudNoise;uniform float probePacked;uniform vec2 points[${points.length}];
        ${cloudCoverageNoiseGLSL}
        void main(){vec2 p=points[int(gl_FragCoord.x)];gl_FragColor=probePacked>0.5?hexPhotonCloudNoise(p):textureLod(cloudNoise,p,0.0);}`,
    }),
    quad = new FullScreenQuad(material),
    previous = renderer.getRenderTarget(),
    outputs = [];
  try {
    for (const texture of [
      reference,
      graphics.cloudSystem.noise,
      graphics.cloudSystem.uniforms.cloudNoise.value,
    ]) {
      material.uniforms.cloudNoise.value = texture;
      material.uniforms.probePacked.value = texture === reference ? 0 : 1;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      const data = new Float32Array(points.length * 4);
      renderer.readRenderTargetPixels(target, 0, 0, points.length, 1, data);
      outputs.push(Array.from(data));
    }
    return { outputs, error: renderer.getContext().getError() };
  } finally {
    renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
    reference.dispose();
  }
}

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
