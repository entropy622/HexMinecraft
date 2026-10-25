import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { buildingParts } from './building-shapes.js';

export function buildingMesh(world, q, y, r, origin, textures, material) {
  const p = axialToWorld(q, r),
    type = world.get(q, y, r);
  const positions = [],
    normals = [],
    uv = [],
    colors = [],
    sky = [],
    rain = [];
  for (const part of buildingParts(world, q, y, r)) {
    const box = new THREE.BoxGeometry(part.w, part.h, part.d).toNonIndexed();
    box.rotateY(part.angle);
    box.translate(p.x - origin.x + part.x, y + part.y, p.z - origin.z + part.z);
    const pos = box.attributes.position,
      normal = box.attributes.normal,
      tex = box.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      const face = i >= 12 && i < 24 ? 'top' : 'side';
      uv.push(...textures.uv(part.tile + ':' + face, tex.getX(i), tex.getY(i)));
      const shade = normal.getY(i) > 0.5 ? 1 : 0.86;
      colors.push(shade, shade, shade);
      sky.push(1);
      rain.push(0);
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
