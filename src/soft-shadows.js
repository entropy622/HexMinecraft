import { ShaderChunk, Vector3 } from 'three';

// Directional, orthographic PCSS. Depth is already linear in this projection;
// convert separations to world units before applying the visible disk's angle.
const pcss = /* glsl */ `
uniform vec3 softShadowFrustum;
uniform float softShadowAngle;
vec2 softShadowDisk(int i, int count, float angle) {
  float a = float(i) * 2.39996323 + angle;
  return vec2(cos(a), sin(a)) * sqrt((float(i) + 0.5) / float(count));
}
float softShadowDepth(sampler2D map, vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float z = texture2D(map, uv).r;
  #ifdef USE_REVERSED_DEPTH_BUFFER
    z = 1.0 - z;
  #endif
  return z;
}
float softShadowBilinear(sampler2D map, vec2 size, vec3 p, vec2 slope) {
  vec2 pixel = p.xy * size - 0.5, base = floor(pixel), f = fract(pixel);
  vec2 a = (base + 0.5) / size, b = a + 1.0 / size;
  vec2 uv[4];
  uv[0] = a; uv[1] = vec2(b.x, a.y); uv[2] = vec2(a.x, b.y); uv[3] = b;
  float samples[4];
  for (int i = 0; i < 4; i++)
    samples[i] = step(p.z + dot(slope, uv[i] - p.xy), softShadowDepth(map, uv[i]));
  return mix(mix(samples[0], samples[1], f.x), mix(samples[2], samples[3], f.x), f.y);
}
float getShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity,
  float shadowBias, float shadowRadius, vec4 shadowCoord) {
  vec3 p = shadowCoord.xyz / shadowCoord.w;
  #ifdef USE_REVERSED_DEPTH_BUFFER
    p.z = 1.0 - p.z;
  #endif
  if (p.z < 0.0 || p.z > 1.0 || any(lessThan(p.xy, vec2(0.0))) || any(greaterThan(p.xy, vec2(1.0)))) return 1.0;
  // Receiver-plane correction keeps a tilted floor out of its own search.
  vec3 dx = dFdx(p), dy = dFdy(p);
  float determinant = dx.x * dy.y - dx.y * dy.x;
  vec2 slope = abs(determinant) > 1e-10
    ? vec2(dx.z * dy.y - dy.z * dx.y, dy.z * dx.x - dx.z * dy.x) / determinant
    : vec2(0.0);
  slope = clamp(slope, vec2(-8.0), vec2(8.0));
  p.z += shadowBias;
  float texel = max(softShadowFrustum.x / shadowMapSize.x, softShadowFrustum.y / shadowMapSize.y);
  if (softShadowAngle < 0.0001)
    return mix(1.0, softShadowBilinear(shadowMap, shadowMapSize, p, slope), shadowIntensity);
  float search = clamp(p.z * softShadowFrustum.z * softShadowAngle, texel * 2.0, 2.0);
  float angle = fract(52.9829189 * fract(dot(floor(vLightPosition.xz * 32.0), vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float gap = p.z - softShadowDepth(shadowMap, p.xy);
  float sum = max(gap, 0.0), count = gap > 0.0 ? 1.0 : 0.0;
  for (int i = 0; i < 16; i++) {
    vec2 offset = softShadowDisk(i, 16, angle) * search / softShadowFrustum.xy;
    gap = p.z + dot(slope, offset) - softShadowDepth(shadowMap, p.xy + offset);
    if (gap > 0.0) { sum += gap; count += 1.0; }
  }
  if (count < 0.5) return 1.0;
  float radius = min(search, max(texel * 0.75, sum / count * softShadowFrustum.z * softShadowAngle));
  float shadow = 0.0;
  if (radius < texel * 1.5) shadow = softShadowBilinear(shadowMap, shadowMapSize, p, slope);
  else {
    for (int i = 0; i < 32; i++) {
      vec2 offset = softShadowDisk(i, 32, angle) * radius / softShadowFrustum.xy;
      shadow += step(p.z + dot(slope, offset), softShadowDepth(shadowMap, p.xy + offset));
    }
    shadow *= 1.0 / 32.0;
  }
  float edge = min(min(p.x, p.y), min(1.0 - p.x, 1.0 - p.y));
  shadow = mix(1.0, shadow, smoothstep(0.0, search / min(softShadowFrustum.x, softShadowFrustum.y), edge));
  return mix(1.0, shadow, shadowIntensity);
}
`;
// Preserve Three's PCF branch for Balanced. Only Light Effects uses raw depth.
const shadowChunk = ShaderChunk.shadowmap_pars_fragment.replace(
  /#else\s+float getShadow\( sampler2D shadowMap,[\s\S]*?(?=\n\t#if NUM_SUN_LIGHT_SHADOWS)/,
  `#else\n${pcss}\n#endif\n`,
);
if (shadowChunk === ShaderChunk.shadowmap_pars_fragment)
  throw Error('Three.js 的原始深度阴影分支发生变化，需更新接触软阴影接入。');

export class SoftShadows {
  constructor(light) {
    this.light = light;
    this.uniforms = {
      softShadowFrustum: { value: new Vector3() },
      softShadowAngle: { value: 0 },
    };
  }
  attach(scene, disk) {
    const c = this.light.shadow.camera;
    this.uniforms.softShadowFrustum.value.set(
      (c.right - c.left) / c.zoom,
      (c.top - c.bottom) / c.zoom,
      c.far - c.near,
    );
    this.uniforms.softShadowAngle.value = disk.visible
      ? disk.geometry.parameters.radius / disk.position.length()
      : 0;
    scene.traverseVisible((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!material?.userData.voxelLighting || material.userData.softShadows)
          continue;
        material.userData.softShadows = true;
        const previous = material.onBeforeCompile,
          key = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          Object.assign(shader.uniforms, this.uniforms);
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <shadowmap_pars_fragment>',
            shadowChunk,
          );
        };
        material.customProgramCacheKey = () =>
          key.call(material) + '-contact-shadows-v1';
        material.needsUpdate = true;
      }
    });
  }
}
