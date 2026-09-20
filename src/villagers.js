import * as THREE from 'three';
import { axialToWorld, worldToAxial } from './core.js';
import { ROLES } from './villages.js';
function model(role) {
  const g = new THREE.Group(),
    robe = new THREE.MeshLambertMaterial({ color: ROLES[role].color }),
    skin = new THREE.MeshLambertMaterial({ color: '#b89370' });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.26, 0.34, 0.85, 6), robe, 0, 0.87, 0);
  add(new THREE.BoxGeometry(0.43, 0.49, 0.4), skin, 0, 1.53, 0);
  add(new THREE.BoxGeometry(0.13, 0.23, 0.2), skin, 0, 1.46, -0.27);
  const dark = new THREE.MeshLambertMaterial({ color: '#393b29' });
  for (const x of [-0.12, 0.12])
    add(new THREE.BoxGeometry(0.055, 0.055, 0.02), dark, x, 1.58, -0.21);
  add(new THREE.BoxGeometry(0.32, 0.04, 0.035), dark, 0, 1.68, -0.21);
  add(new THREE.BoxGeometry(0.56, 0.16, 0.19), robe, 0, 1.04, -0.23);
  for (const x of [-0.15, 0.15])
    add(new THREE.BoxGeometry(0.17, 0.4, 0.2), dark, x, 0.24, 0);
  if (role === 'farmer') {
    add(
      new THREE.CylinderGeometry(0.38, 0.38, 0.07, 6),
      new THREE.MeshLambertMaterial({ color: '#cfad52' }),
      0,
      1.81,
      0,
    );
    add(
      new THREE.CylinderGeometry(0.24, 0.26, 0.17, 6),
      new THREE.MeshLambertMaterial({ color: '#ac893c' }),
      0,
      1.9,
      0,
    );
  }
  return g;
}
export class Villagers {
  constructor(scene) {
    this.scene = scene;
    this.residents = new Map();
    this.world = null;
    this.ray = new THREE.Raycaster();
  }
  clear() {
    for (const n of this.residents.values()) {
      this.scene.remove(n.mesh);
      const materials = new Set();
      n.mesh.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) materials.add(o.material);
      });
      for (const m of materials) m.dispose();
    }
    this.residents.clear();
  }
  sync(world, q, r) {
    if (this.world !== world) {
      this.clear();
      this.world = world;
    }
    const wanted = new Set();
    for (const v of world.villages(q, r, 30)) {
      if (!world.loaded(v.q, v.r)) continue;
      for (const [role, def] of Object.entries(ROLES)) {
        const id = v.id + '/' + role;
        wanted.add(id);
        if (this.residents.has(id)) continue;
        const p = axialToWorld(v.q + def.work[0], v.r + def.work[1]),
          mesh = model(role);
        mesh.position.set(p.x, v.h, p.z);
        this.scene.add(mesh);
        this.residents.set(id, { id, role, village: v, mesh });
      }
    }
    for (const [id, n] of this.residents)
      if (!wanted.has(id)) {
        this.scene.remove(n.mesh);
        const mats = new Set();
        n.mesh.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) mats.add(o.material);
        });
        for (const m of mats) m.dispose();
        this.residents.delete(id);
      }
  }
  frame(dt, time, camera) {
    for (const n of this.residents.values()) {
      const def = ROLES[n.role],
        night = time % 600 > 310,
        dest = night
          ? def.home
          : Math.floor(time / 12) % 2
            ? def.work
            : [def.work[0], def.work[1] + 1],
        goal = axialToWorld(n.village.q + dest[0], n.village.r + dest[1]),
        p = n.mesh.position;
      const dx = goal.x - p.x,
        dz = goal.z - p.z,
        d = Math.hypot(dx, dz),
        near = Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 3;
      let moving = false;
      if (d > 0.15 && !near) {
        const speed = Math.min(d, dt * 0.75),
          x = p.x + (dx / d) * speed,
          z = p.z + (dz / d) * speed,
          a = worldToAxial(x, z),
          h = n.village.h;
        if (
          this.world.loaded(a.q, a.r) &&
          this.world.solid(a.q, h - 1, a.r) &&
          !this.world.solid(a.q, h, a.r) &&
          !this.world.solid(a.q, h + 1, a.r) &&
          !this.world.fluids.get(a.q, h, a.r)
        ) {
          p.x = x;
          p.z = z;
          moving = true;
        }
      }
      n.mesh.rotation.y = Math.atan2(
        near ? p.x - camera.position.x : -dx,
        near ? p.z - camera.position.z : -dz,
      );
      n.mesh.children[6].rotation.x = moving ? Math.sin(time * 7) * 0.1 : 0;
      n.mesh.visible = this.world.loaded(
        worldToAxial(p.x, p.z).q,
        worldToAxial(p.x, p.z).r,
      );
    }
  }
  target(camera, distance = Infinity) {
    this.ray.setFromCamera(new THREE.Vector2(), camera);
    this.ray.far = 4;
    const meshes = [...this.residents.values()].map((n) => n.mesh),
      hit = this.ray
        .intersectObjects(meshes, true)
        .find((h) => h.distance < distance);
    if (!hit) return null;
    let o = hit.object;
    while (o.parent && !meshes.includes(o)) o = o.parent;
    return [...this.residents.values()].find((n) => n.mesh === o) || null;
  }
}
