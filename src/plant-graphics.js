import * as THREE from 'three';
import { plantImage } from './texture-pack.js';
import { PLANTS } from './farming-data.js';
import { axialToWorld } from './core.js';

const textures = new Map();
export function plantStage(plant) {
  return Math.min(3, Math.floor((plant.age / PLANTS[plant.kind].seconds) * 3));
}
export function createPlant(k, plant) {
  const stage = plantStage(plant),
    [q, y, r] = k.split(',').map(Number),
    p = axialToWorld(q, r);
  const cacheKey = plant.kind + ':' + stage;
  if (!textures.has(cacheKey)) {
    const image = plantImage(plant.kind, stage);
    if (image) {
      const texture = new THREE.Texture(image);
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      textures.set(cacheKey, texture);
    }
  }
  const map = textures.get(cacheKey);
  const group = new THREE.Group();
  group.position.set(p.x, y + 1.015, p.z);
  group.userData.stage = stage;
  group.userData.kind = plant.kind;
  const layers = plant.kind === 'sugarCane' ? 1 + Math.floor(stage / 1.5) : 1;
  const height =
    plant.kind === 'sugarCane' ? 0.8 : plant.kind === 'sapling' ? 0.85 : 0.9;
  const material = new THREE.MeshLambertMaterial({
    map,
    color: map ? '#ffffff' : '#83a54a',
    side: THREE.DoubleSide,
    alphaTest: 0.4,
  });
  if (plant.kind === 'melon' && stage === 3) {
    const image = plantImage('melonTop', 0);
    if (image && !textures.has('melon:top')) {
      const top = new THREE.Texture(image);
      top.colorSpace = THREE.SRGBColorSpace;
      top.magFilter = top.minFilter = THREE.NearestFilter;
      top.needsUpdate = true;
      textures.set('melon:top', top);
    }
    const topMaterial = new THREE.MeshLambertMaterial({
      map: textures.get('melon:top'),
      color: '#ffffff',
    });
    const fruit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.65, 6),
      [material, topMaterial, topMaterial],
    );
    fruit.position.y = 0.325;
    fruit.castShadow = fruit.receiveShadow = true;
    fruit.userData.plant = { q, y, r, k, height: 0.65 };
    group.add(fruit);
    return group;
  }
  for (let h = 0; h < layers; h++)
    for (let side = 0; side < 3; side++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, height),
        material,
      );
      mesh.position.y = height * (h + 0.5);
      mesh.rotation.y = (side * Math.PI) / 3;
      mesh.userData.plant = { q, y, r, k, height: layers * height };
      group.add(mesh);
    }
  return group;
}
