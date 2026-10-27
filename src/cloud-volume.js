import {
  HalfFloatType,
  NearestFilter,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { cloudFieldGLSL } from './cloud-field.js';

const vertexShader = /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const volumeShader = /* glsl */ `
${cloudFieldGLSL}
varying vec2 vUv;
uniform sampler2D sceneDepth;
uniform mat4 cloudInverseProjection, cloudCameraWorld;
uniform vec3 cloudAmbient, cloudDirect;
float phaseHG(float cosine, float g) {
  return (1.0 - g * g) / (12.5663706 * pow(max(0.001, 1.0 + g * g - 2.0 * g * cosine), 1.5));
}
void main() {
  vec4 view = cloudInverseProjection * vec4(vUv * 2.0 - 1.0, texture2D(sceneDepth, vUv).r * 2.0 - 1.0, 1.0);
  view /= view.w;
  float distance = length(view.xyz);
  vec3 origin = cloudCameraWorld[3].xyz;
  vec3 direction = normalize(mat3(cloudCameraWorld) * view.xyz);
  float low = cloudBase, high = cloudBase + cloudHeight * 1.6;
  float start = 0.0, end = min(distance, cloudFar);
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  if (distance < 0.8) return;
  if (abs(direction.y) < 0.0001) {
    if (origin.y <= low || origin.y >= high) return;
  } else {
    float a = (low - origin.y) / direction.y, b = (high - origin.y) / direction.y;
    start = max(0.0, min(a, b)); end = min(end, max(a, b));
  }
  if (end <= start) return;
  float stepLength = (end - start) / 24.0;
  float transmission = 1.0;
  vec3 scattering = vec3(0.0);
  float cosine = dot(direction, cloudLightDirection);
  float phase = phaseHG(cosine, 0.65) * 0.7 + phaseHG(cosine, -0.2) * 0.3;
  for (int i = 0; i < 24; i++) {
    vec3 position = origin + direction * (start + (float(i) + 0.5) * stepLength);
    float fade = 1.0 - smoothstep(cloudFar * 0.72, cloudFar, length(position.xz - origin.xz));
    float density = hexCloudVolumeDensity(position) * fade;
    if (density < 0.0001) continue;
    float reach = min(48.0, max(0.0, (high - position.y) / max(0.04, cloudLightDirection.y)));
    float shadow = hexCloudExtinction * hexCloudOpticalDepth(position, cloudLightDirection, reach);
    float altitude = clamp((position.y - low) / (high - low), 0.0, 1.0);
    // Single scattering plus a reduced-extinction, isotropic bounce approximation.
    vec3 source = cloudAmbient * (0.3 + altitude * 0.7) +
      cloudDirect * (phase * exp(-shadow) + 0.28 * exp(-shadow * 0.35));
    float attenuation = exp(-hexCloudExtinction * density * stepLength);
    scattering += transmission * (1.0 - attenuation) * source;
    transmission *= attenuation;
    if (transmission < 0.005) break;
  }
  gl_FragColor = vec4(scattering, transmission);
}
`;
const compositeShader = /* glsl */ `
varying vec2 vUv;
uniform sampler2D sceneColor, sceneDepth, cloudBuffer;
uniform vec2 cloudResolution;
uniform float cameraNear, cameraFar;
float depthDistance(vec2 uv) {
  float d = texture2D(sceneDepth, uv).r;
  return cameraNear * cameraFar / (cameraFar + (cameraNear - cameraFar) * d);
}
void main() {
  vec2 p = vUv * cloudResolution - 0.5, base = floor(p), f = fract(p);
  float depth = depthDistance(vUv), weights = 0.0;
  vec4 cloud = vec4(0.0);
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec2 offset = vec2(float(x), float(y));
    vec2 uv = clamp((base + offset + 0.5) / cloudResolution, 0.5 / cloudResolution, 1.0 - 0.5 / cloudResolution);
    vec2 spatial = mix(1.0 - f, f, offset);
    float weight = spatial.x * spatial.y * exp(-abs(depthDistance(uv) - depth) / max(0.05, depth * 0.01));
    cloud += texture2D(cloudBuffer, uv) * weight; weights += weight;
  }
  cloud = weights > 0.0001 ? cloud / weights : vec4(0.0, 0.0, 0.0, 1.0);
  vec4 color = texture2D(sceneColor, vUv);
  // Alpha survives AO/air composition and marks moving clouds reactive for TAA.
  gl_FragColor = vec4(color.rgb * cloud.a + cloud.rgb, cloud.a);
}
`;

// Runs for both the main view and the current opaque water capture. Reuse the
// composer's work color; copy back without clearing or writing source depth.
export class CloudVolumePass {
  constructor(camera, cloudUniforms) {
    this.camera = camera;
    this.cloudUniforms = cloudUniforms;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    const shared = { sceneDepth: { value: null } };
    this.volume = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      fragmentShader: volumeShader,
      uniforms: {
        ...cloudUniforms,
        ...shared,
        cloudInverseProjection: { value: camera.projectionMatrixInverse },
        cloudCameraWorld: { value: camera.matrixWorld },
      },
    });
    this.composite = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      fragmentShader: compositeShader,
      uniforms: {
        ...shared,
        sceneColor: { value: null },
        cloudBuffer: { value: this.target.texture },
        cloudResolution: { value: new Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
      },
    });
    this.copy = new ShaderMaterial({
      uniforms: UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad();
  }
  setSize(width, height) {
    this.target.setSize(
      Math.max(1, Math.ceil(width / 2)),
      Math.max(1, Math.ceil(height / 2)),
    );
    this.composite.uniforms.cloudResolution.value.set(
      this.target.width,
      this.target.height,
    );
  }
  render(renderer, source, work) {
    if (this.cloudUniforms.cloudVolumetric.value < 0.5) return;
    const autoClear = renderer.autoClear,
      target = renderer.getRenderTarget();
    this.volume.uniforms.sceneDepth.value = source.depthTexture;
    this.composite.uniforms.sceneColor.value = source.texture;
    this.composite.uniforms.cameraNear.value = this.camera.near;
    this.composite.uniforms.cameraFar.value = this.camera.far;
    try {
      renderer.autoClear = false;
      this.quad.material = this.volume;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
      this.quad.material = this.composite;
      renderer.setRenderTarget(work);
      this.quad.render(renderer);
      this.copy.uniforms.tDiffuse.value = work.texture;
      this.quad.material = this.copy;
      renderer.setRenderTarget(source);
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }
  dispose() {
    this.target.dispose();
    this.volume.dispose();
    this.composite.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
