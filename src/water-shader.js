import { Color, Matrix4, Vector2 } from 'three';
import { WATER_EXTINCTION } from './fluids.js';
import { lightVolumeGLSL } from './light-volume-shader.js';

export const waterExtinctionGLSL = /* glsl */ `const vec3 waterExtinction = vec3(${WATER_EXTINCTION.join(',')});`;

// Surface misses and occupied-water integration use the same ambient source.
export const waterScatteringGLSL = /* glsl */ `
const vec3 waterScatterColor = vec3(0.1, 0.6, 0.8);
vec3 waterAmbientSource(vec3 horizon, float ambient, float sky, vec3 block) {
  return (horizon * ambient * sky * 0.35 + block * 0.9) * waterScatterColor;
}
`;

// The same refractive index governs viewed interfaces and sunlight caustics.
export const waterInterfaceGLSL = /* glsl */ `
const float waterIOR = 4.0 / 3.0;
float waterFresnel(float cosine, float eta) {
  float sinSquared = eta * eta * max(0.0, 1.0 - cosine * cosine);
  if (sinSquared >= 1.0) return 1.0;
  float transmitted = sqrt(max(0.0, 1.0 - sinSquared));
  float s = (eta * cosine - transmitted) / max(0.00001, eta * cosine + transmitted);
  float p = (cosine - eta * transmitted) / max(0.00001, cosine + eta * transmitted);
  return clamp(0.5 * (s * s + p * p), 0.0, 1.0);
}
`;

// One conservative slope field for the visible water and refracted sunlight.
export const waterWavesGLSL = /* glsl */ `
vec3 waterNormal(vec2 p, float time) {
  vec2 slope = vec2(0.92, 0.40) * (0.045 * cos(dot(p, vec2(3.0, 1.3)) + time * 1.5));
  slope += vec2(-0.33, 0.94) * (0.035 * cos(dot(p, vec2(-1.4, 4.0)) - time * 1.1));
  slope += vec2(0.82, -0.57) * (0.025 * cos(dot(p, vec2(7.4, -5.2)) + time * 1.8));
  return normalize(vec3(slope.x, 1.0, slope.y));
}
`;

// Current-frame view-space intersections. Opaque scene capture excludes water
// and first-person models, so reflected rays cannot sample their own surface.
const optics = /* glsl */ `
${waterExtinctionGLSL}
${waterScatteringGLSL}
${waterWavesGLSL}
${waterInterfaceGLSL}
${lightVolumeGLSL}
uniform sampler2D waterSceneColor;
uniform sampler2D waterSceneDepth;
uniform mat4 waterProjection;
uniform mat4 waterInverseProjection;
uniform vec2 waterResolution;
uniform float waterSceneReady;
vec3 waterView(vec2 uv, float depth) {
  vec4 p = waterInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
vec3 waterProject(vec3 p) {
  vec4 clip = waterProjection * vec4(p, 1.0);
  return vec3(clip.xy / max(clip.w, 0.0001) * 0.5 + 0.5, clip.w);
}
float waterBorder(vec2 uv) {
  float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
  return smoothstep(0.0, 0.065, edge);
}
vec4 waterTrace(vec3 origin, vec3 direction) {
  float previous = 0.06;
  float nearPlane = -waterView(vec2(0.5), 0.0).z;
  for (int i = 0; i < 32; i++) {
    float stepIndex = float(i);
    float distance = 0.12 + stepIndex * 0.16 + stepIndex * stepIndex * 0.035;
    vec3 p = origin + direction * distance;
    vec3 projected = waterProject(p);
    if (projected.z < nearPlane || waterBorder(projected.xy) <= 0.0) break;
    float depth = texture2D(waterSceneDepth, projected.xy).r;
    float delta = waterView(projected.xy, depth).z - p.z;
    if (depth < 0.999999 && delta >= 0.0) {
      float low = previous, high = distance;
      for (int j = 0; j < 5; j++) {
        float middle = (low + high) * 0.5;
        vec3 candidate = origin + direction * middle;
        vec3 uv = waterProject(candidate);
        float surface = waterView(uv.xy, texture2D(waterSceneDepth, uv.xy).r).z;
        if (surface >= candidate.z) high = middle; else low = middle;
      }
      vec3 hit = origin + direction * high;
      vec2 uv = waterProject(hit).xy;
      float hitDepth = texture2D(waterSceneDepth, uv).r;
      float error = waterView(uv, hitDepth).z - hit.z;
      // Reject depth discontinuities instead of stretching foreground objects.
      if (hitDepth < 0.999999 && error >= -0.02 && error < 0.18 + high * 0.012)
        return vec4(uv, high, waterBorder(uv));
      return vec4(0.0);
    }
    previous = distance;
  }
  // Sky pixels at the projected reflected direction contain the current sky and
  // celestial objects; off-screen directions use the analytic sky below.
  vec3 sky = waterProject(direction * 200.0);
  if (sky.z > nearPlane && waterBorder(sky.xy) > 0.0 && texture2D(waterSceneDepth, sky.xy).r >= 0.999999)
    return vec4(sky.xy, 58.0, waterBorder(sky.xy));
  return vec4(0.0);
}

// The post-process integrates eye -> interface. This is only the additional
// reflected segment; exposed source/flow heights come from the existing codec.
float waterReflectionLength(vec3 origin, vec3 direction, float distance) {
  float length = 0.0;
  distance = min(distance, 58.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) / 16.0, b = float(i + 1) / 16.0;
    float start = distance * a * a, end = distance * b * b;
    vec3 position = origin + direction * ((start + end) * 0.5);
    float height = lightWaterHeight(mod(readLightCell(lightCell(position)).a, 16.0));
    if (height <= 0.0) continue;
    float step = end - start;
    if (height < 0.999 && abs(direction.y) > 0.0001) {
      float low = (floor(position.y) - origin.y) / direction.y;
      float high = (floor(position.y) + height - origin.y) / direction.y;
      step = max(0.0, min(end, max(low, high)) - max(start, min(low, high)));
    } else if (fract(position.y) > height) continue;
    length += step;
  }
  return length;
}
`;

