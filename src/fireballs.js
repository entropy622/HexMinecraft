import * as THREE from 'three';
import { worldToAxial } from './core.js';
import { MOBS } from './mob-data.js';
import { LIQUIDS, fluidHeight } from './fluids.js';
import { mobImage } from './texture-pack.js';

export class Fireballs {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.balls = [];
    this.core = new THREE.SphereGeometry(1, 6, 4);
    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffb43c').multiplyScalar(2),
    });
    const texture = new THREE.Texture(mobImage('mcl_fire_fire_charge'));
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: '#ffefb1',
    });
    this.sparkMaterial = new THREE.PointsMaterial({
      color: '#ffbf4c',
      size: 0.065,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    // A fixed small light pool avoids changing shader light counts on every shot.
    this.lights = Array.from({ length: 2 }, () => {
      const light = new THREE.PointLight('#ffae45', 0, 5, 2);
      scene.add(light);
      return light;
    });
  }
  shoot(kind, position, target, ownerId) {
    if (this.balls.length >= 24) this.remove(this.balls[0]);
    const large = kind === 'large',
      radius = large ? 0.32 : 0.13,
      mesh = new THREE.Group();
    const core = new THREE.Mesh(this.core, this.material);
    core.scale.setScalar(radius);
    mesh.add(core);
    const sprite = new THREE.Sprite(this.spriteMaterial);
    sprite.scale.setScalar(radius * 3.3);
    mesh.add(sprite);
    mesh.position.copy(position);
    this.scene.add(mesh);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(16 * 3), 3),
    );
    const trail = new THREE.Points(geometry, this.sparkMaterial);
    trail.frustumCulled = false;
    this.scene.add(trail);
    this.balls.push({
      mesh,
      core,
      trail,
      radius,
      large,
      ownerId,
      reflected: false,
      life: large ? 10 : 6,
      velocity: target
        .clone()
        .sub(position)
        .normalize()
        .multiplyScalar(large ? 8.5 : 14),
    });
    this.callbacks.sound?.(large ? 'ghastFire' : 'blazeFire');
  }
  remove(ball) {
    const index = this.balls.indexOf(ball);
    if (index < 0) return;
    this.balls.splice(index, 1);
    ball.mesh.removeFromParent();
    ball.trail.removeFromParent();
    ball.trail.geometry.dispose();
  }
  clear() {
    for (const b of [...this.balls]) this.remove(b);
    for (const light of this.lights) light.intensity = 0;
  }
  target(camera, limit = 3.5) {
    const ray = new THREE.Ray(
      camera.position,
      camera.getWorldDirection(new THREE.Vector3()),
    );
    const point = new THREE.Vector3();
    let nearest = null,
      distance = limit;
    for (const ball of this.balls) {
      if (!ball.large) continue;
      if (
        !ray.intersectSphere(new THREE.Sphere(ball.mesh.position, 0.55), point)
      )
        continue;
      const d = point.distanceTo(camera.position);
      if (d <= distance) {
        nearest = ball;
        distance = d;
      }
    }
    return nearest;
  }
  reflect(ball, direction) {
    ball.velocity.copy(direction).normalize().multiplyScalar(20);
    ball.reflected = true;
    ball.life = 8;
    ball.mesh.position.addScaledVector(direction, 0.15);
    this.callbacks.sound?.('fireballDeflect');
  }
  impact(ball, position, excludeId = null) {
    if (ball.large) this.callbacks.explode(position, ball.reflected, excludeId);
    else this.callbacks.spark?.(position);
    this.remove(ball);
  }
  update(dt, world, creatures, camera) {
    const ray = new THREE.Ray(),
      sphere = new THREE.Sphere(),
      point = new THREE.Vector3();
    for (const b of [...this.balls]) {
      b.life -= dt;
      if (b.life <= 0) {
        this.remove(b);
        continue;
      }
      if (b.large && !b.reflected)
        b.velocity.setLength(Math.min(13, b.velocity.length() + dt * 1.2));
      const steps = Math.max(1, Math.ceil((b.velocity.length() * dt) / 0.14)),
        step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const previous = b.mesh.position.clone(),
          direction = b.velocity.clone().normalize(),
          length = b.velocity.length() * step;
        b.mesh.position.addScaledVector(b.velocity, step);
        const p = b.mesh.position,
          cell = worldToAxial(p.x, p.z),
          y = Math.floor(p.y);
        if (p.y < 0 || p.y > 64 || !world.loaded(cell.q, cell.r)) {
          this.remove(b);
          break;
        }
        const fluid = world.fluids.get(cell.q, y, cell.r);
        if (
          fluid &&
          LIQUIDS[fluid.type].coolant &&
          p.y < y + fluidHeight(fluid)
        ) {
          this.callbacks.spark?.(p);
          this.remove(b);
          break;
        }
        if (world.pointSolid(p.x, p.y, p.z)) {
          this.impact(b, previous);
          break;
        }
        ray.set(previous, direction);
        let nearest = null,
          closest = Infinity;
        if (!b.reflected) {
          sphere.center.copy(camera.position);
          sphere.center.y -= 0.65;
          sphere.radius = 0.45 + b.radius;
          if (
            ray.intersectSphere(sphere, point) &&
            previous.distanceTo(point) <= length
          ) {
            closest = previous.distanceTo(point);
            nearest = { player: true, point: point.clone() };
          }
        }
        for (const mob of creatures) {
          if (!mob.mesh.visible || (!b.reflected && mob.id === b.ownerId))
            continue;
          const def = MOBS[mob.kind];
          sphere.center.copy(mob.mesh.position);
          sphere.center.y += def.hitHeight || def.height * 0.5;
          sphere.radius =
            (def.hitRadius || 0.6) * (mob.baby ? 0.55 : 1) + b.radius;
          if (ray.intersectSphere(sphere, point)) {
            const distance = previous.distanceTo(point);
            if (distance <= length && distance < closest) {
              closest = distance;
              nearest = { mob, point: point.clone() };
            }
          }
        }
        if (!nearest) continue;
        if (nearest.player) {
          if (!b.large)
            this.callbacks.playerHit(
              5,
              nearest.point.clone().addScaledVector(direction, -1.5),
            );
          this.impact(b, nearest.point);
          break;
        }
        const mob = nearest.mob,
          returned =
            b.reflected && mob.kind === 'ghast' && mob.id === b.ownerId;
        const direct = returned
          ? 1000
          : MOBS[mob.kind].fireImmune
            ? 0
            : b.large
              ? 6
              : 5;
        if (direct) this.callbacks.hit(mob, direct, direction, b.reflected);
        if (returned) this.callbacks.returned?.();
        this.impact(b, nearest.point, direct ? mob.id : null);
        break;
      }
      if (!this.balls.includes(b)) continue;
      b.core.rotation.x += dt * 2;
      b.core.rotation.z += dt * 1.4;
      const positions = b.trail.geometry.getAttribute('position'),
        direction = b.velocity.clone().normalize();
      for (let i = 0; i < positions.count; i++) {
        const spread = i * 0.006,
          behind = i * (b.large ? 0.07 : 0.04);
        positions.setXYZ(
          i,
          b.mesh.position.x -
            direction.x * behind +
            Math.sin(i * 3 + b.life * 12) * spread,
          b.mesh.position.y -
            direction.y * behind +
            Math.cos(i + b.life * 9) * spread,
          b.mesh.position.z -
            direction.z * behind +
            Math.sin(i * 7 + b.life * 8) * spread,
        );
      }
      positions.needsUpdate = true;
    }
    const nearest = [...this.balls].sort(
      (a, b) =>
        a.mesh.position.distanceToSquared(camera.position) -
        b.mesh.position.distanceToSquared(camera.position),
    );
    this.lights.forEach((light, i) => {
      const b = nearest[i];
      light.intensity = b ? (b.large ? 4 : 1.5) : 0;
      if (b) {
        light.position.copy(b.mesh.position);
        // Keep hidden fireballs from illuminating the player's side of a wall.
        const sample = new THREE.Vector3(),
          steps = Math.ceil(camera.position.distanceTo(b.mesh.position) / 0.35);
        for (let j = 1; j < steps; j++) {
          sample.copy(camera.position).lerp(b.mesh.position, j / steps);
          if (world.pointSolid(sample.x, sample.y, sample.z)) {
            light.intensity = 0;
            break;
          }
        }
      }
    });
  }
}
