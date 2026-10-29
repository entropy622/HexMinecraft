import {
  Color,
  DataUtils,
  HalfFloatType,
  LightProbe,
  LinearFilter,
  RepeatWrapping,
  ShaderMaterial,
  UniformsUtils,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const SUN_RADIUS = (2 * Math.PI) / 180;
export const SOLAR_IRRADIANCE = new Color(3.8, 3.7, 3.6);
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Independent spherical RGB transport, in kilometres. See the derivation and
// explicit approximation limits in docs/atmosphere-verification.md.
const transportGLSL = /* glsl */ `
const float SKY_PI = 3.14159265359;
const float SKY_RADIUS = 6371.0;
const float SKY_TOP = 6471.0;
const vec3 SKY_RAYLEIGH = vec3(0.005802, 0.013558, 0.033100);
const vec3 SKY_MIE = vec3(0.003996);
const vec3 SKY_OZONE = vec3(0.000650, 0.001881, 0.000085);
const vec3 SKY_SOLAR = vec3(${SOLAR_IRRADIANCE.toArray().join(', ')});
uniform sampler2D skyOpticalDepthMap;
uniform float skyObserverHeight;
uniform float skyAerosol;
uniform vec3 skySunDirection;
uniform float skyMoonIllumination;

vec3 skyDensity(float height) {
  height = max(0.0, height);
  return vec3(exp(-height / 8.0), exp(-height / 1.2),
    max(0.0, 1.0 - abs(height - 25.0) / 15.0));
}
vec3 skyExtinction(vec3 columns) {
  return SKY_RAYLEIGH * columns.x + SKY_MIE * skyAerosol * columns.y + SKY_OZONE * columns.z;
}
float skyBoundary(vec3 position, vec3 direction) {
  float r = length(position), b = dot(position, direction);
  float top = -b + sqrt(max(0.0, b * b + (SKY_TOP - r) * (SKY_TOP + r)));
  float ground = b * b - (r - SKY_RADIUS) * (r + SKY_RADIUS);
  if (b < 0.0 && ground >= 0.0) top = min(top, max(0.0, -b - sqrt(ground)));
  return top;
}
vec3 skyColumns(vec3 position, vec3 direction) {
  float r = length(position), mu = clamp(dot(position, direction) / r, -1.0, 1.0);
  vec2 unit = vec2(0.5 + 0.5 * sign(mu) * sqrt(abs(mu)),
    sqrt(clamp((r - SKY_RADIUS) / 100.0, 0.0, 1.0)));
  vec2 size = vec2(textureSize(skyOpticalDepthMap, 0));
  return textureLod(skyOpticalDepthMap, (0.5 + unit * (size - 1.0)) / size, 0.0).rgb;
}
vec3 skyLightTransmittance(vec3 position, vec3 direction, float angularRadius) {
  float r = length(position), mu = dot(position, direction) / r;
  float horizon = -sqrt(max(0.0, (r - SKY_RADIUS) * (r + SKY_RADIUS))) / r;
  float visibility = smoothstep(horizon - sin(angularRadius), horizon + sin(angularRadius), mu);
  if (visibility <= 0.0) return vec3(0.0);
  // A partially risen disk is seen through its visible arc, never through
  // the short path to the ground under its occluded centre.
  if (mu < horizon + 0.0001) {
    vec3 up = position / r, tangent = normalize(direction - up * mu);
    float visibleMu = horizon + 0.0001;
    direction = tangent * sqrt(max(0.0, 1.0 - visibleMu * visibleMu)) + up * visibleMu;
  }
  return exp(-skyExtinction(skyColumns(position, direction))) * visibility;
}
vec2 skyUv(vec3 direction) {
  float elevation = asin(clamp(direction.y, -1.0, 1.0));
  float azimuth = dot(direction.xz, direction.xz) < 1e-10 ? 0.0 : atan(direction.z, direction.x);
  return vec2(azimuth / (2.0 * SKY_PI) + 0.5,
    0.5 + 0.5 * sign(elevation) * sqrt(abs(elevation) / (0.5 * SKY_PI)));
}
vec3 skyDirection(vec2 uv) {
  float v = uv.y * 2.0 - 1.0, elevation = sign(v) * v * v * SKY_PI * 0.5;
  float azimuth = (uv.x - 0.5) * 2.0 * SKY_PI;
  return vec3(cos(azimuth) * cos(elevation), sin(elevation), sin(azimuth) * cos(elevation));
}
`;

export const skyRadianceGLSL = /* glsl */ `
${transportGLSL}
uniform sampler2D skyRadianceMap;
vec3 hexSkyRadiance(vec3 worldDirection) {
  vec2 uv = skyUv(normalize(worldDirection));
  // Terrain supplies the visible ground. Extend the air-side horizon behind
  // the finite streaming boundary, instead of displaying the SH ground model.
  uv.y = max(uv.y, 0.5);
  return textureLod(skyRadianceMap, uv, 0.0).rgb;
}
vec3 hexAirTransmittance(float worldDistance, vec3 worldDirection) {
  vec3 direction = normalize(worldDirection), position = vec3(0.0, SKY_RADIUS + skyObserverHeight, 0.0);
  // A visual world unit is 20 m; virtual cloud distance uses the same boundary.
  float distance = min(max(0.0, worldDistance) * 0.02, skyBoundary(position, direction));
  vec3 columns = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) / 8.0, b = float(i + 1) / 8.0;
    vec3 p = position + direction * distance * ((a * a + b * b) * 0.5);
    columns += skyDensity(length(p) - SKY_RADIUS) * ((b * b - a * a) * distance);
  }
  return exp(-skyExtinction(columns));
}
`;

function material(name, uniforms, fragmentShader) {
  return new ShaderMaterial({
    name,
    uniforms,
    vertexShader,
    fragmentShader: `varying vec2 vUv;\n${fragmentShader}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export class SkyAtmosphere {
  constructor() {
    this.probe = new LightProbe();
    this.zenith = new Color(0);
    this.horizon = new Color(0);
    this.sunTransmission = new Color(0);
    this.moonTransmission = new Color(0);
    this.targets = [];
    this.generation = 0;
    this.pending = null;
    this.uniforms = {
      skyOpticalDepthMap: { value: null },
      skyRadianceMap: { value: null },
      skyObserverHeight: { value: 0.2 },
      skyAerosol: { value: 1 },
      skySunDirection: { value: new Vector3(0, 1, 0) },
      skyMoonIllumination: { value: 1 },
    };
    this.work = UniformsUtils.clone(this.uniforms);
    this.optical = material(
      'SkyOpticalColumns',
      this.work,
      /* glsl */ `
      ${transportGLSL}
      void main() {
        vec2 unit = (gl_FragCoord.xy - 0.5) / (vec2(128.0, 64.0) - 1.0);
        float v = unit.x * 2.0 - 1.0, mu = sign(v) * v * v;
        vec3 position = vec3(0.0, SKY_RADIUS + max(0.001, unit.y * unit.y * 100.0), 0.0);
        vec3 direction = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
        float distance = skyBoundary(position, direction);
        vec3 columns = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          float a = float(i) / 64.0, b = float(i + 1) / 64.0;
          float stepLength = (b * b - a * a) * distance;
          vec3 p = position + direction * ((a * a + b * b) * 0.5 * distance);
          columns += skyDensity(length(p) - SKY_RADIUS) * stepLength;
        }
        gl_FragColor = vec4(columns, 1.0);
      }
    `,
    );
    this.scatter = material(
      'SkySphericalScattering',
      this.work,
      /* glsl */ `
      ${transportGLSL}
      float miePhase(float mu) {
        const float g = 0.8;
        return (1.0 - g * g) / (4.0 * SKY_PI * pow(max(0.001, 1.0 + g * g - 2.0 * g * mu), 1.5));
      }
      float sunMie(vec3 direction) {
        vec3 axis = normalize(cross(skySunDirection, abs(skySunDirection.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0)));
        vec3 other = cross(skySunDirection, axis);
        float radius = ${SUN_RADIUS} * 0.70710678, result = 0.0;
        for (int i = 0; i < 4; i++) {
          float a = (float(i) + 0.5) * 1.570796327;
          vec3 light = normalize(skySunDirection + radius * (cos(a) * axis + sin(a) * other));
          result += miePhase(dot(direction, light));
        }
        return result * 0.25;
      }
      void main() {
        vec3 direction = skyDirection(vUv);
        vec3 position = vec3(0.0, SKY_RADIUS + skyObserverHeight, 0.0);
        float distance = skyBoundary(position, direction), mu = dot(direction, skySunDirection);
        float rayleigh = 3.0 * (1.0 + mu * mu) / (16.0 * SKY_PI);
        float sunPhase = sunMie(direction), moonPhase = miePhase(-mu);
        vec3 moonIrradiance = SKY_SOLAR * vec3(0.72, 0.84, 1.0) * (0.015 + 0.025 * skyMoonIllumination);
        vec3 radiance = vec3(0.0), transmittance = vec3(1.0);
        for (int i = 0; i < 32; i++) {
          float a = float(i) / 32.0, b = float(i + 1) / 32.0;
          float stepLength = (b * b - a * a) * distance;
          vec3 p = position + direction * ((a * a + b * b) * 0.5 * distance);
          vec3 density = skyDensity(length(p) - SKY_RADIUS), extinction = skyExtinction(density);
          vec3 stepT = exp(-extinction * stepLength);
          vec3 sun = SKY_SOLAR * skyLightTransmittance(p, skySunDirection, ${SUN_RADIUS});
          vec3 moon = moonIrradiance * skyLightTransmittance(p, -skySunDirection, ${SUN_RADIUS});
          vec3 source = SKY_RAYLEIGH * density.x * rayleigh * (sun + moon);
          source += SKY_MIE * skyAerosol * density.y * 0.9 * (sun * sunPhase + moon * moonPhase);
          // Isotropic low-order return of the locally scattered irradiance.
          // This does not claim a full multiple-scattering solution or cloud GI.
          vec3 scatteredFraction = 1.0 - exp(-skyExtinction(vec3(density.xy * vec2(8.0, 1.2), 0.0)));
          source += (SKY_RAYLEIGH * density.x + SKY_MIE * skyAerosol * density.y * 0.9)
            * (sun + moon) * scatteredFraction * (0.5 / (4.0 * SKY_PI));
          radiance += transmittance * source * (1.0 - stepT) / max(extinction, vec3(1e-7));
          transmittance *= stepT;
        }
        // Fixed scattered-radiance calibration in the game's HDR working
        // scale. Direct surface irradiance and ground albedo keep their units.
        radiance *= 7.0 / 3.8;
        vec3 end = position + direction * distance;
        if (length(end) < SKY_RADIUS + 0.01) {
          vec3 up = normalize(end);
          vec3 ground = SKY_SOLAR * skyLightTransmittance(end, skySunDirection, ${SUN_RADIUS}) * max(0.0, dot(up, skySunDirection));
          ground += moonIrradiance * skyLightTransmittance(end, -skySunDirection, ${SUN_RADIUS}) * max(0.0, dot(up, -skySunDirection));
          radiance += transmittance * ground * vec3(0.16, 0.15, 0.12) / SKY_PI;
        }
        gl_FragColor = vec4(max(radiance, vec3(0.0)), 1.0);
      }
    `,
    );
    this.reduction = material(
      'SkySHProjection',
      this.work,
      /* glsl */ `
      ${skyRadianceGLSL}
      float basis(int index, vec3 d) {
        if (index == 0) return 0.282094792;
        if (index == 1) return 0.488602512 * d.y;
        if (index == 2) return 0.488602512 * d.z;
        if (index == 3) return 0.488602512 * d.x;
        if (index == 4) return 1.092548431 * d.x * d.y;
        if (index == 5) return 1.092548431 * d.y * d.z;
        if (index == 6) return 0.315391565 * (3.0 * d.z * d.z - 1.0);
        if (index == 7) return 1.092548431 * d.x * d.z;
        return 0.546274215 * (d.x * d.x - d.y * d.y);
      }
      void main() {
        int index = int(gl_FragCoord.x);
        vec3 result = vec3(0.0), origin = vec3(0.0, SKY_RADIUS + skyObserverHeight, 0.0);
        if (index < 9) {
          // Equal-solid-angle full-sphere quadrature, excluding the direct disks.
          for (int i = 0; i < 512; i++) {
            float y = 1.0 - 2.0 * (float(i / 32) + 0.5) / 16.0;
            float phi = (float(i - (i / 32) * 32) + 0.5) * (2.0 * SKY_PI / 32.0);
            vec3 d = vec3(cos(phi) * sqrt(1.0 - y * y), y, sin(phi) * sqrt(1.0 - y * y));
            // Irradiance still sees the complete environment, including ground.
            vec3 radiance = textureLod(skyRadianceMap, skyUv(d), 0.0).rgb;
            result += radiance * basis(index, d) * (4.0 * SKY_PI / 512.0);
          }
        } else if (index == 9) result = hexSkyRadiance(vec3(0,1,0));
        else if (index == 10) {
          // These directions already have known azimuths. Avoid a cos/sin ->
          // atan2 round trip at cardinal points, where ANGLE's approximation
          // warns about tiny constant terms added to its polynomial.
          float elevation = atan(0.04);
          float v = 0.5 + 0.5 * sqrt(elevation / (0.5 * SKY_PI));
          for (int i = 0; i < 32; i++) {
            vec2 uv = vec2(fract(0.5 + float(i) / 32.0), v);
            result += textureLod(skyRadianceMap, uv, 0.0).rgb / 32.0;
          }
        } else result = skyLightTransmittance(origin, index == 11 ? skySunDirection : -skySunDirection, ${SUN_RADIUS});
        gl_FragColor = vec4(result, 1.0);
      }
    `,
    );
    this.quad = new FullScreenQuad(this.optical);
  }

  allocate(renderer, quality) {
    const width = quality < 1 ? 96 : 192;
    if (this.targets[1]?.width === width) return;
    this.dispose();
    this.targets = [
      new WebGLRenderTarget(128, 64),
      new WebGLRenderTarget(width, width / 2),
      new WebGLRenderTarget(width, width / 2),
      new WebGLRenderTarget(13, 1),
    ];
    for (const target of this.targets) {
      target.depthBuffer = false;
      target.texture.type = HalfFloatType;
      target.texture.minFilter = target.texture.magFilter = LinearFilter;
      target.texture.generateMipmaps = false;
    }
    this.targets[1].texture.wrapS = this.targets[2].texture.wrapS =
      RepeatWrapping;
    this.uniforms.skyOpticalDepthMap.value = this.targets[0].texture;
    this.uniforms.skyRadianceMap.value = this.targets[1].texture;
    this.work.skyOpticalDepthMap.value = this.targets[0].texture;
    this.work.skyRadianceMap.value = this.targets[2].texture;
    const previous = renderer.getRenderTarget(),
      clear = renderer.getClearColor(new Color()),
      alpha = renderer.getClearAlpha();
    this.quad.material = this.optical;
    try {
      renderer.setRenderTarget(this.targets[0]);
      this.quad.render(renderer);
      renderer.setRenderTarget(this.targets[1]);
      renderer.setClearColor(0, 1);
      renderer.clear();
    } finally {
      renderer.setClearColor(clear, alpha);
      renderer.setRenderTarget(previous);
    }
  }

  async project(renderer) {
    const generation = this.generation,
      previous = renderer.getRenderTarget(),
      target = this.targets[3],
      data = new Uint16Array(target.width * 4);
    this.quad.material = this.reduction;
    try {
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
    await renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      target.width,
      1,
      data,
    );
    if (generation !== this.generation) return;
    const values = Array.from(data, DataUtils.fromHalfFloat);
    // Publish a complete snapshot. The displayed map and CPU lighting never
    // expose a newer, in-flight atmosphere while its SH still belongs to an old map.
    [this.targets[1], this.targets[2]] = [this.targets[2], this.targets[1]];
    this.uniforms.skyRadianceMap.value = this.targets[1].texture;
    this.work.skyRadianceMap.value = this.targets[2].texture;
    this.uniforms.skySunDirection.value.copy(this.work.skySunDirection.value);
    for (const name of [
      'skyObserverHeight',
      'skyAerosol',
      'skyMoonIllumination',
    ])
      this.uniforms[name].value = this.work[name].value;
    this.probe.sh.fromArray(
      values.flatMap((v, i) => (i < 36 && i % 4 < 3 ? [v] : [])),
    );
    this.zenith.fromArray(values, 36);
    this.horizon.fromArray(values, 40);
    this.sunTransmission.fromArray(values, 44);
    this.moonTransmission.fromArray(values, 48);
  }

  update(
    renderer,
    { direction, height, rain, moon, quality, active, time, dt },
  ) {
    this.probe.intensity = active ? 1 : 0;
    if (!active) {
      if (this.targets.length) this.dispose();
      return;
    }
    this.allocate(renderer, quality);
    if (
      this.lastTime !== null &&
      (time < this.lastTime - 1e-5 || time - this.lastTime > dt + 1e-5)
    ) {
      // Ordinary advancing time is coalesced, not cancelled. An explicit clock
      // discontinuity (save/load, jump or reset) invalidates the in-flight epoch.
      this.generation++;
      this.key = null;
      this.updated = null;
    }
    this.lastTime = time;
    const observerHeight = Math.max(0.02, Math.min(90, height * 0.02)),
      key = [
        ...direction.toArray().map((v) => Math.round(v * 500)),
        Math.round(observerHeight * 100),
        Math.round(rain * 100),
        moon,
      ].join(':');
    if (this.pending || this.key === key) return;
    const now = performance.now();
    if (this.updated !== null && now - this.updated < 250) return;
    this.key = key;
    this.updated = now;
    this.work.skySunDirection.value.copy(direction);
    this.work.skyObserverHeight.value = observerHeight;
    this.work.skyAerosol.value = 1 + rain * 5;
    this.work.skyMoonIllumination.value = moon;
    const previous = renderer.getRenderTarget(),
      generation = this.generation;
    this.quad.material = this.scatter;
    try {
      renderer.setRenderTarget(this.targets[2]);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
    const pending = this.project(renderer)
      .catch((error) => {
        if (
          generation === this.generation &&
          !renderer.getContext().isContextLost()
        )
          console.error('Sky lighting readback failed', error);
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null;
      });
    this.pending = pending;
  }

  dispose() {
    this.generation++;
    for (const target of this.targets) target.dispose();
    this.targets = [];
    this.uniforms.skyOpticalDepthMap.value = null;
    this.uniforms.skyRadianceMap.value = null;
    this.work.skyOpticalDepthMap.value = null;
    this.work.skyRadianceMap.value = null;
    this.pending = null;
    this.key = null;
    this.lastTime = null;
    this.updated = null;
    this.probe.sh.zero();
    for (const shader of [this.optical, this.scatter, this.reduction])
      shader.dispose();
    this.quad.dispose();
  }
}
