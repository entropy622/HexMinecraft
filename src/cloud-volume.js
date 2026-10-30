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
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { CLOUD_PLANET_RADIUS, cloudFieldGLSL } from './cloud-field.js';
import { skyRadianceGLSL } from './sky-transport.js';
import { cloudScatteringGLSL } from './cloud-scattering.js';
import { CloudCoverage } from './cloud-coverage.js';
import { cloudIntegralGLSL } from './cloud-integral.js';

const vertexShader = /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const volumeShader = /* glsl */ `
${cloudFieldGLSL}
${skyRadianceGLSL}
${cloudScatteringGLSL}
varying vec2 vUv;
uniform sampler2D sceneDepth;
uniform mat4 cloudInverseProjection, cloudCameraWorld;
uniform vec3 cloudAmbient, cloudDirect, cloudGround, cloudFogColor;
uniform float cloudPhase, cloudAlbedo;
layout(location = 0) out vec4 cloudColor;
layout(location = 1) out vec4 cloudData;
${cloudIntegralGLSL}
void main() {
  float depth = texture2D(sceneDepth, vUv).r;
  vec4 view = cloudInverseProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  view /= view.w;
  bool sky = depth >= 0.999999;
  float distance = sky ? cloudFar : length(view.xyz);
  vec3 origin = cloudCameraWorld[3].xyz;
  vec3 direction = normalize(mat3(cloudCameraWorld) * view.xyz);
  cloudColor = vec4(0.0, 0.0, 0.0, 1.0);
  // Negative scene distance means unoccluded sky, never a camera-far obstacle.
  cloudData = vec4(0.0, sky ? -1.0 : distance, 0.0, -1.0);
  if (distance < 0.8) return;
  // Eight offsets stratify the same shared integral over view history.
  float rank = mod(cloudPhase, 2.0) * 4.0 + mod(floor(cloudPhase * 0.5), 2.0) * 2.0 + floor(cloudPhase * 0.25);
  float jitter = fract(dot(gl_FragCoord.xy, vec2(0.754877666, 0.569840296)) + rank * 0.125);
  cloudColor=hexCloudRay(origin,direction,distance,jitter,cloudData.x,cloudData.w);
}
`;
// Resolve only the cloud integral. Terrain, sky and water never enter history.
const historyShader = /* glsl */ `
varying vec2 vUv;
uniform sampler2D currentCloud, currentData, previousCloud, previousData;
uniform mat4 cloudInverseProjection, cloudCameraWorld, cloudPreviousViewProjection;
uniform vec3 cloudPreviousPosition;
uniform vec2 cloudDeltaWind[3];
uniform bool cloudReady;
layout(location = 0) out vec4 resolvedCloud;
layout(location = 1) out vec4 resolvedData;
bool validCloudHistory(vec4 old, vec4 data, float expected) {
  // A partial cloud in front of an old obstacle cannot describe the full
  // integral exposed after its removal. Apparent distance alone is a mean,
  // so matching it does not prove that the integration limit stayed visible.
  return old.x > 0.0 && old.z >= 1.0 && old.w == data.w &&
    (old.y < 0.0) == (data.y < 0.0) &&
    (old.y < 0.0 || old.y + 0.25 >= expected) &&
    abs(old.x - expected) <= max(2.0, expected * 0.1);
}
vec4 cloudCubicWeights(float f) {
  float squared = f * f, cubed = squared * f;
  return vec4(-0.5 * f + squared - 0.5 * cubed,
    1.0 - 2.5 * squared + 1.5 * cubed,
    0.5 * f + 2.0 * squared - 1.5 * cubed,
    -0.5 * squared + 0.5 * cubed);
}
void main() {
  ivec2 size = textureSize(currentCloud, 0), pixel = ivec2(gl_FragCoord.xy);
  vec4 current = texelFetch(currentCloud, pixel, 0);
  vec4 data = texelFetch(currentData, pixel, 0);
  resolvedCloud = current;
  resolvedData = vec4(data.xy, 1.0, data.w);
  if (!cloudReady || data.x <= 0.0) return;
  vec4 view = cloudInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 direction = normalize(mat3(cloudCameraWorld) * view.xyz);
  vec2 wind = cloudDeltaWind[clamp(int(data.w + 0.5), 0, 2)];
  vec3 currentPosition = cloudCameraWorld[3].xyz + direction * data.x;
  vec3 position = currentPosition - vec3(wind.x, 0.0, wind.y);
  // Density uses world xz but a local tangent-plane altitude. Preserve that
  // altitude when mapping into the previous view's tangent plane and wind.
  vec2 currentOffset = currentPosition.xz - cloudCameraWorld[3].xz;
  vec2 previousOffset = position.xz - cloudPreviousPosition.xz;
  float radialY = currentPosition.y + ${CLOUD_PLANET_RADIUS.toFixed(1)};
  float delta = dot(currentOffset, currentOffset) - dot(previousOffset, previousOffset);
  position.y = currentPosition.y + delta / (sqrt(max(0.0, radialY * radialY + delta)) + radialY);
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
    vec4 old = texelFetch(previousData, p, 0);
    // Reject missing clouds and foreground that covered this cloud last frame.
    if (!validCloudHistory(old, data, expected)) continue;
    vec2 spatial = mix(1.0 - f, f, vec2(float(x), float(y)));
    float w = spatial.x * spatial.y;
    history += texelFetch(previousCloud, p, 0) * w;
    age += old.z * w; weights += w;
  }
  if (weights < 0.001) return;
  // Repeated bilinear reprojection diffuses cloud edges even at a static
  // camera. Cubic history preserves detail when the entire footprint agrees;
  // silhouettes, missing history and foreground retain the validated fallback.
  if (weights > 0.999) {
    vec4 wx = cloudCubicWeights(f.x), wy = cloudCubicWeights(f.y);
    vec4 cubic = vec4(0.0); bool complete = true;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
      ivec2 p = ivec2(base) + ivec2(x - 1, y - 1);
      if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, size))) { complete = false; continue; }
      if (!validCloudHistory(texelFetch(previousData, p, 0), data, expected)) { complete = false; continue; }
      cubic += texelFetch(previousCloud, p, 0) * wx[x] * wy[y];
    }
    if (complete) history = cubic * weights;
  }
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
    this.coverage = new CloudCoverage(cloudUniforms);
    this.phase = 0;
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
        cloudDeltaWind: {
          value: [new Vector2(), new Vector2(), new Vector2()],
        },
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
    this.coverage.reset();
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
        wind: [new Vector2(), new Vector2(), new Vector2()],
        layers: [new Vector4(), new Vector4(), new Vector4()],
        light: new Color(),
        direction: new Vector3(),
      };
      this.histories.set(source, state);
    }
    const c = this.camera,
      u = this.cloudUniforms,
      p = c.projectionMatrix.elements;
    this.light
      .copy(u.cloudAmbient.value)
      .add(u.cloudGround.value)
      .add(u.cloudFogColor.value)
      .add(u.cloudDirect.value)
      .multiplyScalar(u.cloudAlbedo.value);
    if (
      state.frames &&
      (c.position.distanceToSquared(state.position) > 36 ||
        Math.abs(c.quaternion.dot(state.rotation)) < Math.cos(Math.PI / 8) ||
        Math.abs(p[0] / state.scale.x - 1) > 0.06 ||
        Math.abs(p[5] / state.scale.y - 1) > 0.06 ||
        u.cloudLayerWind.value.some(
          (v, i) => v.distanceToSquared(state.wind[i]) > 4,
        ) ||
        u.cloudLayers.value.some(
          (v, i) =>
            Math.abs(v.y - state.layers[i].y) > 1 ||
            Math.abs(v.z - state.layers[i].z) > 0.04 ||
            Math.abs(v.w - state.layers[i].w) > 0.08,
        ) ||
        u.cloudSeedNoise.value.version !== state.noise ||
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
    h.cloudDeltaWind.value.forEach((v, i) =>
      v.subVectors(u.cloudLayerWind.value[i], state.wind[i]),
    );
    h.cloudReady.value = state.frames > 0;
    this.volume.uniforms.cloudPhase.value = this.phase;
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
      state.wind.forEach((v, i) => v.copy(u.cloudLayerWind.value[i]));
      state.layers.forEach((v, i) => v.copy(u.cloudLayers.value[i]));
      state.noise = u.cloudSeedNoise.value.version;
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
    this.coverage.dispose();
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
