import * as THREE from 'three';
import { axialToWorld, DIRECTIONS } from './core.js';
import { LIQUIDS, fluidHeight } from './fluids.js';
const corners = Array.from({ length: 6 }, (_, i) => [
  Math.cos(((i * 60 - 30) * Math.PI) / 180),
  Math.sin(((i * 60 - 30) * Math.PI) / 180),
]);
export class FluidRenderer {
  constructor(scene, textures) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = new Map();
    this.materials = {};
    for (const [type, def] of Object.entries(LIQUIDS)) {
      const map = textures.single(type === 'glow' ? 'water' : type).clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      this.materials[type] = new THREE.MeshPhongMaterial({
        map,
        color: type === 'glow' ? '#92ffd4' : '#ffffff',
        transparent: true,
        opacity: def.opacity,
        shininess: 35,
        depthWrite: type === 'lava',
        side: THREE.DoubleSide,
        emissive:
          type === 'lava' ? '#a83708' : type === 'glow' ? '#3ebf94' : '#000000',
        emissiveMap: type === 'water' ? null : map,
      });
    }
  }
  clear() {
    for (const mesh of this.meshes.values()) {
      mesh.traverse((o) => o.geometry?.dispose());
      this.group.remove(mesh);
    }
    this.meshes.clear();
    this.world = null;
  }
  sync(world, wanted, immediate = false) {
    if (this.world !== world) {
      this.clear();
      this.world = world;
    }
    for (const [k, m] of this.meshes)
      if (!wanted.has(k)) {
        m.traverse((o) => o.geometry?.dispose());
        this.group.remove(m);
        this.meshes.delete(k);
      }
    for (const k of world.fluids.dirty)
      if (!world.chunks.has(k)) world.fluids.dirty.delete(k);
    let budget = immediate ? Infinity : 3;
    for (const k of wanted)
      if ((!this.meshes.has(k) || world.fluids.dirty.has(k)) && budget-- > 0) {
        this.build(k);
        world.fluids.dirty.delete(k);
      }
  }
  build(k) {
    const old = this.meshes.get(k);
    if (old) {
      old.traverse((o) => o.geometry?.dispose());
      this.group.remove(old);
    }
    const group = new THREE.Group(),
      [cq, cr] = k.split(',').map(Number),
      origin = axialToWorld(cq * 8, cr * 8);
    group.position.set(origin.x, 0, origin.z);
    const data = {};
    for (const type of Object.keys(LIQUIDS)) data[type] = { p: [], uv: [] };
    for (const [cell, f] of this.world.fluids.chunks.get(k) || []) {
      const [q, y, r] = cell.split(',').map(Number),
        p = axialToWorld(q, r),
        x = p.x - origin.x,
        z = p.z - origin.z,
        h = fluidHeight(f),
        d = data[f.type];
      const tri = (a, b, c, uv) => {
        d.p.push(...a, ...b, ...c);
        d.uv.push(...uv.flat());
      };
      if (!this.world.fluids.get(q, y + 1, r))
        for (let i = 0; i < 6; i++) {
          const a = corners[i],
            b = corners[(i + 1) % 6];
          tri(
            [x, y + h, z],
            [x + b[0], y + h, z + b[1]],
            [x + a[0], y + h, z + a[1]],
            [
              [0.5, 0.5],
              [(b[0] + 1) / 2, (b[1] + 1) / 2],
              [(a[0] + 1) / 2, (a[1] + 1) / 2],
            ],
          );
        }
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = DIRECTIONS[i],
          n = this.world.fluids.get(q + dq, y, r + dr);
        if (
          this.world.solid(q + dq, y, r + dr) ||
          (n?.type === f.type && fluidHeight(n) >= h)
        )
          continue;
        const a = corners[i],
          b = corners[(i + 1) % 6],
          bottom = n?.type === f.type ? fluidHeight(n) : 0;
        const v0 = [x + a[0], y + bottom, z + a[1]],
          v1 = [x + b[0], y + bottom, z + b[1]],
          v2 = [x + b[0], y + h, z + b[1]],
          v3 = [x + a[0], y + h, z + a[1]];
        tri(v0, v2, v1, [
          [0, bottom],
          [1, h],
          [1, bottom],
        ]);
        tri(v0, v3, v2, [
          [0, bottom],
          [0, h],
          [1, h],
        ]);
      }
      if (!this.world.solid(q, y - 1, r) && !this.world.fluids.get(q, y - 1, r))
        for (let i = 0; i < 6; i++) {
          const a = corners[i],
            b = corners[(i + 1) % 6];
          tri(
            [x, y, z],
            [x + a[0], y, z + a[1]],
            [x + b[0], y, z + b[1]],
            [
              [0.5, 0.5],
              [0, 0],
              [1, 1],
            ],
          );
        }
    }
    for (const [type, d] of Object.entries(data))
      if (d.p.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.materials[type]);
        mesh.userData.liquid = type;
        group.add(mesh);
      }
    this.group.add(group);
    this.meshes.set(k, group);
  }
  frame(time) {
    for (const [type, m] of Object.entries(this.materials)) {
      const speed = type === 'lava' ? 0.025 : 0.065;
      m.map.offset.set(time * speed, time * speed * 0.45);
    }
  }
}
