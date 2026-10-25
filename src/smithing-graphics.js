import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { facingAngle } from './building-shapes.js';
export class SmithingModels {
  constructor(textures) {
    this.models = new Map();
    this.materials = new Map();
    const tile = (name) =>
      new THREE.MeshLambertMaterial({ map: textures.single(name) });
    this.base = tile('anvilBase:side');
    this.metal = tile('anvil:side');
    this.wood = tile('planks:side');
    this.rim = tile('grindstone:side');
    this.cap = tile('grindstone:top');
    this.bracket = tile('grindstoneFrame:side');
    for (const type of ['anvil', 'chippedAnvil', 'damagedAnvil'])
      this.materials.set(type, tile(type + ':top'));
  }
  create(world, q, y, r, origin) {
    const type = world.get(q, y, r),
      root = new THREE.Group(),
      p = axialToWorld(q, r),
      key = `${q},${y},${r}`;
    root.position.set(p.x - origin.x, y, p.z - origin.z);
    root.rotation.y = facingAngle(world.state(q, y, r).facing);
    root.userData.smithRoot = key;
    root.userData.action = 0;
    const add = (parent, geometry, material, x, cy, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, cy, z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.station = { q, y, r, type };
      parent.add(mesh);
      return mesh;
    };
    if (type === 'grindstone') {
      add(
        root,
        new THREE.CylinderGeometry(0.94, 0.94, 0.16, 6).rotateY(Math.PI / 6),
        this.wood,
        0,
        0.08,
        0,
      );
      for (const sign of [-1, 1])
        add(
          root,
          new THREE.BoxGeometry(0.16, 0.7, 0.32),
          this.bracket,
          sign * 0.49,
          0.49,
          0,
        );
      const wheel = new THREE.Group();
      wheel.position.y = 0.66;
      const stone = new THREE.CylinderGeometry(0.36, 0.36, 0.75, 6);
      stone.rotateZ(Math.PI / 2);
      add(wheel, stone, [this.rim, this.cap, this.cap], 0, 0, 0);
      const axle = new THREE.CylinderGeometry(0.06, 0.06, 1.18, 6);
      axle.rotateZ(Math.PI / 2);
      add(wheel, axle, this.metal, 0, 0, 0);
      add(
        wheel,
        new THREE.BoxGeometry(0.08, 0.24, 0.08),
        this.wood,
        0.61,
        -0.1,
        0,
      );
      root.add(wheel);
      root.userData.wheel = wheel;
    } else {
      add(
        root,
        new THREE.CylinderGeometry(0.94, 0.94, 0.2, 6).rotateY(Math.PI / 6),
        this.base,
        0,
        0.1,
        0,
      );
      add(
        root,
        new THREE.CylinderGeometry(0.43, 0.66, 0.15, 6).rotateY(Math.PI / 6),
        this.metal,
        0,
        0.27,
        0,
      );
      add(
        root,
        new THREE.CylinderGeometry(0.32, 0.43, 0.32, 6).rotateY(Math.PI / 6),
        this.metal,
        0,
        0.49,
        0,
      );
      const head = add(
        root,
        new THREE.CylinderGeometry(0.96, 0.73, 0.35, 6).rotateY(Math.PI / 6),
        [this.metal, this.materials.get(type), this.base],
        0,
        0.825,
        0,
      );
      head.scale.z = 0.65;
      root.userData.head = head;
    }
    this.models.set(key, root);
    return root;
  }
  use(key) {
    const root = this.models.get(key);
    if (root) root.userData.action = 0.9;
  }
  release(chunk) {
    chunk.traverse((object) => {
      const key = object.userData.smithRoot;
      if (key && this.models.get(key) === object) this.models.delete(key);
    });
  }
  frame(dt) {
    let changed = false;
    for (const root of this.models.values()) {
      const data = root.userData;
      if (data.action <= 0) continue;
      data.action = Math.max(0, data.action - dt);
      if (data.wheel) data.wheel.rotation.x += dt * data.action * 20;
      if (data.head)
        data.head.position.y =
          0.825 - Math.sin(data.action * 30) * data.action * 0.018;
      changed = true;
    }
    return changed;
  }
}
