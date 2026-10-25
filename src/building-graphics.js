import * as THREE from 'three';
import { BLOCKS, axialToWorld } from './core.js';
import { buildingParts } from './building-shapes.js';
import { cutItemWorld } from './cut-blocks.js';

function polygonPrism(part) {
  const positions = [],
    uv = [],
    polygon = part.polygon;
  const low = -part.h / 2,
    high = part.h / 2;
  const triangle = (points, tex) => {
    points.forEach((p, i) => {
      positions.push(...p);
      uv.push(...tex[i]);
    });
  };
  for (let i = 1; i < polygon.length - 1; i++) {
    const tri = [polygon[0], polygon[i], polygon[i + 1]];
    triangle(
      [...tri].reverse().map(([x, z]) => [x, high, z]),
      [...tri].reverse().map(([x, z]) => [(x + 1) / 2, (z + 1) / 2]),
    );
    triangle(
      tri.map(([x, z]) => [x, low, z]),
      tri.map(([x, z]) => [(x + 1) / 2, (z + 1) / 2]),
    );
  }
  for (let i = 0; i < polygon.length; i++) {
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
        [a[0], high, a[1]],
        [b[0], high, b[1]],
        [b[0], low, b[1]],
      ];
      const width = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const tex = [
        [0, 1 - (part.y + low)],
        [0, 1 - (part.y + high)],
        [width, 1 - (part.y + high)],
        [width, 1 - (part.y + low)],
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
      : new THREE.BoxGeometry(part.w, part.h, part.d).toNonIndexed();
    box.rotateY(part.angle);
    box.translate(p.x - origin.x + part.x, y + part.y, p.z - origin.z + part.z);
    const pos = box.attributes.position,
      normal = box.attributes.normal,
      tex = box.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      const face = Math.abs(normal.getY(i)) > 0.5 ? 'top' : 'side';
      uv.push(...textures.uv(part.tile + ':' + face, tex.getX(i), tex.getY(i)));
      const shade = normal.getY(i) > 0.5 ? 1 : 0.86;
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
    ['color', colors, 3],
    ['skylight', sky, 1],
    ['rainExposure', rain, 1],
  ])
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
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
    new THREE.MeshLambertMaterial({ map: textures.atlas, vertexColors: true }),
  );
  mesh.geometry.computeBoundingBox();
  const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
  mesh.geometry.translate(-center.x, -center.y, -center.z);
  delete mesh.userData.shaped;
  return mesh;
}
