import { Color, Matrix4, Vector2 } from 'three';
import { WATER_EXTINCTION } from './fluids.js';

export const waterExtinctionGLSL = /* glsl */ `const vec3 waterExtinction = vec3(${WATER_EXTINCTION.join(',')});`;

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
${waterWavesGLSL}
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
        return vec4(texture2D(waterSceneColor, uv).rgb, waterBorder(uv));
      return vec4(0.0);
    }
    previous = distance;
  }
  // Sky pixels at the projected reflected direction contain the current sky and
  // celestial objects; off-screen directions use the analytic sky below.
  vec3 sky = waterProject(direction * 200.0);
  if (sky.z > nearPlane && waterBorder(sky.xy) > 0.0 && texture2D(waterSceneDepth, sky.xy).r >= 0.999999)
    return vec4(texture2D(waterSceneColor, sky.xy).rgb, waterBorder(sky.xy));
  return vec4(0.0);
}
`;

// Ripple normals share the unchanged physical liquid surface. The light-effects
// preset supplies an opaque color/depth capture; other presets use sky shading.
export function shadeWater(material) {
  const uniforms = {
    waterTime: { value: 0 },
    waterSky: { value: new Color('#79b6ee') },
    waterHorizon: { value: new Color('#c2dbee') },
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
      `varying vec3 waterPosition; varying float waterTop;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        waterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        waterTop = max(0.0, normal.y);`,
      );
    shader.fragmentShader = `${optics}
      uniform float waterTime; uniform vec3 waterSky; uniform vec3 waterHorizon;
      varying vec3 waterPosition; varying float waterTop;\n${shader.fragmentShader}`
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 waveNormal = waterNormal(waterPosition.xz, waterTime);
        vec2 wave = waveNormal.xz / max(waveNormal.y, 0.001);
        normal = normalize(normal + (viewMatrix * vec4(wave.x, 0.0, wave.y, 0.0)).xyz * waterTop);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        float fresnel = 0.0204 + 0.9796 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
        vec3 viewDirection = normalize(cameraPosition - waterPosition);
        vec3 worldNormal = waveNormal;
        vec3 reflectedDirection = reflect(-viewDirection, worldNormal);
        // Shading ripples do not displace the physical plane. Keep reflected
        // rays above that plane rather than incorrectly hitting the pool floor.
        reflectedDirection = normalize(vec3(reflectedDirection.x, max(0.015, reflectedDirection.y), reflectedDirection.z));
        vec3 reflectedSky = mix(waterHorizon, waterSky, clamp(reflectedDirection.y, 0.0, 1.0)) * vSkylight;
        if (waterSceneReady > 0.5 && waterTop > 0.5 && gl_FrontFacing) {
          vec3 origin = -vViewPosition;
          vec4 reflection = waterTrace(origin + normal * 0.035, (viewMatrix * vec4(reflectedDirection, 0.0)).xyz);
          vec3 reflected = mix(reflectedSky, reflection.rgb, reflection.a);
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
          vec3 scattering = vec3(0.025, 0.13, 0.15) * (0.08 + vSkylight * 0.92) + vBlockLight * 0.08;
          vec3 through = texture2D(waterSceneColor, refractedUV).rgb * transmission + scattering * (1.0 - transmission);
          outgoingLight = mix(through, reflected, fresnel) + reflectedLight.directSpecular * fresnel;
          diffuseColor.a = 1.0;
        } else {
          outgoingLight = mix(outgoingLight, reflectedSky, fresnel * waterTop);
          diffuseColor.a = min(0.97, diffuseColor.a + fresnel * waterTop);
        }
        #include <opaque_fragment>`,
      );
  };
  material.userData.skipOcclusion = true;
  material.customProgramCacheKey = () => 'hex-water-scene-optics-v4';
  return uniforms;
}
