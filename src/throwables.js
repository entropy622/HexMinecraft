import * as THREE from 'three';
import { worldToAxial } from './core.js';
import { MOBS } from './mob-data.js';
import { itemImage } from './texture-pack.js';
import { THROWABLES } from './throwable-data.js';

const normals = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  ...Array.from(
    { length: 6 },
    (_, i) =>
      new THREE.Vector3(
        Math.cos((i * Math.PI) / 3),
        0,
        Math.sin((i * Math.PI) / 3),
      ),
  ),
];

// Find the entry face against the actual collision shapes, including open
// doors and fence rails. A binary search keeps thin surfaces in front of mobs.
function terrainImpact(world, from, to, direction) {
  if (!world.pointSolid(to.x, to.y, to.z)) return null;
  let air = from.clone(),
    solid = to.clone();
  for (let i = 0; i < 7; i++) {
    const mid = air.clone().lerp(solid, 0.5);
    if (world.pointSolid(mid.x, mid.y, mid.z)) solid = mid;
    else air = mid;
  }
  let normal = direction.clone().negate(),
    best = -Infinity;
  for (const n of normals) {
    const probe = solid.clone().addScaledVector(n, 0.035);
    const score = -n.dot(direction);
    if (score > best && !world.pointSolid(probe.x, probe.y, probe.z)) {
      normal = n;
      best = score;
    }
  }
  return { point: air, normal: normal.clone(), distance: from.distanceTo(air) };
}

// Destinations remain on the entry side. Never search across the struck wall,
// load an unseen chunk, or move a player into a space shorter than their body.
export function pearlDestination(world, impact, blocked) {
  const { point, normal } = impact;
  const horizontal = Math.hypot(normal.x, normal.z);
  const baseY = point.y + (normal.y < -0.5 ? -1.82 : 0.015);
  const drops =
    Math.abs(normal.y) > 0.5 ? [0] : [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
  for (const offset of horizontal > 0.1 ? [0.38, 0.6, 0.85] : [0]) {
    const x = point.x + normal.x * offset,
      z = point.z + normal.z * offset;
    if (
      [
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3],
      ].some(([dx, dz]) => {
        const a = worldToAxial(x + dx, z + dz);
        return !world.loaded(a.q, a.r);
      })
    )
      continue;
    for (const drop of drops) {
      const feet = baseY - drop;
      if (feet < 0.03 || feet + 1.8 > 512 || blocked(x, feet, z)) continue;
      return new THREE.Vector3(x, feet, z);
    }
  }
  return null;
}

