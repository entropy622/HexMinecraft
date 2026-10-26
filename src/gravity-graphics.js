import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { buildingItemMesh } from './building-graphics.js';

export class FallingModels {
  constructor(scene, textures) {
    this.scene = scene;
    this.models = new Map();
    this.geometry = new THREE.CylinderGeometry(0.99, 0.99, 0.99, 6).rotateY(
      Math.PI / 3,
    );
    this.materials = Object.fromEntries(
      ['sand', 'gravel'].map((type) => [
        type,
        ['side', 'top', 'top'].map(
          (face) =>
            new THREE.MeshLambertMaterial({
              map: textures.single(type + ':' + face),
            }),
        ),
      ]),
    );
    const spike = buildingItemMesh('pointedDripstone', textures);
    this.spikeGeometry = spike.geometry.rotateZ(Math.PI).translate(0, 0.5, 0);
    this.spikeMaterial = spike.material;
  }
  clear() {
    for (const mesh of this.models.values()) this.scene.remove(mesh);
    this.models.clear();
  }
  frame(world) {
    const visible = new Set();
    for (const block of world.gravity.active) {
      if (!world.loaded(block.q, block.r)) continue;
      visible.add(block);
      if (!this.models.has(block)) {
        const spike = block.type === 'pointedDripstone';
        const mesh = new THREE.Mesh(
          spike ? this.spikeGeometry : this.geometry,
          spike ? this.spikeMaterial : this.materials[block.type],
        );
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.raycast = () => {};
        this.scene.add(mesh);
        this.models.set(block, mesh);
      }
      const p = axialToWorld(block.q, block.r);
      this.models
        .get(block)
        .position.set(
          p.x,
          block.y + (block.type === 'pointedDripstone' ? 0 : 0.5),
          p.z,
        );
    }
    for (const [block, mesh] of this.models)
      if (!visible.has(block)) {
        this.scene.remove(mesh);
        this.models.delete(block);
      }
  }
}
