import * as THREE from 'three';
import { worldToAxial } from './core.js';
import { fluidHeight } from './fluids.js';

export const BOAT_EYE = 1.35;
export const MAX_BOATS = 128;
const rim = Array.from({ length: 6 }, (_, i) => [
  Math.sin((i * Math.PI) / 3),
  Math.cos((i * Math.PI) / 3),
]);
const samples = [[0, 0], ...rim.map(([x, z]) => [x * 0.8, z * 0.8])];
export function validBoats(records, seat) {
  return (
    Array.isArray(records) &&
    records.length <= MAX_BOATS &&
    new Set(records.map((b) => b?.id)).size === records.length &&
    records.every(
      (b) =>
        b &&
        Number.isSafeInteger(b.id) &&
        b.id > 0 &&
        b.id < 1e9 &&
        Array.isArray(b.position) &&
        b.position.length === 3 &&
        b.position.every(Number.isFinite) &&
        Math.abs(b.position[0]) < 2e9 &&
        Math.abs(b.position[2]) < 2e9 &&
        b.position[1] >= -30 &&
        b.position[1] < 100 &&
        ['yaw', 'vx', 'vz', 'vy', 'health'].every((k) =>
          Number.isFinite(b[k]),
        ) &&
        Math.abs(b.yaw) <= Math.PI * 2 &&
        Math.abs(b.vx) <= 15 &&
        Math.abs(b.vz) <= 15 &&
        Math.abs(b.vy) <= 24 &&
        b.health > 0 &&
        b.health <= 20,
    ) &&
    (seat === null || records.some((b) => b.id === seat))
  );
}