// Ripple normals share the unchanged physical liquid surface. The light-effects
// preset supplies an opaque color/depth capture; others approximate the environment.
export function shadeWater(material) {
  const uniforms = {
    waterTime: { value: 0 },
    waterSky: { value: new Color('#79b6ee') },
    waterHorizon: { value: new Color('#c2dbee') },
    waterAmbientScale: { value: 1 },
    waterSceneColor: { value: null },
    waterSceneDepth: { value: null },
    waterProjection: { value: new Matrix4() },
    waterInverseProjection: { value: new Matrix4() },
    waterResolution: { value: new Vector2(1, 1) },
    waterSceneReady: { value: 0 },
  };
  material.shininess = 110;
  material.specular.set('#a3d3e6');
  const lightShader = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    lightShader(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `varying vec3 waterPosition; varying vec3 waterBoundaryNormal; varying float waterTop;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        waterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        waterBoundaryNormal = normalize(mat3(modelMatrix) * normal);
        waterTop = max(0.0, normal.y);`,
      );
    shader.fragmentShader = `${optics}
      uniform float waterTime; uniform vec3 waterSky; uniform vec3 waterHorizon;
      uniform float waterAmbientScale;
      varying vec3 waterPosition; varying vec3 waterBoundaryNormal; varying float waterTop;\n${shader.fragmentShader}`
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Transparent DoubleSide draws can flip GL winding for the back pass.
        // Classify the physical interface from its unflipped world normal.
        bool waterEntering = dot(waterBoundaryNormal, cameraPosition - waterPosition) >= 0.0;
        vec3 waveNormal = waterNormal(waterPosition.xz, waterTime);
        vec2 wave = waveNormal.xz / max(waveNormal.y, 0.001);
        normal = normalize(normal + (viewMatrix * vec4(wave.x, 0.0, wave.y, 0.0)).xyz * waterTop * (waterEntering ? 1.0 : -1.0));`,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        vec3 viewDirection = normalize(cameraPosition - waterPosition);
        vec3 geometryFacing = normalize(waterBoundaryNormal) * (waterEntering ? 1.0 : -1.0);
        vec3 worldNormal = (waterTop > 0.5 ? waveNormal : normalize(waterBoundaryNormal)) * (waterEntering ? 1.0 : -1.0);
        if (dot(worldNormal, viewDirection) < 0.001) worldNormal = geometryFacing;
        float eta = waterEntering ? 1.0 / waterIOR : waterIOR;
        float fresnel = waterFresnel(clamp(dot(worldNormal, viewDirection), 0.0, 1.0), eta);
        vec3 reflectedDirection = reflect(-viewDirection, worldNormal);
        // Shading ripples do not displace the physical plane. Keep a
        // reflection on the incident side of the actual geometric boundary.
        reflectedDirection = normalize(reflectedDirection + geometryFacing * max(0.0, 0.015 - dot(reflectedDirection, geometryFacing)));
        vec3 reflectedSky = mix(waterHorizon, waterSky, clamp(reflectedDirection.y, 0.0, 1.0)) * vSkylight;
        vec3 scattering = waterAmbientSource(waterHorizon, waterAmbientScale, vSkylight, vBlockLight);
        if (waterSceneReady > 0.5 && (waterTop > 0.5 || !waterEntering)) {
          vec3 origin = -vViewPosition;
          vec3 faceNormal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
          vec4 reflection = waterTrace(origin + faceNormal * 0.035, (viewMatrix * vec4(reflectedDirection, 0.0)).xyz);
          vec3 reflectionColor = texture2D(waterSceneColor, reflection.xy).rgb;
          vec3 reflected;
          if (waterEntering) reflected = mix(reflectedSky, reflectionColor, reflection.a);
          else {
            // A water-side reflection never substitutes an air sky on a miss.
            if (texture2D(waterSceneDepth, reflection.xy).r >= 0.999999) reflection.a = 0.0;
            float length = reflection.a > 0.0 ? waterReflectionLength(waterPosition + worldNormal * 0.035, reflectedDirection, reflection.z) : 0.0;
            vec3 transmission = exp(-waterExtinction * length);
            reflected = mix(scattering, reflectionColor * transmission + scattering * (1.0 - transmission), reflection.a);
          }
          vec3 through;
          if (!waterEntering) {
            through = vec3(0.0);
            if (fresnel < 1.0) {
              vec3 exitDirection = refract(-viewDirection, worldNormal, eta);
              exitDirection = normalize(exitDirection - geometryFacing * max(0.0, 0.015 + dot(exitDirection, geometryFacing)));
              vec4 refraction = waterTrace(origin - faceNormal * 0.035, (viewMatrix * vec4(exitDirection, 0.0)).xyz);
              vec3 exitSky = mix(waterHorizon, waterSky, clamp(exitDirection.y, 0.0, 1.0)) * vSkylight;
              through = mix(exitSky, texture2D(waterSceneColor, refraction.xy).rgb, refraction.a);
            }
          } else {
            vec2 uv = gl_FragCoord.xy / waterResolution;
            float depth = texture2D(waterSceneDepth, uv).r;
            float thickness = clamp(length(waterView(uv, depth)) - length(origin), 0.0, 24.0);
            vec2 ripple = (viewMatrix * vec4(wave.x, 0.0, wave.y, 0.0)).xy;
            vec2 bend = ripple * vec2(waterProjection[0][0], waterProjection[1][1]) * min(thickness, 6.0) / max(length(origin), 1.0);
            vec2 refractedUV = clamp(uv + bend, 0.5 / waterResolution, 1.0 - 0.5 / waterResolution);
            // A refracted sample must stay behind the visible water surface.
            if (texture2D(waterSceneDepth, refractedUV).r <= gl_FragCoord.z) refractedUV = uv;
            float backDepth = texture2D(waterSceneDepth, refractedUV).r;
            thickness = clamp(length(waterView(refractedUV, backDepth)) - length(origin), 0.0, 24.0);
            vec3 transmission = exp(-waterExtinction * thickness);
            through = texture2D(waterSceneColor, refractedUV).rgb * transmission + scattering * (1.0 - transmission);
          }
          outgoingLight = mix(through, reflected, fresnel) + reflectedLight.directSpecular * fresnel;
          diffuseColor.a = 1.0;
        } else {
          float reflectionWeight = fresnel * (waterEntering ? waterTop : 1.0);
          outgoingLight = mix(outgoingLight, waterEntering ? reflectedSky : scattering, reflectionWeight);
          diffuseColor.a = mix(diffuseColor.a, 1.0, reflectionWeight);
        }
        #include <opaque_fragment>`,
      );
  };
  material.userData.skipOcclusion = true;
  material.customProgramCacheKey = () => 'hex-water-scene-optics-v5';
  return uniforms;
}
