import * as THREE from 'three';
import { BLOCKS, axialToWorld } from './core.js';
import { buildingParts } from './building-shapes.js';
import { cutItemWorld } from './cut-blocks.js';
import { isGlass } from './dye-data.js';
import {
  surfaceOpticsClass,
  reflectiveSurfaceClass,
} from './surface-optics.js';

// Held blocks and loose items must select the same real partial-block model.
export const usesBuildingItemMesh = (type) =>
  isGlass(type) ||
  [
    'flower',
    'vine',
    'cactus',
    'slab',
    'carpet',
    'stairs',
    'egg',
    'rod',
    'chorus',
    'chorusFlower',
    'fence',
    'gate',
    'trapdoor',
    'campfire',
    'stonecutter',
    'lever',
    'button',
    'pressurePlate',
    'redstoneTorch',
    'repeater',
    'comparator',
    'hopper',
    'dropper',
    'observer',
    'cauldron',
    'cobweb',
    'sporeBlossom',
    'pointedDripstone',
    'piston',
  ].includes(BLOCKS[type]?.shape);

function polygonPrism(part) {
  const positions = [],
    uv = [],
    polygon = part.polygon;
  const low = -part.h / 2,
    high = part.h / 2,
    scale = part.topScale ?? 1;
  const triangle = (points, tex) => {
    points.forEach((p, i) => {
      positions.push(...p);
      uv.push(...tex[i]);
    });
  };
  for (let i = 1; i < polygon.length - 1; i++) {
    const tri = [polygon[0], polygon[i], polygon[i + 1]];
    if (!part.plane)
      triangle(
        [...tri].reverse().map(([x, z]) => [x * scale, high, z * scale]),
        [...tri].reverse().map(([x, z]) => [(x + 1) / 2, (z + 1) / 2]),
      );
    triangle(
      tri.map(([x, z]) => [x, part.plane ? 0 : low, z]),
      tri.map(([x, z]) => [(x + 1) / 2, (z + 1) / 2]),
    );
  }
  for (let i = 0; !part.plane && i < polygon.length; i++) {
    const start = polygon[i],
      end = polygon[(i + 1) % polygon.length];
    const total = Math.hypot(start[0] - end[0], start[1] - end[1]);
    const segments = Math.ceil(total - 1e-6);
    for (let segment = 0; segment < segments; segment++) {
      const a = [
        start[0] + ((end[0] - start[0]) * segment) / segments,
        start[1] + ((end[1] - start[1]) * segment) / segments,
      ];
      const b = [
        start[0] + ((end[0] - start[0]) * (segment + 1)) / segments,
        start[1] + ((end[1] - start[1]) * (segment + 1)) / segments,
      ];
      const points = [
        [a[0], low, a[1]],
        [a[0] * scale, high, a[1] * scale],
        [b[0] * scale, high, b[1] * scale],
        [b[0], low, b[1]],
      ];
      const width = part.uvFull ? 1 : Math.hypot(a[0] - b[0], a[1] - b[1]);
      const tex = [
        [0, part.uvFull ? 0 : 1 - (part.y + low)],
        [0, part.uvFull ? 1 : 1 - (part.y + high)],
        [width, part.uvFull ? 1 : 1 - (part.y + high)],
        [width, part.uvFull ? 0 : 1 - (part.y + low)],
      ];
      triangle([points[0], points[1], points[2]], [tex[0], tex[1], tex[2]]);
      triangle([points[0], points[2], points[3]], [tex[0], tex[2], tex[3]]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildingMesh(world, q, y, r, origin, textures, material) {
  const p = axialToWorld(q, r),
    type = world.get(q, y, r);
  const positions = [],
    normals = [],
    uv = [],
    sawNext = [],
    sawLast = [],
    colors = [],
    sky = [],
    rain = [];
  const exposed =
    world.dimension === 'overworld' &&
    world.surface(q, r) === y + 1 &&
    !['沙漠', '雪原'].includes(world.biome(q, r));
  for (const part of buildingParts(world, q, y, r)) {
    const box = part.polygon
      ? polygonPrism(part)
      : part.plane
        ? new THREE.PlaneGeometry(part.w, part.h)
            .rotateY(Math.PI)
            .toNonIndexed()
        : new THREE.BoxGeometry(part.w, part.h, part.d).toNonIndexed();
    if (part.pitch) box.rotateX(part.pitch);
    box.rotateY(part.angle);
    box.translate(p.x - origin.x + part.x, y + part.y, p.z - origin.z + part.z);
    const pos = box.attributes.position,
      normal = box.attributes.normal,
      tex = box.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      const panelNormal = part.panel
        ? Math.abs(
            normal.getX(i) * Math.sin(part.angle) * Math.sin(part.pitch || 0) +
              normal.getY(i) * Math.cos(part.pitch || 0) +
              normal.getZ(i) * Math.cos(part.angle) * Math.sin(part.pitch || 0),
          )
        : Math.abs(normal.getY(i));
      const face = panelNormal > 0.5 ? 'top' : 'side';
      uv.push(...textures.uv(part.tile + ':' + face, tex.getX(i), tex.getY(i)));
      const saw = part.tile === 'stonecutterSaw';
      if (type !== 'vine') {
        sawNext.push(
          ...textures.uv(
            (saw ? 'stonecutterSaw2' : part.tile) + ':' + face,
            tex.getX(i),
            tex.getY(i),
          ),
        );
        sawLast.push(
          ...textures.uv(
            (saw ? 'stonecutterSaw3' : part.tile) + ':' + face,
            tex.getX(i),
            tex.getY(i),
          ),
        );
      }
      const shade = (normal.getY(i) > 0.5 ? 1 : 0.86) * (part.shade ?? 1);
      colors.push(shade, shade, shade);
      sky.push(1);
      rain.push(part.polygon && normal.getY(i) > 0.5 && exposed ? 1 : 0);
    }
    box.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, data, size] of [
    ['position', positions, 3],
    ['normal', normals, 3],
    ['uv', uv, 2],
    ['sawNextUV', sawNext, 2],
    ['sawLastUV', sawLast, 2],
    ['color', colors, 3],
    ['skylight', sky, 1],
    ['rainExposure', rain, 1],
  ])
    if (data.length)
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
  geometry.computeBoundingSphere();
  if (type === 'vine' && material.userData?.geometricShade) {
    const count = geometry.attributes.position.count,
      tint = textures.biomes.tint(world, q, r, 2),
      colors = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) colors.set(tint, i * 4);
    geometry.setAttribute(
      'biomeTint',
      new THREE.Uint8BufferAttribute(colors, 4, true),
    );
    geometry.setAttribute(
      'ambientOcclusion',
      new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1),
    );
    geometry.userData.biomeRanges = new Int32Array([q, r, 0, count, 2]);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.surfaceReflection = reflectiveSurfaceClass(
    surfaceOpticsClass(type, BLOCKS[type]),
  );
  mesh.userData.baseSurfaceReflection = mesh.userData.surfaceReflection;
  mesh.userData.surfaceReflection ||= textures.materials?.reflective(geometry);
  if (material.userData?.geometricShade)
    geometry.setAttribute(
      'surfaceOptics',
      new THREE.Uint8BufferAttribute(
        new Uint8Array(geometry.attributes.position.count).fill(
          surfaceOpticsClass(type, BLOCKS[type]),
        ),
        1,
      ),
    );
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.shaped = { q, y, r, type };
  return mesh;
}

export function buildingItemMesh(type, textures) {
  const sample = cutItemWorld(type, 1);
  if (BLOCKS[type]?.shape === 'fence') {
    const get = sample.get;
    sample.get = (q, y, r) =>
      !q && !y && Math.abs(r) === 1 ? type : get(q, y, r);
  }
  const mesh = buildingMesh(
    sample,
    0,
    0,
    0,
    { x: 0, z: 0 },
    textures,
    new THREE.MeshLambertMaterial({
      map: textures.atlas,
      vertexColors: true,
      transparent: isGlass(type),
      opacity: isGlass(type) ? BLOCKS[type].opacity : 1,
      depthWrite: !isGlass(type),
      alphaTest: [
        'trapdoor',
        'stonecutter',
        'cobweb',
        'flower',
        'vine',
      ].includes(BLOCKS[type]?.shape)
        ? 0.5
        : 0,
      side: THREE.DoubleSide,
    }),
  );
  mesh.geometry.computeBoundingBox();
  const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
  mesh.geometry.translate(-center.x, -center.y, -center.z);
  delete mesh.userData.shaped;
  return mesh;
}
