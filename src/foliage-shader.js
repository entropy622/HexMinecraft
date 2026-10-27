import {
  Color,
  DoubleSide,
  MeshDepthMaterial,
  MeshLambertMaterial,
  RGBADepthPacking,
  Vector3,
} from 'three';
import { applySkylight } from './skylight.js';

export const foliageUniforms = () => ({
  leafTime: { value: 0 },
  leafWind: { value: 0 },
  leafSunDirection: { value: new Vector3(0, 1, 0) },
  leafSunColor: { value: new Color(0) },
  leafViewer: { value: new Vector3() },
});

// The nearest shadow depth bounds the actual light path. The existing optical
// volume then distinguishes leaf thickness from walls along that path; otherwise
// a nearby opaque roof would look like a thin, transmitting leaf.
const transmissionGLSL = /* glsl */ `
vec3 leafLightTransmission = vec3(1.0);
vec3 leafTransmittance(vec3 albedo) {
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0 && defined(SHADOWMAP_TYPE_BASIC)
    // Thickness uses the unoffset receiver. Ordinary shadow normal bias moves
    // the sample ray outside a leaf's cell and must not classify it as a wall.
    vec4 shadowPoint = softShadowMatrix * vec4(vLightPosition, 1.0);
    vec3 p = shadowPoint.xyz / shadowPoint.w;
    #ifdef USE_REVERSED_DEPTH_BUFFER
      p.z = 1.0 - p.z;
    #endif
    if (p.z < 0.0 || p.z > 1.0 || any(lessThan(p.xy, vec2(0.0))) || any(greaterThan(p.xy, vec2(1.0)))) return vec3(0.0);
    float depth = softShadowDepth(directionalShadowMap[0], p.xy);
    float reach = max(0.0, (p.z - depth) * softShadowFrustum.z);
    if (reach > 48.0) return vec3(0.0);
    vec3 start = vLightPosition + leafSunDirection * 0.015;
    // A shadow-casting slab, fence or model is opaque even when the volume
    // cannot represent its subcell silhouette. Probe just inside its front face.
    if (reach > 0.08) {
      ivec3 blocker = lightCell(start + leafSunDirection * max(0.0, reach - 0.05));
      if (!insideLightVolume(blocker) || mod(readLightCell(blocker).a, 16.0) != 12.0) return vec3(0.0);
    }
    float distance = 0.0, thickness = 0.06;
    bool complete = reach <= 0.001;
    for (int i = 0; i < 48; i++) {
      if (distance >= reach) { complete = true; break; }
      vec3 point = start + leafSunDirection * distance;
      ivec3 cell = lightCell(point);
      if (!insideLightVolume(cell)) return vec3(0.0);
      float medium = mod(readLightCell(cell).a, 16.0);
      if (medium < 11.5 || medium == 13.0) return vec3(0.0);
      float segment = min(reach - distance, lightCellExit(point, cell, leafSunDirection));
      if (medium == 12.0) thickness += segment;
      distance += segment + 0.002;
    }
    if (!complete && distance < reach) return vec3(0.0);
    float luminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    vec3 tint = clamp(albedo * inversesqrt(luminance + 0.0001), vec3(0.0), vec3(1.0));
    vec3 extinction = (vec3(1.0) - 0.75 * tint) * 1.6;
    return exp(-extinction * thickness);
  #else
    return vec3(0.0);
  #endif
}
`;

// World-space phases keep neighboring leaf faces and chunk seams together.
// Grass anchors at the integral ground height; full leaf blocks sway gently.
export function applyFoliageWind(material, uniforms, grass = false) {
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `uniform float leafTime; uniform float leafWind; uniform vec3 leafViewer;\n${material.isMeshDepthMaterial ? 'attribute float skylight;\n' : ''}` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vec3 leafWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        float leafGust = sin(leafWorld.x * 0.47 + leafWorld.z * 0.31 + leafTime * 1.1);
        float leafFlutter = sin(leafWorld.x * 1.37 - leafWorld.z * 0.81 + leafTime * 2.8 + leafWorld.y * 0.7);
        float leafAnchor = ${grass ? 'clamp(fract(position.y + 0.001) * 1.4, 0.0, 1.0)' : '1.0'};
        float leafShelter = 0.15 + 0.85 * sqrt(clamp(skylight, 0.0, 1.0));
        transformed.xz += vec2(leafGust + leafFlutter * 0.3, leafGust * 0.45 - leafFlutter * 0.2) * leafWind * leafAnchor * leafShelter;
        ${
          grass
            ? `vec2 leafToPlayer = leafViewer.xz - leafWorld.xz;
        float leafTouch = exp(-dot(leafToPlayer, leafToPlayer) * 3.0 - abs(leafWorld.y - leafViewer.y + 1.5) * 2.0);
        transformed.xz -= leafToPlayer * leafTouch * 0.22 * leafAnchor;`
            : ''
        }
        ${!material.isMeshDepthMaterial ? 'vLightPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''}
      `,
      );
  };
  material.customProgramCacheKey = () =>
    cacheKey + (grass ? '-grass-wind-v1' : '-leaf-wind-v1');
}

export function leafMaterials(atlas, weather, uniforms) {
  const material = new MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  applySkylight(material, weather);
  applyFoliageWind(material, uniforms);
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader =
      `uniform vec3 leafSunDirection; uniform vec3 leafSunColor;\n` +
      shader.fragmentShader
        .replace(
          '#include <shadowmap_pars_fragment>',
          '#include <shadowmap_pars_fragment>\n' + transmissionGLSL,
        )
        .replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          `getDirectionalLightInfo( directionalLight, directLight );
        leafLightTransmission = directLight.color / max(vec3(0.00001), directionalLight.color);`,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
        if (max(max(leafSunColor.r, leafSunColor.g), leafSunColor.b) > 0.00001 && vSkylight > 0.1) {
          float leafMu = dot(normalize(vLightPosition - cameraPosition), leafSunDirection);
          float leafPhase = 0.65 + 0.35 * 0.64 / pow(max(0.04, 1.36 - 1.2 * leafMu), 1.5);
          outgoingLight += diffuseColor.rgb * leafSunColor * leafPhase * clamp(leafLightTransmission, vec3(0.0), vec3(1.0)) * leafTransmittance(diffuseColor.rgb);
        }
        #include <opaque_fragment>
      `,
        );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + '-transmission-v2';
  const depth = new MeshDepthMaterial({
    map: atlas,
    depthPacking: RGBADepthPacking,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  applyFoliageWind(depth, uniforms);
  return { material, depth };
}
