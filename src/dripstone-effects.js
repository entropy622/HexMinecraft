import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { pointedTip, dripstoneRoot } from './dripstone.js';

// Cosmetic drips share one fixed buffer; no liquid blocks or light are spawned.
export class DripstoneEffects {
  constructor(scene) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(96 * 3);
    this.colors = new Float32Array(96 * 3);
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.colors, 3),
    );
    this.material = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
    scene.add(this.points);
    this.clear();
  }
  clear() {
    this.emitters = [];
    this.scan = 0;
    this.geometry.setDrawRange(0, 0);
  }
  frame(dt, time, world, camera) {
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.5;
      this.emitters = [];
      for (const k of world.dripstoneCells) {
        const [q, y, r] = k.split(',').map(Number),
          p = axialToWorld(q, r);
        if (
          !world.state(q, y, r).upper ||
          !pointedTip(world, q, y, r) ||
          world.fluids.get(q, y, r) ||
          Math.hypot(
            p.x - camera.position.x,
            y - camera.position.y,
            p.z - camera.position.z,
          ) > 18
        )
          continue;
        const root = dripstoneRoot(world, q, y, r),
          source = world.fluids.get(q, root.y + 2, r);
        let floor = y - 1;
        while (
          floor > 0 &&
          !world.get(q, floor, r) &&
          !world.fluids.get(q, floor, r)
        )
          floor--;
        this.emitters.push({
          x: p.x,
          y: y - 0.06,
          z: p.z,
          floor: floor + 1,
          color:
            source?.type === 'lava' ? [0.95, 0.32, 0.06] : [0.32, 0.64, 0.88],
        });
      }
      this.emitters.sort(
        (a, b) =>
          Math.hypot(a.x - camera.position.x, a.z - camera.position.z) -
          Math.hypot(b.x - camera.position.x, b.z - camera.position.z),
      );
      this.emitters.length = Math.min(24, this.emitters.length);
    }
    const count = this.emitters.length * 4;
    for (let i = 0; i < count; i++) {
      const e = this.emitters[Math.floor(i / 4)],
        age = (time * 0.7 + i * 0.71) % 3,
        y = e.y - age * age * 1.5;
      this.positions.set([e.x, y > e.floor ? y : -100, e.z], i * 3);
      this.colors.set(e.color, i * 3);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }
}
