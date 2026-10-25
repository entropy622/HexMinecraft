import * as THREE from 'three';
import { axialToWorld } from './core.js';
import { effectImage, itemImage } from './texture-pack.js';

const SPRITES = 96;
const texture = (image) => {
  const map = new THREE.Texture(image);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
};
export class CampfireModels {
  constructor(scene) {
    this.scene = scene;
    this.models = new Map();
    this.clock = 0;
    this.foodMaterials = new Map();
    this.flames = [
      'mcl_campfires_campfire_fire',
      'mcl_campfires_soul_campfire_fire',
    ].map((name) => {
      const map = texture(effectImage(name));
      map.repeat.set(1, 0.125);
      return new THREE.MeshBasicMaterial({
        map,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.1,
        depthWrite: false,
        toneMapped: false,
      });
    });
    const smoke = texture(effectImage('mcl_campfires_particle_1'));
    // Smoke lives outside chunks: Sprite geometry belongs to Three.js and must
    // never be disposed by the terrain's owned-geometry teardown.
    this.smoke = Array.from({ length: SPRITES }, () => {
      const material = new THREE.SpriteMaterial({
        map: smoke,
        color: '#b8b1a8',
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Sprite(material);
      mesh.visible = false;
      mesh.raycast = () => {};
      scene.add(mesh);
      return { mesh, life: 0, age: 0 };
    });
  }
  reset() {
    this.smoke.forEach((p) => {
      p.life = 0;
      p.mesh.visible = false;
    });
  }
  create(world, q, y, r, origin) {
    const k = `${q},${y},${r}`,
      p = axialToWorld(q, r);
    const root = new THREE.Group();
    root.position.set(p.x - origin.x, y, p.z - origin.z);
    root.userData.campfireRoot = k;
    const material = this.flames[world.get(q, y, r) === 'soulCampfire' ? 1 : 0];
    const flame = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.36, 0.68),
        material,
      );
      mesh.position.y = 0.62;
      mesh.rotation.y = (i * Math.PI) / 3;
      mesh.raycast = () => {};
      flame.add(mesh);
    }
    root.add(flame);
    const foods = Array.from({ length: 6 }, (_, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        material,
      );
      const angle = (i * Math.PI) / 3;
      mesh.position.set(Math.cos(angle) * 0.59, 0.315, Math.sin(angle) * 0.59);
      mesh.rotation.set(-Math.PI / 2, 0, -angle);
      mesh.visible = false;
      mesh.raycast = () => {};
      root.add(mesh);
      return mesh;
    });
    root.userData.flame = flame;
    root.userData.foods = foods;
    root.userData.cell = { q, y, r, x: p.x, z: p.z };
    root.userData.smokeTimer = Math.random() * 0.6;
    this.models.set(k, root);
    return root;
  }
  release(chunk) {
    chunk.traverse((object) => {
      const k = object.userData.campfireRoot;
      if (k && this.models.get(k) === object) this.models.delete(k);
    });
  }
  puff(cell, signal) {
    const p = this.smoke.find((p) => !p.life);
    if (!p) return;
    p.age = 0;
    p.life = signal ? 13 : 5;
    p.vx = (Math.random() - 0.35) * 0.12;
    p.vz = (Math.random() - 0.5) * 0.1;
    p.mesh.position.set(
      cell.x + (Math.random() - 0.5) * 0.35,
      cell.y + 0.95,
      cell.z + (Math.random() - 0.5) * 0.35,
    );
    p.mesh.material.rotation = Math.random() * Math.PI;
    p.mesh.material.opacity = 0;
    p.mesh.scale.setScalar(0.3);
    p.mesh.visible = true;
  }
  frame(dt, world, camera) {
    this.clock += dt;
    const frame = Math.floor(this.clock * 10) % 8;
    this.flames.forEach((m) => (m.map.offset.y = 1 - (frame + 1) / 8));
    const nearby = [];
    for (const [k, root] of this.models) {
      const fire = world.campfires.get(k),
        cell = root.userData.cell;
      root.userData.flame.visible = !!fire?.lit;
      root.userData.flame.scale.set(
        1,
        1 + Math.sin(this.clock * 11 + cell.q) * 0.035,
        1,
      );
      root.userData.foods.forEach((mesh, i) => {
        const id = fire?.slots[i]?.item;
        mesh.visible = !!id;
        if (!id) return;
        if (!this.foodMaterials.has(id))
          this.foodMaterials.set(
            id,
            new THREE.MeshLambertMaterial({
              map: texture(itemImage(id)),
              alphaTest: 0.5,
              side: THREE.DoubleSide,
            }),
          );
        mesh.material = this.foodMaterials.get(id);
      });
      if (fire?.lit) {
        const distance =
          (cell.x - camera.position.x) ** 2 + (cell.z - camera.position.z) ** 2;
        if (distance < 48 ** 2) nearby.push({ root, distance });
      }
    }
    if (dt <= 0) return;
    nearby.sort((a, b) => a.distance - b.distance);
    for (const { root } of nearby.slice(0, 10)) {
      root.userData.smokeTimer -= dt;
      if (root.userData.smokeTimer > 0) continue;
      root.userData.smokeTimer = 0.65 + Math.random() * 0.2;
      const c = root.userData.cell;
      this.puff(c, world.get(c.q, c.y - 1, c.r) === 'hayBale');
    }
    for (const p of this.smoke) {
      if (!p.life) continue;
      p.age += dt;
      const pos = p.mesh.position,
        rise = dt * 0.92;
      if (
        p.age >= p.life ||
        world.columnSolid(pos.x, pos.z, pos.y, pos.y + rise)
      ) {
        p.life = 0;
        p.mesh.visible = false;
        continue;
      }
      pos.x += p.vx * dt;
      pos.z += p.vz * dt;
      pos.y += rise;
      p.mesh.scale.setScalar(0.35 + p.age * 0.16);
      p.mesh.material.opacity =
        Math.min(1, p.age * 3) * (1 - p.age / p.life) * 0.5;
    }
  }
}