export class Throwables {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.active = [];
    this.particles = [];
    this.cooldowns = {};
    this.materials = new Map();
    this.plane = new THREE.PlaneGeometry(0.34, 0.34);
    this.fallback = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 6);
    this.particleGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6);
    this.particleMaterials = Object.fromEntries(
      Object.entries(THROWABLES).map(([id, def]) => [
        id,
        new THREE.MeshBasicMaterial({ color: def.color }),
      ]),
    );
    this.ray = new THREE.Ray();
    this.sphere = new THREE.Sphere();
    this.point = new THREE.Vector3();
  }
  ready(item) {
    return !(this.cooldowns[item] > 0);
  }
  remove(record) {
    const index = this.active.indexOf(record);
    if (index < 0) return;
    this.scene.remove(record.mesh);
    this.active.splice(index, 1);
  }
  clear() {
    for (const record of [...this.active]) this.remove(record);
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;
    this.cooldowns = {};
  }
  model(item) {
    if (!this.materials.has(item)) {
      const image = itemImage(item);
      let map = null;
      if (image) {
        map = new THREE.Texture(image);
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = map.minFilter = THREE.NearestFilter;
        map.needsUpdate = true;
      }
      this.materials.set(
        item,
        new THREE.MeshLambertMaterial({
          map,
          color: map ? '#ffffff' : THROWABLES[item].color,
          alphaTest: 0.4,
          side: THREE.DoubleSide,
        }),
      );
    }
    const material = this.materials.get(item);
    return new THREE.Mesh(material.map ? this.plane : this.fallback, material);
  }
  shoot(item, position, direction, inherited = null) {
    const def = THROWABLES[item];
    if (!def || !this.ready(item) || this.active.length >= 32) return false;
    const mesh = this.model(item);
    mesh.position.copy(position);
    this.scene.add(mesh);
    const velocity = direction.clone().normalize().multiplyScalar(def.speed);
    if (inherited) velocity.add(inherited);
    this.active.push({ item, mesh, velocity, life: 8, trail: 0 });
    this.cooldowns[item] = def.cooldown;
    return true;
  }
  burst(point, item, count = 12) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 160) {
        this.scene.remove(this.particles.shift().mesh);
      }
      const mesh = new THREE.Mesh(
        this.particleGeometry,
        this.particleMaterials[item],
      );
      mesh.position.copy(point);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 2,
          (Math.random() - 0.5) * 3,
        ),
        life: 0.35 + Math.random() * 0.35,
      });
    }
  }
  entityImpact(from, direction, length, mobs, residents, boats) {
    this.ray.set(from, direction);
    let nearest = null;
    const check = (position, height, radius, mob = null) => {
      this.sphere.center.copy(position);
      this.sphere.center.y += height;
      this.sphere.radius = radius;
      const inside = this.sphere.containsPoint(from);
      if (!inside && !this.ray.intersectSphere(this.sphere, this.point)) return;
      const distance = inside ? 0 : from.distanceTo(this.point);
      if (distance > length || (nearest && distance >= nearest.distance))
        return;
      nearest = {
        point: inside ? from.clone() : this.point.clone(),
        normal: direction.clone().negate(),
        distance,
        mob,
      };
    };
    for (const mob of mobs) {
      if (!mob.mesh.visible) continue;
      if (mob.hitboxes) {
        for (const box of mob.hitboxes()) check(box.center, 0, box.radius, mob);
        continue;
      }
      const def = MOBS[mob.kind],
        size = mob.baby ? 0.55 : 1;
      for (const height of def.hitHeights || [
        def.hitHeight || def.height * 0.5,
      ])
        check(
          mob.mesh.position,
          height * size,
          (def.hitRadius || (mob.kind === 'chicken' ? 0.32 : 0.6)) * size,
          mob,
        );
    }
    for (const resident of residents.values())
      if (resident.mesh.visible) check(resident.mesh.position, 0.9, 0.55);
    for (const boat of boats)
      check(new THREE.Vector3(...boat.position), 0.1, 0.7);
    return nearest;
  }
  update(dt, world, mobs, camera, residents, boats) {
    for (const id of Object.keys(this.cooldowns))
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    for (const p of [...this.particles]) {
      p.life -= dt;
      p.velocity.y -= dt * 3;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.setScalar(Math.max(0, Math.min(1, p.life * 3)));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(this.particles.indexOf(p), 1);
      }
    }
    for (const record of [...this.active]) {
      // A callback can clear projectiles after death or a world replacement.
      if (!this.active.includes(record)) continue;
      record.life -= dt;
      if (record.life <= 0) {
        this.remove(record);
        continue;
      }
      const steps = Math.max(
        1,
        Math.ceil(((record.velocity.length() + 16 * dt) * dt) / 0.1),
      );
      const step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const from = record.mesh.position.clone();
        record.velocity.y -= THROWABLES[record.item].gravity * step;
        const to = from.clone().addScaledVector(record.velocity, step),
          a = worldToAxial(to.x, to.z);
        if (!world.loaded(a.q, a.r) || to.y < 0 || to.y > 512) {
          this.remove(record);
          if (record.item === 'pearl') this.callbacks.miss?.();
          break;
        }
        const direction = to.clone().sub(from).normalize();
        let impact = terrainImpact(world, from, to, direction);
        const entity = this.entityImpact(
          from,
          direction,
          from.distanceTo(to),
          mobs,
          residents,
          boats,
        );
        if (
          entity &&
          (!impact || entity.distance < impact.distance) &&
          !this.callbacks.dodge?.(entity.mob)
        )
          impact = entity;
        if (impact) {
          // Remove first: teleport damage may clear the world during callback.
          this.remove(record);
          this.burst(impact.point, record.item);
          this.callbacks.impact({ ...impact, item: record.item, direction });
          break;
        }
        record.mesh.position.copy(to);
        const fluid = world.fluids.get(a.q, Math.floor(to.y), a.r);
        if (fluid) record.velocity.multiplyScalar(Math.exp(-step * 3));
      }
      if (!this.active.includes(record)) continue;
      record.mesh.quaternion.copy(camera.quaternion);
      record.trail += dt;
      if (record.item === 'pearl' && record.trail >= 0.045) {
        record.trail = 0;
        this.burst(record.mesh.position, 'pearl', 1);
      }
    }
  }
}
