import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { facingAngle } from './building-shapes.js';
import { POTIONS } from './brewing-data.js';
export class BrewingModels {
  constructor(textures) {
    this.models = new Map();
    this.colors = new Map();
    this.clock = 0;
    this.base = new THREE.MeshLambertMaterial({
      map: textures.single('brewingBase:side'),
    });
    this.metal = new THREE.MeshLambertMaterial({
      map: textures.single('brewingStand:side'),
    });
    this.glass = new THREE.MeshLambertMaterial({
      color: '#d5e9e1',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.cork = new THREE.MeshLambertMaterial({ color: '#85634b' });
    this.fire = new THREE.MeshBasicMaterial({ color: '#ffc666' });
  }
  create(world, q, y, r, origin) {
    const root = new THREE.Group(),
      p = axialToWorld(q, r),
      key = `${q},${y},${r}`;
    root.position.set(p.x - origin.x, y, p.z - origin.z);
    root.rotation.y = facingAngle(world.state(q, y, r).facing);
    root.userData.brewingRoot = key;
    const add = (parent, geometry, material, x, cy, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, cy, z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.station = { q, y, r, type: 'brewingStand' };
      parent.add(mesh);
      return mesh;
    };
    add(
      root,
      new THREE.CylinderGeometry(0.94, 0.94, 0.16, 6).rotateY(Math.PI / 6),
      this.base,
      0,
      0.08,
      0,
    );
    add(
      root,
      new THREE.CylinderGeometry(0.07, 0.1, 0.95, 6),
      this.metal,
      0,
      0.62,
      0,
    );
    const fire = add(
      root,
      new THREE.OctahedronGeometry(0.1),
      this.fire,
      0,
      0.28,
      0,
    );
    fire.castShadow = false;
    root.userData.fire = fire;
    root.userData.bottles = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3,
        x = Math.cos(angle) * 0.57,
        z = Math.sin(angle) * 0.57;
      const arm = add(
        root,
        new THREE.BoxGeometry(0.67, 0.055, 0.07),
        this.metal,
        x / 2,
        0.49,
        z / 2,
      );
      arm.rotation.y = -angle;
      const bottle = new THREE.Group();
      bottle.position.set(x, 0.2, z);
      add(
        bottle,
        new THREE.CylinderGeometry(0.14, 0.15, 0.27, 6),
        this.glass,
        0,
        0.15,
        0,
      );
      add(
        bottle,
        new THREE.CylinderGeometry(0.065, 0.065, 0.13, 6),
        this.glass,
        0,
        0.34,
        0,
      );
      add(
        bottle,
        new THREE.CylinderGeometry(0.07, 0.07, 0.045, 6),
        this.cork,
        0,
        0.43,
        0,
      );
      bottle.userData.liquid = add(
        bottle,
        new THREE.CylinderGeometry(0.12, 0.125, 0.16, 6),
        this.fire,
        0,
        0.11,
        0,
      );
      root.add(bottle);
      root.userData.bottles.push(bottle);
    }
    root.userData.bubbles = [];
    for (let i = 0; i < 5; i++) {
      const bubble = add(
        root,
        new THREE.OctahedronGeometry(0.022),
        this.fire,
        0,
        0,
        0,
      );
      bubble.castShadow = false;
      root.userData.bubbles.push(bubble);
    }
    this.models.set(key, root);
    return root;
  }
  release(chunk) {
    chunk.traverse((object) => {
      const k = object.userData.brewingRoot;
      if (k && this.models.get(k) === object) this.models.delete(k);
    });
  }
  frame(dt, world) {
    this.clock += dt;
    for (const [key, root] of this.models) {
      const b = world.brewing.get(key),
        active = !!b?.batch;
      root.userData.fire.visible = active;
      root.userData.fire.rotation.y = this.clock * 2;
      root.userData.bottles.forEach((bottle, i) => {
        const id = b?.bottles[i];
        bottle.visible = !!id;
        if (!id) return;
        if (!this.colors.has(id))
          this.colors.set(
            id,
            new THREE.MeshLambertMaterial({ color: POTIONS[id].color }),
          );
        bottle.userData.liquid.material = this.colors.get(id);
      });
      root.userData.bubbles.forEach((bubble, i) => {
        bubble.visible = active;
        const phase = (this.clock * 0.55 + i / 5) % 1,
          angle = (i * Math.PI * 2) / 5;
        bubble.position.set(
          Math.cos(angle) * 0.14,
          0.35 + phase * 0.8,
          Math.sin(angle) * 0.14,
        );
        bubble.scale.setScalar((1 - phase) * 0.8 + 0.2);
      });
    }
  }
}
