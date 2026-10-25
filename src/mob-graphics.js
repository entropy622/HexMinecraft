import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOBS } from './mob-data.js';
import { createNetherMob } from './nether-mob-graphics.js';

export function createMob(kind, textures) {
  if (MOBS[kind].flying) return createNetherMob(kind, textures);
  const def = MOBS[kind],
    group = new THREE.Group(),
    legs = [];
  const skin = new THREE.MeshLambertMaterial({
    color: def.color,
    map: textures.single(
      kind === 'sheep' || kind === 'chicken' ? 'snow:top' : 'stone:top',
    ),
  });
  const dark = new THREE.MeshLambertMaterial({ color: '#343a32' });
  const light = new THREE.MeshLambertMaterial({ color: '#e8ddba' });
  const cloth = new THREE.MeshLambertMaterial({
    color: kind === 'zombie' ? '#4e9392' : '#576e69',
  });
  const hex = (radius, height, material, x, y, z, bottom = radius) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, bottom, height, 6),
      material,
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const cube = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const eyes = (y, z, space = 0.12) => {
    for (const x of [-space, space]) cube(0.08, 0.09, 0.025, dark, x, y, z);
  };
  if (['zombie', 'skeleton', 'crawler'].includes(kind)) {
    hex(
      kind === 'skeleton' ? 0.17 : 0.29,
      0.7,
      kind === 'zombie' ? cloth : skin,
      0,
      1.05,
      0,
    );
    hex(0.28, 0.43, skin, 0, 1.65, 0);
    eyes(1.7, -0.245);
    cube(0.17, 0.06, 0.025, dark, 0, 1.52, -0.245);
    for (const x of [-0.14, 0.14])
      legs.push(hex(0.095, 0.65, kind === 'zombie' ? cloth : skin, x, 0.35, 0));
    for (const x of [-0.36, 0.36]) {
      const arm = hex(0.075, 0.65, skin, x, 1.12, -0.18);
      arm.rotation.x = -1.1;
    }
    if (kind === 'skeleton') {
      for (let i = 0; i < 4; i++)
        cube(0.39, 0.045, 0.18, light, 0, 0.85 + i * 0.14, -0.05);
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.025, 4, 8, Math.PI),
        new THREE.MeshLambertMaterial({ color: '#92704b' }),
      );
      bow.position.set(-0.38, 1.05, -0.5);
      bow.rotation.z = -Math.PI / 2;
      group.add(bow);
    }
  } else if (kind === 'spider') {
    hex(0.45, 0.35, skin, 0, 0.42, 0.18);
    hex(0.28, 0.32, skin, 0, 0.42, -0.35);
    const red = new THREE.MeshBasicMaterial({ color: '#f15343' });
    for (const x of [-0.12, 0.12]) cube(0.08, 0.06, 0.03, red, x, 0.46, -0.6);
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const leg = hex(0.035, 0.8, dark, side * 0.45, 0.24, (i - 1.5) * 0.22);
        leg.rotation.z = side * 0.9;
        legs.push(leg);
      }
  } else if (kind === 'creeper') {
    hex(0.25, 0.8, skin, 0, 0.82, 0);
    hex(0.32, 0.48, skin, 0, 1.45, 0);
    eyes(1.52, -0.29);
    cube(0.12, 0.2, 0.03, dark, 0, 1.33, -0.29);
    for (const x of [-0.18, 0.18])
      for (const z of [-0.18, 0.18])
        legs.push(hex(0.12, 0.33, skin, x, 0.17, z));
  } else if (kind === 'chicken') {
    hex(0.27, 0.35, skin, 0, 0.43, 0);
    hex(0.17, 0.3, skin, 0, 0.72, -0.18);
    const beak = new THREE.MeshLambertMaterial({ color: '#e8af3c' });
    cube(0.15, 0.09, 0.16, beak, 0, 0.69, -0.37);
    cube(
      0.07,
      0.12,
      0.06,
      new THREE.MeshLambertMaterial({ color: '#b94338' }),
      0,
      0.57,
      -0.33,
    );
    eyes(0.77, -0.33, 0.09);
    for (const x of [-0.12, 0.12])
      legs.push(hex(0.035, 0.27, beak, x, 0.14, 0));
    for (const x of [-0.27, 0.27]) cube(0.06, 0.25, 0.35, light, x, 0.43, 0);
  } else {
    const body = hex(
      kind === 'cow' ? 0.42 : 0.37,
      0.85,
      skin,
      0,
      kind === 'cow' ? 0.85 : 0.65,
      0.05,
    );
    body.rotation.x = Math.PI / 2;
    const headY = kind === 'cow' ? 1.15 : kind === 'pig' ? 0.7 : 0.95;
    hex(0.24, 0.4, skin, 0, headY, -0.5);
    eyes(headY + 0.07, -0.72);
    hex(0.15, 0.15, kind === 'pig' ? skin : light, 0, headY - 0.1, -0.68);
    for (const x of [-0.25, 0.25])
      for (const z of [-0.26, 0.32])
        legs.push(
          hex(
            0.07,
            kind === 'cow' ? 0.52 : 0.35,
            dark,
            x,
            kind === 'cow' ? 0.26 : 0.18,
            z,
          ),
        );
    if (kind === 'cow') {
      for (const x of [-0.2, 0.2]) hex(0.045, 0.2, light, x, 1.43, -0.5);
      cube(0.13, 0.18, 0.42, light, 0.34, 0.9, 0.1);
      cube(0.13, 0.2, 0.28, light, -0.34, 0.8, -0.12);
    }
    if (kind === 'sheep') {
      const wool = hex(0.44, 0.9, light, 0, 0.7, 0.05);
      wool.rotation.x = Math.PI / 2;
      group.userData.wool = wool;
    }
  }
  // Batch rigid pieces by material, retaining separate limbs and the removable wool coat.
  const animated = new Set([...legs, group.userData.wool]);
  const batches = new Map();
  for (const child of [...group.children]) {
    if (animated.has(child)) continue;
    child.updateMatrix();
    const parts = batches.get(child.material) || [];
    parts.push(child.geometry.clone().applyMatrix4(child.matrix));
    batches.set(child.material, parts);
    child.geometry.dispose();
    group.remove(child);
  }
  for (const [material, parts] of batches) {
    group.add(new THREE.Mesh(mergeGeometries(parts), material));
    for (const geometry of parts) geometry.dispose();
  }
  group.userData.legs = legs;
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}
export function disposeMob(mesh) {
  const materials = new Set();
  mesh.traverse((o) => {
    o.geometry?.dispose();
    if (o.material)
      for (const material of Array.isArray(o.material)
        ? o.material
        : [o.material])
        materials.add(material);
  });
  for (const material of materials) material.dispose();
  mesh.removeFromParent();
}