export class Boats {
  constructor(scene, textures, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.records = [];
    this.riding = null;
    this.ray = new THREE.Raycaster();
    this.wood = new THREE.MeshLambertMaterial({
      map: textures.single('planks:side'),
    });
    this.dark = new THREE.MeshLambertMaterial({
      map: textures.single('wood:side'),
    });
    this.floor = new THREE.CylinderGeometry(0.88, 0.8, 0.12, 6);
    this.wall = new THREE.BoxGeometry(0.91, 0.32, 0.1);
    this.seat = new THREE.BoxGeometry(1.16, 0.1, 0.2);
    this.shaft = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6);
    this.paddle = new THREE.BoxGeometry(0.15, 0.36, 0.06);
    this.wakeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.8, 0.03, 1),
      new THREE.Vector3(-1.2, 0.03, 1.8),
      new THREE.Vector3(0.8, 0.03, 1),
      new THREE.Vector3(1.2, 0.03, 1.8),
      new THREE.Vector3(-0.7, 0.03, 1.4),
      new THREE.Vector3(-1.3, 0.03, 2.5),
      new THREE.Vector3(0.7, 0.03, 1.4),
      new THREE.Vector3(1.3, 0.03, 2.5),
    ]);
  }
  model(b) {
    const group = new THREE.Group();
    const add = (geometry, material, x, y, z) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      m.userData.boat = b;
      group.add(m);
      return m;
    };
    add(this.floor, this.wood, 0, -0.04, 0);
    for (let i = 0; i < 6; i++) {
      const a = rim[i],
        c = rim[(i + 1) % 6];
      const m = add(
        this.wall,
        this.wood,
        (a[0] + c[0]) * 0.455,
        0.15,
        (a[1] + c[1]) * 0.455,
      );
      m.rotation.y = -Math.atan2(c[1] - a[1], c[0] - a[0]);
    }
    add(this.seat, this.dark, 0, 0.12, 0.28);
    b.oars = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.78, 0.25, 0.05);
      const shaft = new THREE.Mesh(this.shaft, this.dark);
      shaft.position.y = -0.36;
      const paddle = new THREE.Mesh(this.paddle, this.wood);
      paddle.position.y = -0.85;
      pivot.add(shaft, paddle);
      group.add(pivot);
      return pivot;
    });
    b.wake = new THREE.LineSegments(
      this.wakeGeometry,
      new THREE.LineBasicMaterial({
        color: '#cae5e2',
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    group.add(b.wake);
    group.position.fromArray(b.position);
    group.rotation.y = b.yaw;
    this.scene.add(group);
    return group;
  }
  load(records = [], seat = null) {
    for (const b of this.records) {
      this.scene.remove(b.mesh);
      b.wake.material.dispose();
    }
    this.records = records.map((b) => ({
      ...structuredClone(b),
      mesh: null,
      afloat: false,
      stroke: 0,
      sound: 0,
    }));
    for (const b of this.records) b.mesh = this.model(b);
    this.riding = this.records.find((b) => b.id === seat) || null;
  }
  serialize() {
    return this.records.map(({ id, position, yaw, vx, vz, vy, health }) => ({
      id,
      position: [...position],
      yaw,
      vx,
      vz,
      vy,
      health,
    }));
  }
  add(position, yaw) {
    if (this.records.length >= MAX_BOATS) return null;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const b = {
      id: Math.max(0, ...this.records.map((b) => b.id)) + 1,
      position: [...position],
      yaw,
      vx: 0,
      vz: 0,
      vy: 0,
      health: 20,
      afloat: true,
      stroke: 0,
      sound: 0,
    };
    b.mesh = this.model(b);
    this.records.push(b);
    return b;
  }
  remove(b, drop = true) {
    if (this.riding === b) {
      this.riding = null;
      this.callbacks.unseat();
    }
    this.scene.remove(b.mesh);
    b.wake.material.dispose();
    this.records.splice(this.records.indexOf(b), 1);
    if (drop) this.callbacks.drop(b.position);
  }
  damage(b, amount, drop = true) {
    if (!this.records.includes(b)) return;
    b.health -= amount;
    if (b.health <= 0) this.remove(b, drop);
  }
  occupies(x, y, z, exclude = this.riding) {
    return this.records.some(
      (b) =>
        b !== exclude &&
        y > b.position[1] - 0.13 &&
        y < b.position[1] + 0.33 &&
        Math.hypot(x - b.position[0], z - b.position[2]) < 0.88,
    );
  }
  bodyBlocked(x, feet, z) {
    return this.records.some(
      (b) =>
        b !== this.riding &&
        feet < b.position[1] + 0.33 &&
        feet + 1.65 > b.position[1] - 0.13 &&
        Math.hypot(x - b.position[0], z - b.position[2]) < 1.1,
    );
  }
  intersectsCell(x, y, z) {
    return this.records.some(
      (b) =>
        Math.abs(b.position[1] - y - 0.5) < 0.9 &&
        Math.hypot(x - b.position[0], z - b.position[2]) < 1.7,
    );
  }
  blocked(world, x, y, z, boat = null, rider = false) {
    const a = worldToAxial(x, z);
    if (!world.loaded(a.q, a.r)) return true;
    for (const [dx, dz] of samples) {
      if (
        [y - 0.1, y + 0.12, y + 0.31].some((h) =>
          world.pointSolid(x + dx, h, z + dz),
        )
      )
        return true;
      if (this.occupies(x + dx, y + 0.1, z + dz, boat)) return true;
    }
    if (rider)
      for (const [dx, dz] of [
        [0, 0],
        [0.25, 0],
        [-0.25, 0],
        [0, 0.25],
        [0, -0.25],
      ])
        if (
          [0.4, 0.9, 1.4].some((h) => world.pointSolid(x + dx, y + h, z + dz))
        )
          return true;
    return false;
  }
  surface(world, x, y, z) {
    let count = 0,
      height = 0,
      lava = false;
    for (const [dx, dz] of samples) {
      const a = worldToAxial(x + dx, z + dz);
      for (let h = Math.floor(y) + 1; h >= Math.floor(y) - 1; h--) {
        const f = world.fluids.get(a.q, h, a.r);
        if (f?.type === 'lava' && y - h < 1.2) lava = true;
        if (f?.type !== 'water' || f.falling) continue;
        const upper = world.fluids.get(a.q, h + 1, a.r);
        const top = upper?.type === 'water' ? y + 0.5 : h + fluidHeight(f);
        if (Math.abs(top - y) > 0.65) continue;
        count++;
        height += top;
        break;
      }
    }
    return { afloat: count >= 3, height: count ? height / count : y, lava };
  }
  target(camera, distance = Infinity) {
    this.ray.setFromCamera(new THREE.Vector2(), camera);
    this.ray.far = Math.min(5, distance);
    const hits = this.ray.intersectObjects(
      this.records
        .filter((b) => b !== this.riding && b.mesh.visible)
        .map((b) => b.mesh),
      true,
    );
    const hit = hits.find((h) => h.object.userData.boat);
    return hit
      ? { boat: hit.object.userData.boat, distance: hit.distance }
      : null;
  }
  update(dt, world, keys) {
    for (const b of [...this.records]) {
      const a = worldToAxial(b.position[0], b.position[2]);
      b.mesh.visible = world.loaded(a.q, a.r);
      if (!b.mesh.visible) continue;
      const rider = this.riding === b,
        water = this.surface(world, ...b.position);
      b.afloat = water.afloat;
      b.burning = water.lava;
      if (water.lava) {
        this.damage(b, dt * 8, false);
        if (!this.records.includes(b)) continue;
      }
      const throttle = rider
        ? Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
        : 0;
      const steer = rider
        ? Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
        : 0;
      const brake = rider && keys.has('Space');
      const speed = Math.hypot(b.vx, b.vz);
      if (b.afloat) {
        b.yaw -= steer * dt * 1.6 * (0.4 + Math.min(speed / 5, 0.6));
        b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw));
        const thrust = throttle * (throttle > 0 ? 8.5 : 4);
        const blend = 1 - Math.exp(-dt * (brake ? 9 : throttle ? 2.2 : 0.7));
        b.vx += ((brake ? 0 : -Math.sin(b.yaw) * thrust) - b.vx) * blend;
        b.vz += ((brake ? 0 : -Math.cos(b.yaw) * thrust) - b.vz) * blend;
        b.vy = Math.max(-2, Math.min(2, (water.height - b.position[1]) * 8));
      } else {
        b.vx *= Math.exp(-dt * 7);
        b.vz *= Math.exp(-dt * 7);
        b.vy = Math.max(-22, b.vy - dt * 18);
      }
      const steps = Math.max(
        1,
        Math.ceil(
          (Math.max(Math.abs(b.vx), Math.abs(b.vz), Math.abs(b.vy)) * dt) / 0.1,
        ),
      );
      for (let i = 0; i < steps; i++) {
        for (const [axis, velocity] of [
          [0, 'vx'],
          [2, 'vz'],
          [1, 'vy'],
        ]) {
          const p = [...b.position];
          p[axis] += (b[velocity] * dt) / steps;
          if (!this.blocked(world, ...p, b, rider)) b.position = p;
          else b[velocity] = 0;
        }
      }
      if (b.position[1] < -20) {
        this.remove(b, false);
        continue;
      }
      b.stroke += dt * (b.afloat && (throttle || steer) ? 5 : 1);
      b.mesh.position.fromArray(b.position);
      b.mesh.rotation.y = b.yaw;
      b.mesh.rotation.z = b.afloat ? Math.sin(b.stroke * 0.8) * 0.012 : 0;
      b.oars.forEach((o, i) => {
        const side = i ? 1 : -1,
          rowing = rider && b.afloat && !brake && (throttle || steer);
        o.rotation.z =
          side *
          (1.05 + (rowing ? Math.sin(b.stroke + (steer ? side : 0)) * 0.3 : 0));
        o.rotation.y = rowing ? Math.cos(b.stroke) * 0.35 * side : 0;
      });
      b.wake.visible = b.afloat && speed > 0.5;
      b.wake.material.opacity =
        Math.min(0.5, speed / 16) * (0.75 + Math.sin(b.stroke) * 0.25);
      if (rider && b.afloat && (throttle || steer)) {
        b.sound += dt;
        if (b.sound > 0.9) {
          b.sound = 0;
          this.callbacks.row();
        }
      }
    }
  }
}
