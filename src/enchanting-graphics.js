import * as THREE from 'three';
import { axialToWorld } from './core.js';
const enchantTint = new THREE.Color('#7045ad');
export function applyEnchantGlow(group, enabled, time) {
  group?.traverse((object) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material?.emissive) continue;
      if (!material.userData.enchantBase) {
        material.userData.enchantBase = material.emissive.clone();
        material.userData.enchantIntensity = material.emissiveIntensity;
      }
      material.emissive.copy(material.userData.enchantBase);
      material.emissiveIntensity = material.userData.enchantIntensity;
      if (enabled) {
        material.emissive.lerp(enchantTint, 0.65);
        material.emissiveIntensity = 0.35 + Math.sin(time * 3) * 0.1;
      }
    }
  });
}

export class EnchantingModels {
  constructor(textures) {
    this.models = new Map();
    this.side = new THREE.MeshLambertMaterial({
      map: textures.single('enchantingTable:side'),
    });
    this.top = new THREE.MeshLambertMaterial({
      map: textures.single('enchantingTable:top'),
    });
    this.bottom = new THREE.MeshLambertMaterial({
      map: textures.single('obsidian:side'),
    });
    this.cover = new THREE.MeshLambertMaterial({ color: '#855039' });
    this.pages = new THREE.MeshLambertMaterial({
      color: '#eee3b8',
      emissive: '#321c4d',
      emissiveIntensity: 0.2,
    });
    this.rune = new THREE.MeshBasicMaterial({ color: '#9e7bff' });
  }
  create(q, y, r, origin) {
    const root = new THREE.Group(),
      p = axialToWorld(q, r),
      key = `${q},${y},${r}`;
    root.position.set(p.x - origin.x, y, p.z - origin.z);
    root.userData.enchantRoot = key;
    const add = (parent, geometry, material, x, cy, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, cy, z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.station = { q, y, r, type: 'enchantingTable' };
      parent.add(mesh);
      return mesh;
    };
    add(
      root,
      new THREE.CylinderGeometry(0.98, 0.98, 1, 6),
      [this.side, this.top, this.bottom],
      0,
      0.5,
      0,
    );
    const book = new THREE.Group();
    book.position.y = 1.35;
    for (const sign of [-1, 1]) {
      const half = new THREE.Group();
      half.rotation.z = sign * 0.2;
      add(
        half,
        new THREE.BoxGeometry(0.32, 0.025, 0.43),
        this.cover,
        sign * 0.16,
        -0.02,
        0,
      );
      add(
        half,
        new THREE.BoxGeometry(0.29, 0.045, 0.39),
        this.pages,
        sign * 0.16,
        0.015,
        0,
      );
      book.add(half);
    }
    root.add(book);
    root.userData.book = book;
    const glyphs = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      add(
        glyphs,
        new THREE.OctahedronGeometry(0.025),
        this.rune,
        Math.cos(angle) * 0.73,
        1.16 + i * 0.035,
        Math.sin(angle) * 0.73,
      );
    }
    root.add(glyphs);
    root.userData.glyphs = glyphs;
    this.models.set(key, root);
    return root;
  }
  release(chunk) {
    chunk.traverse((object) => {
      const key = object.userData.enchantRoot;
      if (key && this.models.get(key) === object) this.models.delete(key);
    });
  }
  frame(time) {
    for (const root of this.models.values()) {
      root.userData.book.position.y =
        1.35 + Math.sin(time * 1.2 + root.position.x) * 0.055;
      root.userData.book.rotation.y = time * 0.16;
      root.userData.glyphs.rotation.y = -time * 0.22;
    }
  }
}
