import * as THREE from 'three';
import { axialToWorld } from './core.js';

// One bounded draw call for all nearby flowers; particles are cosmetic.
export class CaveAmbience {
  constructor(scene) {
    this.positions = new Float32Array(128 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.material = new THREE.PointsMaterial({
      color: '#accf82',
      size: 0.045,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
    scene.add(this.points);
    this.clear();
  }
  clear() {
    this.flowers = [];
    this.scan = 0;
    this.geometry.setDrawRange(0, 0);
  }
  frame(dt, time, world, camera) {
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.5;
      this.flowers = [...world.hangingPlants]
        .filter((k) => world.blocks.get(k) === 'sporeBlossom')
        .map((k) => {
          const [q, y, r] = k.split(',').map(Number),
            p = axialToWorld(q, r);
          return new THREE.Vector3(p.x, y + 0.6, p.z);
        })
        .filter((p) => p.distanceTo(camera.position) < 18)
        .sort(
          (a, b) =>
            a.distanceToSquared(camera.position) -
            b.distanceToSquared(camera.position),
        )
        .slice(0, 8);
    }
    const count = this.flowers.length * 16;
    for (let i = 0; i < count; i++) {
      const flower = this.flowers[Math.floor(i / 16)],
        phase = i * 2.399,
        fall = (time * 0.22 + i * 0.37) % 4,
        radius = 0.2 + fall * 0.4,
        x = flower.x + Math.sin(phase + time * 0.2) * radius,
        z = flower.z + Math.cos(phase + time * 0.17) * radius,
        y = flower.y - fall;
      this.positions.set([x, world.pointSolid(x, y, z) ? -100 : y, z], i * 3);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }
}
