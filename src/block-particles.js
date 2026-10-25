import * as THREE from 'three';
import { BLOCKS, axialToWorld } from './core.js';

const LIMIT = 160;
export class BlockParticles {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.pool = [];
    this.materials = new Map();
    this.next = 0;
  }
  material(type, top) {
    const def = BLOCKS[type] || {},
      tile =
        def.base ||
        def.planks ||
        (type === 'torch'
          ? 'wood'
          : def.shape === 'campfire'
            ? 'campfireLog'
            : type);
    const name = tile + (top ? ':top' : ':side');
    if (!this.materials.has(name))
      this.materials.set(
        name,
        new THREE.MeshLambertMaterial({
          map: this.textures.single(name),
          alphaTest: 0.35,
          side: THREE.DoubleSide,
        }),
      );
    return this.materials.get(name);
  }
  emit(type, point, normal, strong = false) {
    const index = this.next++ % LIMIT;
    let particle = this.pool[index];
    if (!particle) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
      mesh.raycast = () => {};
      this.scene.add(mesh);
      particle = { mesh, velocity: new THREE.Vector3() };
      this.pool[index] = particle;
    }
    const mesh = particle.mesh,
      size = strong
        ? 0.08 + Math.random() * 0.09
        : 0.055 + Math.random() * 0.055;
    mesh.material = this.material(type, normal.y > 0.5);
    mesh.position.copy(point).addScaledVector(normal, 0.025);
    mesh.scale.setScalar(size);
    mesh.visible = true;
    particle.size = size;
    particle.life = strong
      ? 0.55 + Math.random() * 0.35
      : 0.3 + Math.random() * 0.2;
    particle.spin = (Math.random() - 0.5) * 4;
    particle.angle = Math.random() * Math.PI * 2;
    particle.velocity
      .set(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.8,
        (Math.random() - 0.5) * 2,
      )
      .addScaledVector(normal, strong ? 1.5 : 0.6);
    const uv = mesh.geometry.attributes.uv,
      x = Math.random() * 0.75,
      y = Math.random() * 0.75;
    uv.setXY(0, x, y + 0.25);
    uv.setXY(1, x + 0.25, y + 0.25);
    uv.setXY(2, x, y);
    uv.setXY(3, x + 0.25, y);
    uv.needsUpdate = true;
  }
  hit(target) {
    const p = axialToWorld(target.q, target.r);
    const point = target.point || new THREE.Vector3(p.x, target.y + 0.6, p.z);
    const normal = target.normal || new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 3; i++) this.emit(target.type, point, normal);
  }
  burst(target, geometry) {
    const pos = geometry.attributes.position,
      normals = geometry.attributes.normal;
    if (!pos?.count) return;
    const p = axialToWorld(target.q, target.r),
      origin = new THREE.Vector3(p.x, target.y, p.z);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const triangle = Math.floor((Math.random() * pos.count) / 3) * 3;
      a.fromBufferAttribute(pos, triangle);
      b.fromBufferAttribute(pos, triangle + 1);
      c.fromBufferAttribute(pos, triangle + 2);
      let u = Math.random(),
        v = Math.random();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const point = a
        .clone()
        .addScaledVector(b.sub(a), u)
        .addScaledVector(c.sub(a), v)
        .add(origin);
      normal.fromBufferAttribute(normals, triangle);
      this.emit(target.type, point, normal, true);
    }
  }
  frame(dt, world, camera) {
    for (const p of this.pool) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.velocity.y -= dt * 12;
      const next = p.mesh.position.clone().addScaledVector(p.velocity, dt);
      if (!world.pointSolid(next.x, next.y, next.z)) p.mesh.position.copy(next);
      else p.velocity.multiplyScalar(0.2);
      p.mesh.quaternion.copy(camera.quaternion);
      p.angle += p.spin * dt;
      p.mesh.rotateZ(p.angle);
      p.mesh.scale.setScalar(p.size * Math.min(1, p.life * 4));
    }
  }
  clear() {
    for (const p of this.pool) p.mesh.visible = false;
  }
}
