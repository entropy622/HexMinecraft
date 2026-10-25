import * as THREE from 'three';
import { worldToAxial } from './core.js';

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.arrows = [];
    this.up = new THREE.Vector3(0, 1, 0);
    this.shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.65, 4);
    this.tip = new THREE.ConeGeometry(0.055, 0.15, 4);
    this.wood = new THREE.MeshLambertMaterial({ color: '#99713d' });
    this.metal = new THREE.MeshLambertMaterial({ color: '#bbc5c6' });
    this.feather = new THREE.MeshLambertMaterial({
      color: '#f0e7cb',
      side: THREE.DoubleSide,
    });
    this.fletching = new THREE.PlaneGeometry(0.13, 0.18);
  }
  remove(arrow) {
    this.scene.remove(arrow.mesh);
    this.arrows.splice(this.arrows.indexOf(arrow), 1);
  }
  clear() {
    for (const a of [...this.arrows]) this.remove(a);
  }
  shoot(position, direction, power, recoverable) {
    if (this.arrows.length >= 32) this.remove(this.arrows[0]);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.shaft, this.wood));
    const tip = new THREE.Mesh(this.tip, this.metal);
    tip.position.y = 0.38;
    mesh.add(tip);
    for (const angle of [0, Math.PI / 2]) {
      const fin = new THREE.Mesh(this.fletching, this.feather);
      fin.position.y = -0.25;
      fin.rotation.y = angle;
      mesh.add(fin);
    }
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(this.up, direction);
    this.scene.add(mesh);
    this.arrows.push({
      mesh,
      velocity: direction.clone().multiplyScalar(10 + power * 23),
      life: 40,
      damage: 2 + power * 8,
      stuck: false,
      recoverable,
    });
  }
  update(dt, world, creatures, camera, onHit, onPickup) {
    const sphere = new THREE.Sphere(),
      ray = new THREE.Ray(),
      point = new THREE.Vector3();
    for (const arrow of [...this.arrows]) {
      arrow.life -= dt;
      if (arrow.life <= 0) {
        this.remove(arrow);
        continue;
      }
      if (arrow.stuck) {
        if (
          arrow.recoverable &&
          arrow.life < 39.5 &&
          arrow.mesh.position.distanceTo(camera.position) < 2.1
        ) {
          onPickup();
          this.remove(arrow);
        }
        continue;
      }
      const steps = Math.max(
        1,
        Math.ceil((arrow.velocity.length() * dt) / 0.14),
      );
      const step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const previous = arrow.mesh.position.clone();
        arrow.velocity.y -= 13 * step;
        const direction = arrow.velocity.clone().normalize();
        const length = arrow.velocity.length() * step;
        arrow.mesh.position.addScaledVector(arrow.velocity, step);
        const p = arrow.mesh.position,
          a = worldToAxial(p.x, p.z);
        if (p.y < 0 || p.y > 90 || !world.loaded(a.q, a.r)) {
          this.remove(arrow);
          break;
        }
        if (world.solid(a.q, Math.floor(p.y), a.r)) {
          arrow.mesh.position.copy(previous);
          arrow.stuck = true;
          break;
        }
        ray.set(previous, direction);
        let nearest = null,
          distance = Infinity;
        for (const mob of creatures) {
          if (!mob.mesh.visible) continue;
          sphere.center
            .copy(mob.mesh.position)
            .add(new THREE.Vector3(0, 0.75, 0));
          sphere.radius = 0.6;
          if (ray.intersectSphere(sphere, point)) {
            const d = previous.distanceTo(point);
            if (d <= length && d < distance) {
              nearest = mob;
              distance = d;
            }
          }
        }
        if (nearest) {
          onHit(nearest, arrow.damage, direction);
          this.remove(arrow);
          break;
        }
        const fluid = world.fluids.get(a.q, Math.floor(p.y), a.r);
        if (fluid) arrow.velocity.multiplyScalar(Math.exp(-step * 3));
        arrow.mesh.quaternion.setFromUnitVectors(this.up, direction);
      }
    }
  }
}
