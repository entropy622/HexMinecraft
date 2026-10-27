import * as THREE from 'three';
import { MOBS } from './mob-data.js';
import { worldToAxial } from './core.js';
import { arrowDamage } from './archery.js';

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.arrows = [];
    this.up = new THREE.Vector3(0, 1, 0);
    this.shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.65, 4);
    this.tip = new THREE.ConeGeometry(0.055, 0.15, 4);
    this.wood = new THREE.MeshLambertMaterial({ color: '#99713d' });
    this.metal = new THREE.MeshLambertMaterial({ color: '#bbc5c6' });
    this.coldTip = new THREE.MeshLambertMaterial({ color: '#83a6c2' });
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
  shoot(
    position,
    direction,
    power,
    recoverable,
    owner = 'player',
    damageMultiplier = 1,
    options = {},
  ) {
    if (this.arrows.length >= 32) this.remove(this.arrows[0]);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.shaft, this.wood));
    const tip = new THREE.Mesh(
      this.tip,
      options.effect ? this.coldTip : this.metal,
    );
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
      velocity: direction
        .clone()
        .multiplyScalar(owner === 'player' ? power * 60 : 10 + power * 23),
      life: 40,
      damage: (2 + power * 8) * damageMultiplier,
      stuck: false,
      recoverable,
      owner,
      effect: options.effect,
      power: options.power || 0,
      punch: options.punch || 0,
      critical: owner === 'player' && power >= 1,
      damageMultiplier,
      playerPhysics: owner === 'player',
    });
  }
  update(
    dt,
    world,
    creatures,
    camera,
    onHit,
    onPickup,
    onPlayerHit = () => {},
  ) {
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
          if (onPickup()) this.remove(arrow);
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
        arrow.velocity.y -= (arrow.playerPhysics ? 20 : 13) * step;
        if (arrow.playerPhysics)
          arrow.velocity.multiplyScalar(Math.exp(-0.2 * step));
        const direction = arrow.velocity.clone().normalize();
        const length = arrow.velocity.length() * step;
        arrow.mesh.position.addScaledVector(arrow.velocity, step);
        const p = arrow.mesh.position,
          a = worldToAxial(p.x, p.z);
        if (p.y < 0 || p.y > 512 || !world.loaded(a.q, a.r)) {
          this.remove(arrow);
          break;
        }
        if (world.pointSolid(p.x, p.y, p.z)) {
          arrow.mesh.position.copy(previous);
          arrow.stuck = true;
          break;
        }
        ray.set(previous, direction);
        let nearest = null,
          nearestPart = null,
          distance = Infinity;
        if (arrow.owner === 'hostile') {
          sphere.center
            .copy(camera.position)
            .add(new THREE.Vector3(0, -0.65, 0));
          sphere.radius = 0.5;
          if (
            ray.intersectSphere(sphere, point) &&
            previous.distanceTo(point) <= length
          ) {
            // A point upstream from impact preserves the incoming direction,
            // even if this simulation step has crossed the player's center.
            const source = point.clone().addScaledVector(direction, -2);
            const blocked = onPlayerHit(4, source, arrow.effect) === 'blocked';
            if (blocked) {
              arrow.owner = 'player';
              arrow.recoverable = true;
              arrow.damage = 1;
              arrow.fixedDamage = 1;
              arrow.critical = false;
              arrow.punch = 0;
              arrow.velocity.multiplyScalar(-0.12);
              arrow.velocity.y = -1;
              arrow.mesh.position
                .copy(previous)
                .addScaledVector(direction, -0.35);
              arrow.life = Math.min(arrow.life, 15);
              break;
            }
            this.remove(arrow);
            break;
          }
        }
        for (const mob of arrow.owner === 'hostile' ? [] : creatures) {
          if (!mob.mesh.visible) continue;
          const def = MOBS[mob.kind];
          const boxes = mob.hitboxes
            ? mob.hitboxes()
            : (def.hitHeights || [def.hitHeight || def.height * 0.5]).map(
                (height) => ({
                  center: mob.mesh.position
                    .clone()
                    .add(
                      new THREE.Vector3(0, height * (mob.baby ? 0.6 : 1), 0),
                    ),
                  radius:
                    (def.hitRadius || (mob.kind === 'chicken' ? 0.32 : 0.6)) *
                    (mob.baby ? 0.55 : 1),
                }),
              );
          for (const box of boxes) {
            sphere.center.copy(box.center);
            sphere.radius = box.radius;
            const inside = sphere.containsPoint(previous);
            if (inside || ray.intersectSphere(sphere, point)) {
              const d = inside ? 0 : previous.distanceTo(point);
              if (d <= length && d < distance) {
                nearest = mob;
                distance = d;
                nearestPart = box.part;
              }
            }
          }
        }
        if (nearest) {
          const damage =
            arrow.fixedDamage ??
            (arrow.playerPhysics
              ? arrowDamage(
                  arrow.velocity.length(),
                  arrow.power,
                  arrow.critical,
                ) * arrow.damageMultiplier
              : arrow.damage);
          const result = onHit(
            nearest,
            damage,
            direction,
            nearestPart,
            arrow.punch,
          );
          if (result === 'deflected') {
            arrow.velocity.multiplyScalar(-0.2);
            arrow.velocity.y = 0.8;
            arrow.mesh.position
              .copy(previous)
              .addScaledVector(direction, -0.18);
            arrow.damage = 1;
            arrow.fixedDamage = 1;
            arrow.critical = false;
            arrow.punch = 0;
            arrow.life = Math.min(arrow.life, 8);
            break;
          }
          if (result !== 'dodged') {
            this.remove(arrow);
            break;
          }
        }
        const fluid = world.fluids.get(a.q, Math.floor(p.y), a.r);
        if (fluid) arrow.velocity.multiplyScalar(Math.exp(-step * 3));
        arrow.mesh.quaternion.setFromUnitVectors(this.up, direction);
      }
    }
  }
}
