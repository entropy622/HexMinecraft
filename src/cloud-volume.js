import {
  Color,
  GLSL3,
  HalfFloatType,
  Matrix4,
  Quaternion,
  NearestFilter,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  Vector3,
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
uniform float cloudPhase;
layout(location = 0) out vec4 cloudColor;
layout(location = 1) out vec4 cloudData;
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
  cloudColor = vec4(0.0, 0.0, 0.0, 1.0);
  cloudData = vec4(0.0, distance, 0.0, 0.0);
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
  float apparentDistance = 0.0;
  float jitter = fract(dot(gl_FragCoord.xy, vec2(0.754877666, 0.569840296)) + cloudPhase * 0.618033989);
  float cosine = dot(direction, cloudLightDirection);
  float phase = phaseHG(cosine, 0.65) * 0.7 + phaseHG(cosine, -0.2) * 0.3;
  for (int i = 0; i < 24; i++) {
    vec3 position = origin + direction * (start + (float(i) + jitter) * stepLength);
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
    float weight = transmission * (1.0 - attenuation);
    scattering += weight * source;
    apparentDistance += weight * (start + (float(i) + jitter) * stepLength);
    transmission *= attenuation;
    if (transmission < 0.005) break;
  }
  cloudColor = vec4(scattering, transmission);
  cloudData.x = transmission < 0.9999 ? apparentDistance / (1.0 - transmission) : 0.0;
}
`;
// Resolve only the cloud integral. Terrain, sky and water never enter history.
const historyShader = /* glsl */ `
varying vec2 vUv;
uniform sampler2D currentCloud, currentData, previousCloud, previousData;
uniform mat4 cloudInverseProjection, cloudCameraWorld, cloudPreviousViewProjection;
uniform vec3 cloudPreviousPosition;
uniform vec2 cloudDeltaWind;
uniform bool cloudReady;
layout(location = 0) out vec4 resolvedCloud;
layout(location = 1) out vec4 resolvedData;
void main() {
  ivec2 size = textureSize(currentCloud, 0), pixel = ivec2(gl_FragCoord.xy);
  vec4 current = texelFetch(currentCloud, pixel, 0);
  vec2 data = texelFetch(currentData, pixel, 0).xy;
  resolvedCloud = current;
  resolvedData = vec4(data, 1.0, 0.0);
  if (!cloudReady || data.x <= 0.0) return;
  vec4 view = cloudInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 direction = normalize(mat3(cloudCameraWorld) * view.xyz);
  vec3 position = cloudCameraWorld[3].xyz + direction * data.x - vec3(cloudDeltaWind.x, 0.0, cloudDeltaWind.y);
  vec4 clip = cloudPreviousViewProjection * vec4(position, 1.0);
  vec2 uv = clip.xy / max(clip.w, 0.00001) * 0.5 + 0.5;
  if (clip.w <= 0.0 || any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return;
  float expected = length(position - cloudPreviousPosition);
  vec2 oldPixel = uv * vec2(size) - 0.5, base = floor(oldPixel), f = fract(oldPixel);
  vec4 history = vec4(0.0);
  float weights = 0.0, age = 0.0;
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    ivec2 p = ivec2(base) + ivec2(x, y);
    if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, size))) continue;
    vec3 old = texelFetch(previousData, p, 0).xyz;
    // Reject missing clouds and foreground that covered this cloud last frame.
    if (old.x <= 0.0 || old.z < 1.0 || old.y + 0.25 < expected || abs(old.x - expected) > max(2.0, expected * 0.1)) continue;
    vec2 spatial = mix(1.0 - f, f, vec2(float(x), float(y)));
    float w = spatial.x * spatial.y;
    history += texelFetch(previousCloud, p, 0) * w;
    age += old.z * w; weights += w;
  }
  if (weights < 0.001) return;
  vec4 lower = current, upper = current;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 neighbor = texelFetch(currentCloud, clamp(pixel + ivec2(x, y), ivec2(0), size - 1), 0);
    lower = min(lower, neighbor); upper = max(upper, neighbor);
  }
  age /= weights;
  history = clamp(history / weights, lower, upper);
  resolvedCloud = mix(current, history, min(0.9, age / (age + 1.0)) * weights);
  resolvedData.z = min(32.0, age + 1.0);
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
      count: 2,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    const shared = { sceneDepth: { value: null } };
    this.histories = new Map();
    this.light = new Color();
    this.volume = new ShaderMaterial({
      glslVersion: GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      fragmentShader: volumeShader,
      uniforms: {
        ...cloudUniforms,
        ...shared,
        cloudPhase: { value: 0 },
        cloudInverseProjection: { value: camera.projectionMatrixInverse },
        cloudCameraWorld: { value: camera.matrixWorld },
      },
    });
    this.resolve = new ShaderMaterial({
      glslVersion: GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      fragmentShader: historyShader,
      uniforms: {
        currentCloud: { value: this.target.texture },
        currentData: { value: this.target.textures[1] },
        previousCloud: { value: null },
        previousData: { value: null },
        cloudInverseProjection: this.volume.uniforms.cloudInverseProjection,
        cloudCameraWorld: this.volume.uniforms.cloudCameraWorld,
        cloudPreviousViewProjection: { value: null },
        cloudPreviousPosition: { value: null },
        cloudDeltaWind: { value: new Vector2() },
        cloudReady: { value: false },
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
  reset() {
    for (const state of this.histories.values()) state.frames = 0;
  }
  setSize(width, height) {
    this.target.setSize(
      Math.max(1, Math.ceil(width / 2)),
      Math.max(1, Math.ceil(height / 2)),
    );
    for (const state of this.histories.values()) {
      state.history.forEach((t) =>
        t.setSize(this.target.width, this.target.height),
      );
      state.frames = 0;
    }
    this.composite.uniforms.cloudResolution.value.set(
      this.target.width,
      this.target.height,
    );
  }
  render(renderer, source, work) {
    if (this.cloudUniforms.cloudVolumetric.value < 0.5) {
      this.reset();
      return;
    }
    let state = this.histories.get(source);
    if (!state) {
      state = {
        history: [this.target.clone(), this.target.clone()],
        frames: 0,
        viewProjection: new Matrix4(),
        position: new Vector3(),
        rotation: new Quaternion(),
        scale: new Vector2(),
        wind: new Vector2(),
        light: new Color(),
        direction: new Vector3(),
      };
      this.histories.set(source, state);
    }
    const c = this.camera,
      u = this.cloudUniforms,
      p = c.projectionMatrix.elements;
    this.light.copy(u.cloudAmbient.value).add(u.cloudDirect.value);
    if (
      state.frames &&
      (c.position.distanceToSquared(state.position) > 36 ||
        Math.abs(c.quaternion.dot(state.rotation)) < Math.cos(Math.PI / 8) ||
        Math.abs(p[0] / state.scale.x - 1) > 0.06 ||
        Math.abs(p[5] / state.scale.y - 1) > 0.06 ||
        u.cloudWind.value.distanceToSquared(state.wind) > 4 ||
        Math.abs(u.cloudHeight.value - state.height) > 1 ||
        Math.abs(u.cloudThreshold.value - state.threshold) > 0.04 ||
        u.cloudNoise.value.version !== state.noise ||
        (this.light.r - state.light.r) ** 2 +
          (this.light.g - state.light.g) ** 2 +
          (this.light.b - state.light.b) ** 2 >
          0.04 ||
        u.cloudLightDirection.value.dot(state.direction) < 0.995)
    )
      state.frames = 0;
    const [previous, next] = state.history;
    const h = this.resolve.uniforms;
    h.previousCloud.value = previous.texture;
    h.previousData.value = previous.textures[1];
    h.cloudPreviousViewProjection.value = state.viewProjection;
    h.cloudPreviousPosition.value = state.position;
    h.cloudDeltaWind.value.subVectors(u.cloudWind.value, state.wind);
    h.cloudReady.value = state.frames > 0;
    this.volume.uniforms.cloudPhase.value = state.frames % 8;
    const autoClear = renderer.autoClear,
      target = renderer.getRenderTarget();
    this.volume.uniforms.sceneDepth.value = source.depthTexture;
    this.composite.uniforms.sceneColor.value = source.texture;
    this.composite.uniforms.cloudBuffer.value = next.texture;
    this.composite.uniforms.cameraNear.value = c.near;
    this.composite.uniforms.cameraFar.value = c.far;
    try {
      renderer.autoClear = false;
      this.quad.material = this.volume;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
      this.quad.material = this.resolve;
      renderer.setRenderTarget(next);
      this.quad.render(renderer);
      this.quad.material = this.composite;
      renderer.setRenderTarget(work);
      this.quad.render(renderer);
      this.copy.uniforms.tDiffuse.value = work.texture;
      this.quad.material = this.copy;
      renderer.setRenderTarget(source);
      this.quad.render(renderer);
      state.history.reverse();
      state.frames++;
      state.viewProjection.multiplyMatrices(
        c.projectionMatrix,
        c.matrixWorldInverse,
      );
      state.position.copy(c.position);
      state.rotation.copy(c.quaternion);
      state.scale.set(p[0], p[5]);
      state.wind.copy(u.cloudWind.value);
      state.height = u.cloudHeight.value;
      state.threshold = u.cloudThreshold.value;
      state.noise = u.cloudNoise.value.version;
      state.light.copy(this.light);
      state.direction.copy(u.cloudLightDirection.value);
    } catch (error) {
      this.reset();
      throw error;
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }
  dispose() {
    this.target.dispose();
    for (const state of this.histories.values())
      state.history.forEach((t) => t.dispose());
    this.histories.clear();
    this.resolve.dispose();
    this.volume.dispose();
    this.composite.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
