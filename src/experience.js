import * as THREE from 'three';
import { worldToAxial } from './core.js';

export const xpForLevel = (level) =>
  level <= 16
    ? level * level + 6 * level
    : level <= 31
      ? Math.floor(2.5 * level * level - 40.5 * level + 360)
      : Math.floor(4.5 * level * level - 162.5 * level + 2220);
export function xpLevel(total) {
  let low = 0,
    high = 10001;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (xpForLevel(middle) <= total) low = middle;
    else high = middle;
  }
  return low;
}
export const validExperience = (state) =>
  state &&
  Number.isSafeInteger(state.total) &&
  state.total >= 0 &&
  state.total <= 1e8 &&
  Number.isSafeInteger(state.seed) &&
  state.seed >= 0 &&
  state.seed < 1e9 &&
  Number.isFinite(state.fraction) &&
  state.fraction >= 0 &&
  state.fraction < 1;
export function validOrbs(records) {
  return (
    Array.isArray(records) &&
    records.length <= 5000 &&
    records.every(
      (o) =>
        o &&
        Number.isInteger(o.value) &&
        o.value > 0 &&
        o.value <= 1e6 &&
        Array.isArray(o.position) &&
        o.position.length === 3 &&
        o.position.every(Number.isFinite) &&
        Math.abs(o.position[0]) < 2e9 &&
        Math.abs(o.position[2]) < 2e9 &&
        o.position[1] > -50 &&
        o.position[1] < 512 &&
        Number.isFinite(o.life) &&
        o.life > 0 &&
        o.life <= 300,
    )
  );
}

export class Experience {
  constructor(scene, onPickup) {
    this.onPickup = onPickup;
    this.loadPlayer();
    this.records = [];
    this.clock = 0;
    this.soundTimer = 0;
    this.mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6),
      new THREE.MeshBasicMaterial({ color: '#99eb49' }),
      128,
    );
    this.mesh.material.color.multiplyScalar(1.7);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  loadPlayer(state = {}) {
    this.total = state.total || 0;
    this.seed = state.seed || 0;
    this.fraction = state.fraction || 0;
  }
  get level() {
    return xpLevel(this.total);
  }
  serializePlayer() {
    return { total: this.total, seed: this.seed, fraction: this.fraction };
  }
  load(records = []) {
    this.records = structuredClone(records);
    this.mesh.count = 0;
  }
  serialize() {
    return structuredClone(this.records);
  }
  spend(levels, reroll = false) {
    const level = this.level;
    if (level < levels) return false;
    const progress =
      (this.total - xpForLevel(level)) /
      (xpForLevel(level + 1) - xpForLevel(level));
    this.total =
      xpForLevel(level - levels) +
      Math.floor(
        progress *
          (xpForLevel(level - levels + 1) - xpForLevel(level - levels)),
      );
    if (reroll) this.seed = (this.seed + 1) % 1e9;
    return true;
  }
  spawn(value, position) {
    this.fraction += value;
    const count = Math.floor(this.fraction + 1e-8);
    this.fraction = Math.max(0, this.fraction - count);
    if (count <= 0) return;
    const nearby = this.records.find(
      (o) =>
        Math.hypot(...o.position.map((v, i) => v - position[i])) < 1.4 &&
        o.value + count <= 1e6,
    );
    if (nearby) {
      nearby.value += count;
      nearby.life = 300;
      return;
    }
    if (this.records.length >= 5000) {
      const oldest = this.records[0];
      oldest.value = Math.min(1e6, oldest.value + count);
      return;
    }
    this.records.push({ value: count, position: [...position], life: 300 });
  }
  update(dt, world, camera, active = true) {
    this.clock += dt;
    this.soundTimer = Math.max(0, this.soundTimer - dt);
    const target = [
      camera.position.x,
      camera.position.y - 0.7,
      camera.position.z,
    ];
    let visible = 0;
    for (const orb of this.records) {
      const p = orb.position,
        cell = worldToAxial(p[0], p[2]);
      if (!world.loaded(cell.q, cell.r)) continue;
      const distance = Math.hypot(...p.map((v, i) => v - target[i]));
      if (distance > 64) continue;
      orb.life -= dt;
      if (orb.life <= 0 || p[1] < -20) {
        orb.life = 0;
        continue;
      }
      if (active && distance < 6) {
        const next = p.map((v, i) => v + (target[i] - v) * Math.min(1, dt * 5));
        const steps = Math.max(1, Math.ceil(distance / 0.15));
        let clear = true;
        for (let s = 1; s <= steps; s++)
          if (
            world.pointSolid(
              ...p.map((v, i) => v + ((target[i] - v) * s) / steps),
            )
          ) {
            clear = false;
            break;
          }
        if (clear) {
          p.splice(0, 3, ...next);
          if (distance < 0.9) {
            const before = this.level;
            this.total = Math.min(1e8, this.total + orb.value);
            orb.life = 0;
            if (this.level > before || this.soundTimer <= 0) {
              this.onPickup(this.level > before);
              this.soundTimer = 0.08;
            }
            continue;
          }
        }
      }
      const fluid = world.fluids.get(cell.q, Math.floor(p[1]), cell.r);
      const nextY = p[1] + (fluid ? 0.25 : -2.5) * dt;
      if (!world.pointSolid(p[0], nextY - 0.1, p[2])) p[1] = nextY;
      if (visible < 128 && distance < 44) {
        this.dummy.position.set(
          p[0],
          p[1] + Math.sin(this.clock * 3 + p[0]) * 0.04,
          p[2],
        );
        this.dummy.rotation.set(0, this.clock * 1.8 + p[2], 0);
        this.dummy.scale.setScalar(
          1 + Math.min(1.2, Math.log2(orb.value + 1) * 0.2),
        );
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(visible++, this.dummy.matrix);
      }
    }
    this.records = this.records.filter((o) => o.life > 0);
    this.mesh.count = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
