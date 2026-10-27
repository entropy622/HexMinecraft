import * as THREE from 'three';
import { worldToAxial } from './core.js';

export class FlightEffects {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.rockets = [];
    this.particles = [];
    this.trail = this.wind = 0;
    this.geometry = new THREE.SphereGeometry(0.045, 6, 3);
    this.white = new THREE.MeshBasicMaterial({ color: '#e4efff' });
    this.gold = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe4a0').multiplyScalar(1.8),
    });
    this.body = new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6);
    this.tip = new THREE.ConeGeometry(0.075, 0.13, 6);
    this.red = new THREE.MeshLambertMaterial({ color: '#cf6258' });
  }
  clear() {
    for (const record of [...this.rockets, ...this.particles])
      record.mesh.removeFromParent();
    this.rockets.length = this.particles.length = 0;
    this.trail = this.wind = 0;
  }
  particle(point, velocity, life, gold = false) {
    if (this.particles.length >= 240)
      this.particles.shift().mesh.removeFromParent();
    const mesh = new THREE.Mesh(this.geometry, gold ? this.gold : this.white);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity, life, total: life });
  }
  burst(point) {
    for (let side = 0; side < 6; side++)
      for (let i = 0; i < 10; i++) {
        const angle = (side * Math.PI) / 3 + (Math.random() - 0.5) * 0.09;
        const speed = 2 + i * 0.5;
        this.particle(
          point,
          new THREE.Vector3(
            Math.cos(angle) * speed,
            (Math.random() - 0.5) * 5,
            Math.sin(angle) * speed,
          ),
          0.9 + Math.random() * 0.5,
          true,
        );
      }
    this.sound('fireworkBurst');
  }
  launch(point, direction = new THREE.Vector3(0, 1, 0)) {
    if (this.rockets.length >= 12) this.rockets.shift().mesh.removeFromParent();
    const mesh = new THREE.Group(),
      body = new THREE.Mesh(this.body, this.white),
      tip = new THREE.Mesh(this.tip, this.red);
    tip.position.y = 0.2;
    mesh.add(body, tip);
    mesh.position.copy(point);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.scene.add(mesh);
    this.rockets.push({
      mesh,
      life: 1.3,
      trail: 0,
      velocity: direction.clone().multiplyScalar(12),
    });
  }
  update(dt, world, camera, glider) {
    for (const rocket of [...this.rockets]) {
      rocket.life -= dt;
      rocket.trail -= dt;
      let burst = rocket.life <= 0;
      const steps = Math.max(1, Math.ceil((dt * 12) / 0.14));
      for (let i = 0; i < steps && !burst; i++) {
        rocket.mesh.position.addScaledVector(rocket.velocity, dt / steps);
        const p = rocket.mesh.position,
          a = worldToAxial(p.x, p.z);
        burst = !world.loaded(a.q, a.r) || world.pointSolid(p.x, p.y, p.z);
      }
      if (rocket.trail <= 0) {
        rocket.trail = 0.04;
        this.particle(
          rocket.mesh.position,
          rocket.velocity.clone().multiplyScalar(-1 / 24),
          0.3,
          true,
        );
      }
      if (burst) {
        this.burst(rocket.mesh.position);
        rocket.mesh.removeFromParent();
        this.rockets.splice(this.rockets.indexOf(rocket), 1);
      }
    }
    if (glider.active) {
      this.trail -= dt;
      this.wind -= dt;
      if (this.trail <= 0) {
        this.trail = glider.boost > 0 ? 0.035 : 0.09;
        const direction = camera.getWorldDirection(new THREE.Vector3());
        const point = camera.position.clone().addScaledVector(direction, -0.8);
        for (const side of [-1, 1]) {
          const p = point.clone();
          p.x += Math.cos(camera.rotation.y) * side * 0.55;
          p.z -= Math.sin(camera.rotation.y) * side * 0.55;
          this.particle(
            p,
            direction.clone().multiplyScalar(-0.6),
            0.35,
            glider.boost > 0,
          );
        }
      }
      if (this.wind <= 0 && glider.speed > 10) {
        this.wind = 0.22;
        this.sound('glideWind');
      }
    }
    for (const p of [...this.particles]) {
      p.life -= dt;
      p.velocity.y -= dt * 1.8;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.setScalar(Math.max(0, p.life / p.total));
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        this.particles.splice(this.particles.indexOf(p), 1);
      }
    }
  }
}
