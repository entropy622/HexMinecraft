import {
  HalfFloatType,
  Matrix4,
  NearestFilter,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from './cloud-field.js';
import { waterExtinctionGLSL } from './water-shader.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const volumeShader = /* glsl */ `
${cloudFieldGLSL}
${waterExtinctionGLSL}
uniform float waterCamera;
varying vec2 vUv;
uniform sampler2D sceneDepth;
uniform highp sampler2DShadow airShadow;
uniform mat4 airShadowMatrix;
uniform mat4 inverseProjection;
uniform mat4 airCameraWorld;
uniform vec3 airCameraPosition;
uniform float airShadowReady;
uniform vec2 fogResolution;
uniform highp sampler3D entityLightVolume;
uniform vec3 entityLightOrigin;
uniform vec3 entityLightSize;
uniform float entityOutsideSky;
uniform float airDensity;
uniform float airBaseHeight;
uniform float airFalloff;
uniform vec3 airHorizon;
uniform vec3 airSunColor;
uniform vec3 airSunDirection;
uniform float airSunPower;
uniform float airAmbient;
uniform float airTime;
const int AIR_STEPS = 24;

float airHash(vec2 p) {
  vec3 a = fract(vec3(p.xyx) * 0.1031);
  a += dot(a, a.yzx + 33.33);
  return fract((a.x + a.y) * a.z);
}
float airNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(airHash(cell), airHash(cell + vec2(1.0, 0.0)), f.x),
    mix(airHash(cell + vec2(0.0, 1.0)), airHash(cell + vec2(1.0)), f.x), f.y);
}
vec4 airVoxel(vec3 position) {
  vec3 local = position - entityLightOrigin;
  vec2 axial = vec2(local.x / 1.7320508075688772 - local.z / 3.0, local.z * (2.0 / 3.0));
  vec3 cube = vec3(axial, -axial.x - axial.y), rounded = floor(cube + 0.5);
  vec3 error = abs(cube - rounded);
  if (error.x > error.y && error.x > error.z) rounded.x = -rounded.y - rounded.z;
  else if (error.y > error.z) rounded.y = -rounded.x - rounded.z;
  ivec3 cell = ivec3(int(floor(local.y)), int(rounded.y), int(rounded.x));
  if (cell.x < 0) return vec4(0.0);
  if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(entityLightSize))))
    return vec4(0.0, 0.0, 0.0, entityOutsideSky * 240.0 + 15.0);
  return floor(texelFetch(entityLightVolume, cell, 0) * 255.0 + 0.5);
}
float airSunVisibility(vec3 position, float sky) {
  if (airShadowReady < 0.5) return sky;
  vec4 projected = airShadowMatrix * vec4(position, 1.0);
  vec3 p = projected.xyz / projected.w;
  if (p.z < 0.0 || p.z > 1.0) return sky;
  float edge = min(min(p.x, p.y), min(1.0 - p.x, 1.0 - p.y));
  float lit = texture(airShadow, vec3(p.xy, p.z - 0.0005));
  return mix(sky, lit * min(1.0, sky * 2.0), smoothstep(0.0, 0.08, edge));
}
void main() {
  float depth = texture2D(sceneDepth, vUv).x;
  vec4 viewEnd = inverseProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  viewEnd /= viewEnd.w;
  vec3 endPosition = (airCameraWorld * viewEnd).xyz;
  vec3 delta = endPosition - airCameraPosition;
  float distance = min(length(delta), 58.0);
  vec3 direction = normalize(delta);
  if (waterCamera > 0.5) {
    // Alpha carries occupied water length; the composite reconstructs RGB
    // transmission, keeping this shared half-resolution target at four channels.
    if (distance < 0.8) { gl_FragColor = vec4(0.0); return; }
    vec3 transmission = vec3(1.0), scattering = vec3(0.0);
    float waterLength = 0.0;
    float cosine = dot(direction, airSunDirection), g = 0.6;
    float phase = (1.0 - g * g) / pow(max(0.08, 1.0 + g * g - 2.0 * g * cosine), 1.5);
    float jitter = airHash(floor(vUv * fogResolution));
    float cloudSun = hexCloudShadow(airCameraPosition + direction * distance * 0.5);
    for (int i = 0; i < 32; i++) {
      // Quadratic intervals retain sub-cell precision close to a waterline,
      // while bounding long sky rays to the same 32 medium/shadow lookups.
      float a = float(i) / 32.0, b = float(i + 1) / 32.0;
      float start = distance * a * a, end = distance * b * b;
      vec3 position = airCameraPosition + direction * mix(start, end, jitter);
      vec4 packedLight = airVoxel(position);
      float medium = mod(packedLight.a, 16.0);
      if (medium < 0.5 || medium > 9.5) continue;
      float height = medium < 1.5 ? 1.0 : 0.92 - (medium - 2.0) * 0.085;
      float waterStep = end - start;
      if (height < 0.999 && abs(direction.y) > 0.0001) {
        float bottom = (floor(position.y) - airCameraPosition.y) / direction.y;
        float top = (floor(position.y) + height - airCameraPosition.y) / direction.y;
        waterStep = max(0.0, min(end, max(bottom, top)) - max(start, min(bottom, top)));
      } else if (fract(position.y) > height) continue;
      float sky = pow(floor(packedLight.a / 16.0) / 15.0, 2.0);
      vec3 block = pow(packedLight.rgb / 15.0, vec3(2.0));
      float sun = airSunVisibility(position, sky) * cloudSun;
      vec2 beam = position.xz - position.y * airSunDirection.xz / max(0.15, airSunDirection.y);
      float shafts = 0.35 + 1.3 * smoothstep(0.4, 0.72, airNoise(beam * 0.45 + vec2(airTime * 0.06, -airTime * 0.04)));
      vec3 source = (airHorizon * airAmbient * sky * 0.35 + block * 0.9 +
        airSunColor * airSunPower * sun * (0.06 + phase * 0.12) * shafts) * vec3(0.1, 0.6, 0.8);
      vec3 stepTransmission = exp(-waterExtinction * waterStep);
      scattering += transmission * (1.0 - stepTransmission) * source;
      transmission *= stepTransmission;
      waterLength += waterStep;
    }
    gl_FragColor = vec4(scattering, waterLength);
    return;
  }
  // First-person models and nearby surfaces stay crisp.
  if (distance < 0.8 || airDensity <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float stepLength = distance / float(AIR_STEPS);
  // Spatially fixed dither avoids a temporally crawling grain pattern.
  float jitter = airHash(floor(vUv * fogResolution));
  float cosine = dot(direction, airSunDirection);
  float g = 0.55;
  float phase = (1.0 - g * g) / pow(max(0.08, 1.0 + g * g - 2.0 * g * cosine), 1.5);
  vec3 scattering = vec3(0.0);
  float transmission = 1.0;
  // One cloud-field sample per ray keeps the half-resolution fog pass bounded.
  float cloudSun = hexCloudShadow(airCameraPosition + direction * distance * 0.5);
  for (int i = 0; i < AIR_STEPS; i++) {
    float t = (float(i) + jitter) * stepLength;
    vec3 position = airCameraPosition + direction * t;
    vec4 packedLight = airVoxel(position);
    float medium = mod(packedLight.a, 16.0);
    // Only code 15 is air; water height codes and other liquids do not scatter air.
    if (medium < 14.5) continue;
    float sky = pow(floor(packedLight.a / 16.0) / 15.0, 2.0);
    vec3 block = pow(packedLight.rgb / 15.0, vec3(2.0));
    float density = airDensity * exp(clamp(-(position.y - airBaseHeight) * airFalloff, -8.0, 1.4));
    density *= 0.65 + airNoise(position.xz * 0.09 + vec2(airTime * 0.018, -airTime * 0.012)) * 0.7;
    float attenuation = exp(-density * stepLength);
    float sun = airSunVisibility(position, sky) * cloudSun;
    // Sealed caverns scatter local lights without inheriting outdoor sky blue.
    vec3 source = mix(vec3(0.003, 0.004, 0.005), airHorizon * airAmbient, sky) + block * 0.85 +
      airSunColor * airSunPower * sun * (0.12 + phase * 0.18);
    scattering += transmission * (1.0 - attenuation) * source;
    transmission *= attenuation;
  }
  gl_FragColor = vec4(scattering, transmission);
}
`;
const compositeShader = /* glsl */ `
${waterExtinctionGLSL}
uniform float waterCamera;
varying vec2 vUv;
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D fogBuffer;
uniform vec2 fogResolution;
uniform float cameraNear;
uniform float cameraFar;
float depthDistance(vec2 uv) {
  float depth = texture2D(sceneDepth, uv).x;
  return cameraNear * cameraFar / (cameraFar + (cameraNear - cameraFar) * depth);
}
void addFogSample(vec2 uv, float spatial, float centerDepth, inout vec4 fog, inout float weights) {
  float weight = spatial * exp(-abs(depthDistance(uv) - centerDepth) / max(0.2, centerDepth * 0.025));
  fog += texture2D(fogBuffer, uv) * weight;
  weights += weight;
}
void main() {
  vec2 position = vUv * fogResolution - 0.5;
  vec2 base = floor(position), f = fract(position);
  float centerDepth = depthDistance(vUv);
  vec4 fog = vec4(0.0);
  float weights = 0.0;
  if (waterCamera > 0.5) {
    // Water extinction exposes ray/voxel/shadow jitter much more than thin air.
    // Filter the volume, keeping the scene texture and depth silhouettes crisp.
    vec2 center = floor(position + 0.5);
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec2 pixel = center + vec2(float(x), float(y)), delta = pixel - position;
      vec2 uv = clamp((pixel + 0.5) / fogResolution, 0.5 / fogResolution, 1.0 - 0.5 / fogResolution);
      addFogSample(uv, exp(-dot(delta, delta) * 0.35), centerDepth, fog, weights);
    }
  } else {
    for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 uv = (base + offset + 0.5) / fogResolution;
      vec2 spatial = mix(1.0 - f, f, offset);
      addFogSample(uv, spatial.x * spatial.y, centerDepth, fog, weights);
    }
  }
  fog = weights > 0.0001 ? fog / weights : vec4(0.0, 0.0, 0.0, waterCamera > 0.5 ? 0.0 : 1.0);
  vec4 color = texture2D(sceneColor, vUv);
  vec3 transmission = waterCamera > 0.5 ? exp(-waterExtinction * max(0.0, fog.a)) : vec3(fog.a);
  gl_FragColor = vec4(color.rgb * transmission + fog.rgb, color.a);
}
`;

export class AtmospherePass extends Pass {
  constructor(
    camera,
    sun,
    atmosphere,
    lightUniforms,
    sceneFrame,
    cloudUniforms = {},
  ) {
    super();
    this.camera = camera;
    this.sun = sun;
    this.sceneFrame = sceneFrame;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    const shared = {
      sceneDepth: { value: null },
      fogResolution: { value: new Vector2(1, 1) },
    };
    this.volume = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        ...atmosphere.uniforms,
        ...lightUniforms,
        ...cloudUniforms,
        ...shared,
        airShadow: { value: null },
        airShadowMatrix: { value: new Matrix4() },
        airShadowReady: { value: 0 },
        inverseProjection: { value: camera.projectionMatrixInverse },
      },
      vertexShader,
      fragmentShader: volumeShader,
    });
    this.composite = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        ...shared,
        waterCamera: atmosphere.uniforms.waterCamera,
        sceneColor: { value: null },
        fogBuffer: { value: this.target.texture },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
      },
      vertexShader,
      fragmentShader: compositeShader,
    });
    this.quad = new FullScreenQuad();
  }

  setSize(width, height) {
    const w = Math.max(1, Math.ceil(width / 2)),
      h = Math.max(1, Math.ceil(height / 2));
    this.target.setSize(w, h);
    this.volume.uniforms.fogResolution.value.set(w, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.volume.uniforms;
    u.sceneDepth.value = this.sceneFrame.depthTexture;
    u.airShadow.value = this.sun.shadow.map?.depthTexture || null;
    u.airShadowMatrix.value.copy(this.sun.shadow.matrix);
    u.airShadowReady.value =
      renderer.shadowMap.enabled && u.airShadow.value && u.airSunPower.value > 0
        ? 1
        : 0;
    this.composite.uniforms.sceneColor.value = readBuffer.texture;
    this.composite.uniforms.cameraNear.value = this.camera.near;
    this.composite.uniforms.cameraFar.value = this.camera.far;
    this.quad.material = this.volume;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.volume.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
