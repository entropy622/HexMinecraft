import * as THREE from 'three';
import { BLOCKS, ITEMS } from './core.js';
import { itemImage } from './texture-pack.js';
import { portableBoxMesh } from './portable-box-graphics.js';
import { buildingItemMesh } from './building-graphics.js';

// Both hands share the same item geometry and source textures. Maps owned by a
// sprite are disposed with it; texture-pack maps remain shared by the world.
export function createHeldItem(id, textures) {
  const group = new THREE.Group();
  if (!id) return group;
  if (ITEMS[id]?.portable) {
    const mesh = portableBoxMesh();
    mesh.scale.setScalar(0.24);
    mesh.position.set(0, 0.05, -0.36);
    group.add(mesh);
    return group;
  }
  if (
    [
      'slab',
      'stairs',
      'egg',
      'rod',
      'chorus',
      'chorusFlower',
      'fence',
      'gate',
      'trapdoor',
      'campfire',
      'stonecutter',
      'lever',
      'button',
      'pressurePlate',
      'sporeBlossom',
      'pointedDripstone',
    ].includes(BLOCKS[id]?.shape)
  ) {
    const mesh = buildingItemMesh(id, textures);
    mesh.scale.setScalar(0.28);
    mesh.position.set(0, 0.17, -0.36);
    group.add(mesh);
    return group;
  }
  if (id === 'fishingRod') {
    const rod = new THREE.Group();
    rod.position.set(0, 0.15, -0.38);
    rod.rotation.set(-0.45, 0, -0.35);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.024, 0.9, 6),
      new THREE.MeshLambertMaterial({ color: '#bd9259' }),
    );
    shaft.position.y = 0.26;
    rod.add(shaft);
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.2, 6),
      new THREE.MeshLambertMaterial({ color: '#553b29' }),
    );
    handle.position.y = -0.1;
    rod.add(handle);
    group.fishingTip = new THREE.Object3D();
    group.fishingTip.position.y = 0.71;
    rod.add(group.fishingTip);
    group.add(rod);
    return group;
  }
  if ((!BLOCKS[id] || BLOCKS[id]?.shape) && !ITEMS[id]?.bucket) {
    const image = itemImage(id);
    if (image) {
      const map = new THREE.Texture(image);
      map.colorSpace = THREE.SRGBColorSpace;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.needsUpdate = true;
      const material = new THREE.MeshLambertMaterial({
        map,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      });
      for (const offset of [-0.008, 0, 0.008]) {
        const sprite = new THREE.Mesh(
          new THREE.PlaneGeometry(0.65, 0.65),
          material,
        );
        sprite.position.set(0, 0.24, -0.4 + offset);
        sprite.rotation.set(-0.1, -0.2, -0.25);
        if (offset === 0) sprite.userData.ownedMap = map;
        group.add(sprite);
      }
    }
    return group;
  }
  const material = ['side', 'top', 'top'].map(
    (face) =>
      new THREE.MeshLambertMaterial({
        map: textures.single((BLOCKS[id] ? id : 'dirt') + ':' + face),
        alphaTest: BLOCKS[id]?.foliage ? 0.5 : 0,
        side: BLOCKS[id]?.foliage ? THREE.DoubleSide : THREE.FrontSide,
      }),
  );
  const block = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.24, 6),
    material,
  );
  block.position.set(0, 0.17, -0.36);
  group.add(block);
  if (id === 'torch') {
    block.geometry.dispose();
    block.geometry = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6);
    const flame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.055, 0.11, 6),
      new THREE.MeshBasicMaterial({ color: '#ffcc72' }),
    );
    flame.position.y = 0.25;
    block.add(flame);
  }
  if (ITEMS[id]?.bucket) {
    block.geometry.dispose();
    for (const m of material) m.dispose();
    block.geometry = new THREE.CylinderGeometry(0.19, 0.14, 0.26, 6, 1, true);
    block.material = new THREE.MeshLambertMaterial({
      color: '#a8b5bd',
      side: THREE.DoubleSide,
    });
    const bottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.025, 6),
      new THREE.MeshLambertMaterial({ color: '#637781' }),
    );
    bottom.position.y = -0.12;
    block.add(bottom);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 4, 6, Math.PI),
      new THREE.MeshLambertMaterial({ color: '#d8e2e4' }),
    );
    handle.position.y = 0.13;
    block.add(handle);
    if (ITEMS[id].bucket !== 'empty') {
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(0.175, 6),
        new THREE.MeshBasicMaterial({
          color: ITEMS[id].color,
          side: THREE.DoubleSide,
        }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.09;
      block.add(fill);
    }
  }
  return group;
}
export function disposeHeldItem(group) {
  if (!group) return;
  const geometry = new Set(),
    materials = new Set(),
    maps = new Set();
  group.traverse((o) => {
    if (o.geometry) geometry.add(o.geometry);
    for (const material of Array.isArray(o.material)
      ? o.material
      : [o.material])
      if (material) materials.add(material);
    if (o.userData.ownedMap) maps.add(o.userData.ownedMap);
  });
  for (const resource of [...geometry, ...materials, ...maps])
    resource.dispose();
  group.removeFromParent();
}
