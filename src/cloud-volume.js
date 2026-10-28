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
import { skyRadianceGLSL } from './sky-atmosphere.js';

const vertexShader = /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const volumeShader = /* glsl */ `
${cloudFieldGLSL}
${skyRadianceGLSL}
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
vec4 integrateLayer(vec3 origin, vec3 direction, vec2 span, int layer, float jitter, out float apparent) {
  apparent = 0.0;
  if (span.y <= span.x) return vec4(0.0, 0.0, 0.0, 1.0);
  float horizon = 1.0 - abs(direction.y);
  int steps = layer == 0 ? int(mix(24.0, 40.0, horizon)) : (layer == 1 ? int(mix(12.0, 20.0, horizon)) : 6);
  float stepLength = (span.y - span.x) / float(steps);
  float transmission = 1.0;
  vec3 scattering = vec3(0.0);
  float cosine = dot(direction, cloudLightDirection);
  float phase = phaseHG(cosine, 0.65) * 0.7 + phaseHG(cosine, -0.2) * 0.3;
  // Coverage above the current band approximates the upper deck's average
  // illumination loss. Visible layers and surface shadows use actual density.
  float upper = 1.0;
  for (int n = 0; n < 3; n++) if (n > layer) upper *= exp(-cloudLayers[n].z * (n == 1 ? 0.5 : 0.15));
  for (int i = 0; i < 40; i++) {
    if (i >= steps) break;
    float distance = span.x + (float(i) + jitter) * stepLength;
    vec3 position = origin + direction * distance;
    float fade = 1.0 - smoothstep(cloudFar * 0.72, cloudFar, length(position.xz - origin.xz));
    float density = hexCloudLayerDensity(position, layer) * fade;
    if (density < 0.0001) continue;
    vec2 lightSpan = hexCloudInterval(position, cloudLightDirection, layer, cloudFar);
    float shadow = hexCloudExtinction * hexCloudLayerOpticalDepth(position, cloudLightDirection, min(80.0, lightSpan.y), layer);
    float altitude = clamp((hexCloudAltitude(position) - cloudLayers[layer].x) / cloudLayers[layer].y, 0.0, 1.0);
    // Single scattering plus a reduced-extinction, isotropic bounce approximation.
    vec3 source = cloudAmbient * (0.3 + altitude * 0.7) +
      cloudDirect * upper * (phase * exp(-shadow) + 0.28 * exp(-shadow * 0.35));
    float attenuation = exp(-hexCloudExtinction * density * stepLength);
    float weight = transmission * (1.0 - attenuation);
    scattering += weight * source;
    apparent += weight * distance;
    transmission *= attenuation;
    if (transmission < 0.005) break;
  }
  apparent = transmission < 0.9999 ? apparent / (1.0 - transmission) : 0.0;
  return vec4(scattering, transmission);
}
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
  vec2 spans[3]; int order[3];
  for (int layer = 0; layer < 3; layer++) {
    spans[layer] = hexCloudInterval(origin, direction, layer, min(distance, cloudFar));
    order[layer] = layer;
  }
  // The camera may be below, inside, between or above the bands.
  for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++) {
    if (spans[order[b]].x > spans[order[b + 1]].x) {
      int swap = order[b]; order[b] = order[b + 1]; order[b + 1] = swap;
    }
  }
  float jitter = fract(dot(gl_FragCoord.xy, vec2(0.754877666, 0.569840296)) + cloudPhase * 0.618033989);
  for (int n = 0; n < 3; n++) {
    int layer = order[n];
    float apparent;
    vec4 integral = integrateLayer(origin, direction, spans[layer], layer, jitter, apparent);
    if (apparent <= 0.0) continue;
    // Transport each layer's premultiplied radiance through the same molecular
    // atmosphere as the visible sky. Air adds light only over cloud opacity;
    // cloud transmission still composites the already atmospheric background.
    vec3 airT = hexAirTransmittance(apparent, direction);
    integral.rgb = integral.rgb * airT + hexSkyRadiance(direction) * (1.0 - airT) * (1.0 - integral.a);
    if (cloudData.x <= 0.0) { cloudData.x = apparent; cloudData.w = float(layer); }
    cloudColor.rgb += cloudColor.a * integral.rgb;
    cloudColor.a *= integral.a;
    if (cloudColor.a < 0.005) break;
  }
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
    if (old.x <= 0.0 || old.z < 1.0 || old.w != data.w || (old.y >= 0.0 && old.y + 0.25 < expected) || abs(old.x - expected) > max(2.0, expected * 0.1)) continue;
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
    this.light.copy(u.cloudAmbient.value).add(u.cloudDirect.value);
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
    h.cloudDeltaWind.value.forEach((v, i) =>
      v.subVectors(u.cloudLayerWind.value[i], state.wind[i]),
    );
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
      state.wind.forEach((v, i) => v.copy(u.cloudLayerWind.value[i]));
      state.layers.forEach((v, i) => v.copy(u.cloudLayers.value[i]));
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
