import * as THREE from 'three';
import { worldToAxial } from './core.js';
import { MOBS } from './mob-data.js';
import { mobSkin } from './mob-skins.js';
import { SHULKER_NORMALS } from './shulker-data.js';

const directions = SHULKER_NORMALS.map((n) => new THREE.Vector3(...n));
export class ShulkerBullets {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.balls = [];
    this.geometry = new THREE.SphereGeometry(0.13, 6, 3);
    this.plane = new THREE.PlaneGeometry(0.32, 0.32);
    this.core = new THREE.MeshBasicMaterial({ color: '#f4e7cb' });
    this.material = new THREE.MeshBasicMaterial({
      map: mobSkin('mobs_mc_shulkerbullet'),
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
    });
  }
  get combatants() {
    return this.balls;
  }
  shoot(point, normal, ownerId) {
    if (this.balls.length >= 24) this.remove(this.balls[0]);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.geometry, this.core));
    for (const angle of [0, Math.PI / 2]) {
      const star = new THREE.Mesh(this.plane, this.material);
      star.rotation.y = angle;
      mesh.add(star);
    }
    mesh.position.copy(point);
    this.scene.add(mesh);
    const ball = {
      mesh,
      bossType: 'shulkerBullet',
      ownerId,
      velocity: normal.clone().multiplyScalar(3),
      direction: normal.clone(),
      life: 12,
      route: 0.4,
      trail: 0,
    };
    ball.hitboxes = () => [{ center: mesh.position.clone(), radius: 0.23 }];
    this.balls.push(ball);
    this.callbacks.sound?.('shulkerShoot');
  }
  remove(ball) {
    const index = this.balls.indexOf(ball);
    if (index < 0) return;
    this.balls.splice(index, 1);
    ball.mesh.removeFromParent();
  }
  clear() {
    for (const ball of [...this.balls]) this.remove(ball);
  }
  hit(ball) {
    if (!this.balls.includes(ball)) return;
    const point = ball.mesh.position.clone();
    this.remove(ball);
    this.callbacks.spark?.(point, 10);
    this.callbacks.sound?.('shulkerPop');
  }
  target(camera, limit) {
    const ray = new THREE.Ray(
        camera.position,
        camera.getWorldDirection(new THREE.Vector3()),
      ),
      hit = new THREE.Vector3();
    let nearest = null,
      distance = limit;
    for (const ball of this.balls) {
      if (!ray.intersectSphere(new THREE.Sphere(ball.mesh.position, 0.25), hit))
        continue;
      const d = hit.distanceTo(camera.position);
      if (d < distance) {
        nearest = ball;
        distance = d;
      }
    }
    return nearest;
  }
  clearPath(world, point) {
    const a = worldToAxial(point.x, point.z);
    if (point.y < 0 || point.y > 180 || !world.loaded(a.q, a.r)) return false;
    return (
      !world.pointSolid(point.x, point.y, point.z) &&
      !directions.some((n) => {
        const probe = point.clone().addScaledVector(n, 0.11);
        return world.pointSolid(probe.x, probe.y, probe.z);
      })
    );
  }
  route(world, ball, target) {
    const toward = target.clone().sub(ball.mesh.position).normalize();
    const candidates = directions
      .map((direction) => ({
        direction,
        score: direction.dot(toward) + Math.random() * 0.12,
      }))
      .sort((a, b) => b.score - a.score);
    const next = candidates.find(({ direction }) =>
      [0.3, 0.6].every((d) =>
        this.clearPath(
          world,
          ball.mesh.position.clone().addScaledVector(direction, d),
        ),
      ),
    );
    if (next) ball.direction.copy(next.direction);
    ball.route = 0.35 + Math.random() * 0.3;
  }
  update(dt, world, creatures, camera, feet, height, creative) {
    if (creative) {
      this.clear();
      return;
    }
    const target = camera.position.clone();
    target.y = feet + height / 2;
    const ray = new THREE.Ray(),
      point = new THREE.Vector3(),
      sphere = new THREE.Sphere();
    for (const ball of [...this.balls]) {
      if (!this.balls.includes(ball)) continue;
      ball.life -= dt;
      ball.route -= dt;
      ball.trail -= dt;
      if (ball.life <= 0 || !this.clearPath(world, ball.mesh.position)) {
        this.hit(ball);
        continue;
      }
      if (
        ball.route <= 0 ||
        !this.clearPath(
          world,
          ball.mesh.position.clone().addScaledVector(ball.direction, 0.6),
        )
      )
        this.route(world, ball, target);
      ball.velocity.lerp(
        ball.direction.clone().multiplyScalar(4.5),
        1 - Math.exp(-dt * 5),
      );
      const steps = Math.max(1, Math.ceil((ball.velocity.length() * dt) / 0.1)),
        step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const from = ball.mesh.position.clone(),
          to = from.clone().addScaledVector(ball.velocity, step),
          direction = to.clone().sub(from).normalize(),
          length = from.distanceTo(to);
        if (!this.clearPath(world, to)) {
          this.hit(ball);
          break;
        }
        ray.set(from, direction);
        let nearest = null,
          distance = Infinity;
        const check = (center, radius, actor) => {
          sphere.set(center, radius + 0.12);
          const inside = sphere.containsPoint(from);
          if (inside || ray.intersectSphere(sphere, point)) {
            const d = inside ? 0 : from.distanceTo(point);
            if (d <= length && d < distance) {
              nearest = actor;
              distance = d;
            }
          }
        };
        for (const h of [0.3, height / 2, height - 0.3])
          check(
            new THREE.Vector3(camera.position.x, feet + h, camera.position.z),
            0.35,
            'player',
          );
        for (const mob of creatures) {
          if (mob.id === ball.ownerId || !mob.mesh.visible) continue;
          const def = MOBS[mob.kind];
          const boxes = mob.hitboxes
            ? mob.hitboxes()
            : (def.hitHeights || [def.hitHeight || def.height * 0.5]).map(
                (h) => ({
                  center: mob.mesh.position
                    .clone()
                    .add(new THREE.Vector3(0, h * (mob.baby ? 0.55 : 1), 0)),
                  radius: (def.hitRadius || 0.5) * (mob.baby ? 0.55 : 1),
                }),
              );
          for (const box of boxes) check(box.center, box.radius, mob);
        }
        if (nearest) {
          // Remove before damage: a death or teleport can clear every projectile.
          ball.mesh.position.copy(from).addScaledVector(direction, distance);
          this.hit(ball);
          const source = from.clone().addScaledVector(direction, -2);
          if (nearest === 'player') this.callbacks.playerHit?.(4, source);
          else this.callbacks.mobHit?.(nearest, 4, direction);
          break;
        }
        ball.mesh.position.copy(to);
      }
      if (this.balls.includes(ball)) {
        ball.mesh.rotation.y += dt * 3;
        ball.mesh.rotation.z += dt * 1.5;
        if (ball.trail <= 0) {
          this.callbacks.spark?.(ball.mesh.position, 1);
          ball.trail = 0.1;
        }
      }
    }
  }
}
