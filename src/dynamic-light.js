import { Data3DTexture, NearestFilter, Vector3 } from 'three';
import { axialToWorld } from './core.js';
import { voxelLightingChunk, visionUniforms } from './skylight.js';

// Packed RGBA8: RGB contain 0..15 block-light levels; alpha packs sky in
// its high nibble; low nibble is 0 for solid, 1..3 for liquids, 15 for air.
// This shares one small
// volume across every animated mesh, including those sharing a material.
const sampleShader = /* glsl */ `
uniform highp sampler3D entityLightVolume;
uniform vec3 entityLightOrigin;
uniform vec3 entityLightSize;
uniform float entityOutsideSky;
varying float vSkylight;
varying vec3 vBlockLight;

vec4 readEntityCell(ivec3 cell) {
  if (cell.x < 0) return vec4(0.0, 0.0, 0.0, 15.0);
  if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(entityLightSize))))
    return vec4(0.0, 0.0, 0.0, entityOutsideSky * 240.0 + 15.0);
  return floor(texelFetch(entityLightVolume, cell, 0) * 255.0 + 0.5);
}
vec4 decodeEntityLight(vec4 packedLight) {
  return vec4(packedLight.rgb, floor(packedLight.a / 16.0)) / 15.0;
}
void addEntitySample(ivec3 cell, float weight, inout vec4 total, inout float weights) {
  vec4 packedLight = readEntityCell(cell);
  // Solid cells never contribute to interpolation through a wall or floor.
  if (mod(packedLight.a, 16.0) < 0.5) return;
  total += decodeEntityLight(packedLight) * weight;
  weights += weight;
}
vec4 sampleEntityLight(vec3 worldPosition) {
  vec3 local = worldPosition - entityLightOrigin;
  vec2 axial = vec2(local.x / 1.7320508075688772 - local.z / 3.0, local.z * (2.0 / 3.0));
  vec3 cube = vec3(axial, -axial.x - axial.y);
  vec3 rounded = floor(cube + 0.5);
  vec3 error = abs(cube - rounded);
  if (error.x > error.y && error.x > error.z) rounded.x = -rounded.y - rounded.z;
  else if (error.y > error.z) rounded.y = -rounded.x - rounded.z;
  ivec3 nearest = ivec3(int(floor(local.y)), int(rounded.y), int(rounded.x));
  vec4 center = readEntityCell(nearest);
  if (mod(center.a, 16.0) < 0.5) return vec4(0.0);

  // Linear interpolation over the axial triangle and two vertical layers.
  // At most six transmitting cells participate; masked weights renormalize.
  ivec2 base = ivec2(floor(axial));
  vec2 f = fract(axial);
  ivec2 a, b, c;
  vec3 w;
  if (f.x + f.y <= 1.0) {
    a = base; b = base + ivec2(1, 0); c = base + ivec2(0, 1);
    w = vec3(1.0 - f.x - f.y, f.x, f.y);
  } else {
    a = base + ivec2(1, 1); b = base + ivec2(0, 1); c = base + ivec2(1, 0);
    w = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y);
  }
  float height = local.y - 0.5;
  int y = int(floor(height));
  float fy = fract(height);
  vec4 total = vec4(0.0);
  float weights = 0.0;
  addEntitySample(ivec3(y, a.y, a.x), w.x * (1.0 - fy), total, weights);
  addEntitySample(ivec3(y, b.y, b.x), w.y * (1.0 - fy), total, weights);
  addEntitySample(ivec3(y, c.y, c.x), w.z * (1.0 - fy), total, weights);
  addEntitySample(ivec3(y + 1, a.y, a.x), w.x * fy, total, weights);
  addEntitySample(ivec3(y + 1, b.y, b.x), w.y * fy, total, weights);
  addEntitySample(ivec3(y + 1, c.y, c.x), w.z * fy, total, weights);
  vec4 light = weights > 0.0001 ? total / weights : decodeEntityLight(center);
  return light * light;
}
`;

export class DynamicLight {
  constructor() {
    this.uniforms = {
      entityLightVolume: { value: null },
      entityLightOrigin: { value: new Vector3() },
      entityLightSize: { value: new Vector3() },
      entityOutsideSky: { value: 1 },
    };
  }

  upload(field) {
    const size = field.sky.length;
    const texture = this.uniforms.entityLightVolume.value;
    if (
      !texture ||
      texture.image.height !== field.depth ||
      texture.image.depth !== field.width
    ) {
      texture?.dispose();
      this.data = new Uint8Array(size * 4);
      const next = new Data3DTexture(this.data, 64, field.depth, field.width);
      next.magFilter = next.minFilter = NearestFilter;
      next.unpackAlignment = 1;
      this.uniforms.entityLightVolume.value = next;
    }
    for (let i = 0; i < size; i++) {
      this.data[i * 4] = field.rgb[0][i];
      this.data[i * 4 + 1] = field.rgb[1][i];
      this.data[i * 4 + 2] = field.rgb[2][i];
      this.data[i * 4 + 3] =
        field.sky[i] * 16 + (field.cost[i] < 16 ? field.medium[i] || 15 : 0);
    }
    const origin = axialToWorld(field.minQ, field.minR);
    this.uniforms.entityLightOrigin.value.set(origin.x, 0, origin.z);
    this.uniforms.entityLightSize.value.set(64, field.depth, field.width);
    this.uniforms.entityOutsideSky.value =
      field.world.dimension === 'nether' ? 0 : 1;
    this.uniforms.entityLightVolume.value.needsUpdate = true;
  }

  attach(scene) {
    scene.traverseVisible((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (
          !(material.isMeshLambertMaterial || material.isMeshPhongMaterial) ||
          material.userData.voxelLighting
        )
          continue;
        this.apply(material);
      }
    });
  }

  apply(material) {
    material.userData.voxelLighting = 'dynamic';
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      previous.call(material, shader);
      Object.assign(shader.uniforms, this.uniforms, visionUniforms);
      shader.vertexShader =
        sampleShader +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
        vec4 lightWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          lightWorldPosition = batchingMatrix * lightWorldPosition;
        #endif
        #ifdef USE_INSTANCING
          lightWorldPosition = instanceMatrix * lightWorldPosition;
        #endif
        lightWorldPosition = modelMatrix * lightWorldPosition;
        vec3 lightNormal = inverseTransformDirection(transformedNormal, viewMatrix);
        vec4 entityLight = sampleEntityLight(lightWorldPosition.xyz + lightNormal * 0.06 + vec3(0.0, 0.04, 0.0));
        vSkylight = entityLight.a;
        vBlockLight = entityLight.rgb;`,
        );
      shader.fragmentShader =
        `varying float vSkylight; varying vec3 vBlockLight; uniform float nightVision;\n` +
        shader.fragmentShader.replace(
          '#include <lights_fragment_begin>',
          voxelLightingChunk,
        );
    };
    material.customProgramCacheKey = () => 'hex-dynamic-volume-v1';
    material.needsUpdate = true;
  }
}
