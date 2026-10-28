import {
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { axialToWorld } from './core.js';

// A fixed pool shares the existing leaf tiles. Cosmetic flecks never create
// drops, alter collisions or accumulate when a large crown decays at once.
export class LeafParticles {
  constructor(scene, textures) {
    this.group = new Group();
    scene.add(this.group);
    this.geometry = new PlaneGeometry(0.12, 0.16);
    this.materials = new Map(
      ['leaves', 'birchLeaves', 'spruceLeaves', 'jungleLeaves'].map((type) => [
        type,
        new MeshLambertMaterial({
          map: textures.single(type + ':side'),
          alphaTest: 0.4,
          side: DoubleSide,
        }),
      ]),
    );
    this.pool = [];
    this.next = 0;
  }
  spawn(q, y, r, type, camera) {
    const p = axialToWorld(q, r);
    if (Math.hypot(p.x - camera.x, y - camera.y, p.z - camera.z) > 24) return;
    for (let i = 0; i < 3; i++) {
      const index = this.next++ % 72;
      let particle = this.pool[index];
      if (!particle) {
        const mesh = new Mesh(this.geometry, this.materials.get(type));
        mesh.raycast = () => {};
        this.group.add(mesh);
        particle = { mesh };
        this.pool[index] = particle;
      }
      particle.mesh.material = this.materials.get(type);
      particle.mesh.visible = true;
      particle.mesh.position.set(
        p.x + Math.random() - 0.5,
        y + Math.random(),
        p.z + Math.random() - 0.5,
      );
      particle.mesh.rotation.set(Math.random() * Math.PI, Math.random() * 6, 0);
      particle.life = 2 + Math.random() * 2;
      particle.phase = Math.random() * Math.PI * 2;
    }
  }
  frame(dt, time, wind) {
    for (const p of this.pool) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      p.mesh.visible = p.life > 0;
      p.mesh.position.x +=
        (0.14 + wind * 3 + Math.sin(time * 2 + p.phase) * 0.12) * dt;
      p.mesh.position.z += Math.cos(time + p.phase) * dt * 0.18;
      p.mesh.position.y -= dt * (0.4 + 0.15 * Math.sin(time * 3 + p.phase));
      p.mesh.rotation.x += dt * 2.1;
      p.mesh.rotation.z = Math.sin(time * 3 + p.phase) * 0.7;
      p.mesh.scale.setScalar(Math.min(1, Math.max(0, p.life) * 2));
    }
  }
  clear() {
    for (const p of this.pool) p.mesh.visible = false;
  }
}
