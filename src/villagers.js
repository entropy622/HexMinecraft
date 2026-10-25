import * as THREE from 'three';
import { axialToWorld, worldToAxial } from './core.js';
import { ROLES } from './villages.js';
import { createVillager, animateVillager } from './villager-graphics.js';
import { disposeMob } from './mob-graphics.js';
export class Villagers {
  constructor(scene) {
    this.scene = scene;
    this.residents = new Map();
    this.world = null;
    this.ray = new THREE.Raycaster();
  }
  clear() {
    for (const n of this.residents.values()) {
      disposeMob(n.mesh);
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
          mesh = createVillager(role);
        mesh.position.set(p.x, v.h, p.z);
        this.scene.add(mesh);
        this.residents.set(id, { id, role, village: v, mesh });
      }
    }
    for (const [id, n] of this.residents)
      if (!wanted.has(id)) {
        disposeMob(n.mesh);
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
      const previousX = p.x,
        previousZ = p.z;
      if (d > 0.15 && !near) {
        const speed = Math.min(d, dt * 0.75),
          x = p.x + (dx / d) * speed,
          z = p.z + (dz / d) * speed,
          a = worldToAxial(x, z),
          h = n.village.h;
        if (
          this.world.get(a.q, h, a.r) === 'door' &&
          !this.world.state(a.q, h, a.r).open
        )
          this.openDoor?.(a.q, h, a.r);
        if (
          this.world.loaded(a.q, a.r) &&
          this.world.solid(a.q, h - 1, a.r) &&
          !this.world.solid(a.q, h, a.r) &&
          !this.world.solid(a.q, h + 1, a.r) &&
          !this.world.fluids.get(a.q, h, a.r)
        ) {
          p.x = x;
          p.z = z;
        }
      }
      const yaw = Math.atan2(
        near ? p.x - camera.position.x : -dx,
        near ? p.z - camera.position.z : -dz,
      );
      const difference = yaw - n.mesh.rotation.y;
      n.mesh.rotation.y +=
        Math.atan2(Math.sin(difference), Math.cos(difference)) *
        Math.min(1, dt * 7);
      animateVillager(
        n,
        dt,
        time,
        camera,
        Math.hypot(p.x - previousX, p.z - previousZ),
      );
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
    const n = [...this.residents.values()].find((n) => n.mesh === o);
    if (n) n.distance = hit.distance;
    return n || null;
  }
}
