import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { facingAngle } from './building-shapes.js';

export class ChestModels {
  constructor(textures) {
    this.models = new Map();
    this.openKey = null;
    this.side = new THREE.MeshLambertMaterial({
      map: textures.single('chest:side'),
    });
    this.top = new THREE.MeshLambertMaterial({
      map: textures.single('chest:top'),
    });
    this.inside = new THREE.MeshLambertMaterial({ color: '#382b1b' });
    this.trim = new THREE.MeshLambertMaterial({ color: '#533c23' });
    this.lock = new THREE.MeshLambertMaterial({ color: '#d7c280' });
  }

  create(world, q, y, r, origin) {
    const root = new THREE.Group(),
      p = axialToWorld(q, r),
      key = `${q},${y},${r}`;
    root.position.set(p.x - origin.x, y, p.z - origin.z);
    root.rotation.y = facingAngle(world.state(q, y, r).facing);
    root.userData.chestRoot = key;
    const add = (parent, geometry, material, y, z = 0) => {
      if (geometry.type === 'CylinderGeometry') geometry.rotateY(Math.PI / 6);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.chest = { q, y: root.position.y, r, type: 'chest' };
      parent.add(mesh);
      return mesh;
    };
    add(
      root,
      new THREE.CylinderGeometry(0.96, 0.96, 0.66, 6),
      [this.side, this.inside, this.top],
      0.36,
    );
    for (const height of [0.075, 0.64])
      add(
        root,
        new THREE.CylinderGeometry(0.97, 0.97, 0.055, 6, 1, true),
        this.trim,
        height,
      );
    const lid = new THREE.Group();
    lid.position.set(0, 0.69, -0.82);
    add(
      lid,
      new THREE.CylinderGeometry(0.97, 0.97, 0.3, 6),
      [this.side, this.top, this.inside],
      0.15,
      0.82,
    );
    add(lid, new THREE.BoxGeometry(0.16, 0.21, 0.07), this.lock, 0.015, 1.66);
    root.add(lid);
    root.userData.lid = lid;
    this.models.set(key, root);
    return root;
  }

  release(chunk) {
    chunk.traverse((object) => {
      const key = object.userData.chestRoot;
      if (key && this.models.get(key) === object) this.models.delete(key);
    });
  }

  frame(dt) {
    let changed = false;
    for (const [key, root] of this.models) {
      const previous = root.userData.lid.rotation.x;
      root.userData.lid.rotation.x = THREE.MathUtils.damp(
        root.userData.lid.rotation.x,
        key === this.openKey ? -0.7 : 0,
        10,
        dt,
      );
      changed ||= Math.abs(previous - root.userData.lid.rotation.x) > 0.003;
    }
    return changed;
  }
}
