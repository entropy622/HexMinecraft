import * as THREE from 'three';
import { mobImage } from './texture-pack.js';

const skinCache = new Map();
// Runtime UV views retain the upstream image and license; source PNGs are
// supplied unmodified. Models and hexagonal body proportions are original.
function ghastTile(name, x, y, size = 20) {
  const key = name + ':' + x + ',' + y;
  if (skinCache.has(key)) return skinCache.get(key);
  const source = mobImage(name);
  if (!source) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(source, x, y, size, size, 0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  skinCache.set(key, texture);
  return texture;
}
export function createNetherMob(kind, textures) {
  const group = new THREE.Group();
  group.userData.legs = [];
  const piece = (geometry, material, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  if (kind === 'blaze') {
    const gold = new THREE.MeshLambertMaterial({
      map: textures.single('glowstone:top'),
      color: '#ffe4a1',
      emissive: '#e17b16',
      emissiveIntensity: 0.55,
    });
    const dark = new THREE.MeshLambertMaterial({ color: '#392c1b' });
    const head = piece(
      new THREE.CylinderGeometry(0.28, 0.28, 0.43, 6),
      gold,
      0,
      1.55,
      0,
    );
    head.rotation.y = Math.PI / 6;
    for (const x of [-0.11, 0.11])
      piece(new THREE.BoxGeometry(0.075, 0.075, 0.03), dark, x, 1.62, -0.245);
    piece(new THREE.BoxGeometry(0.14, 0.045, 0.03), dark, 0, 1.43, -0.245);
    piece(
      new THREE.CylinderGeometry(0.13, 0.2, 1.15, 6),
      new THREE.MeshBasicMaterial({ color: '#f88423' }),
      0,
      0.77,
      0,
    );
    const rings = [];
    for (let row = 0; row < 3; row++) {
      const ring = new THREE.Group(),
        matrix = new THREE.Object3D();
      const rods = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.42, 6),
        gold,
        6,
      );
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3,
          radius = [0.45, 0.58, 0.37][row];
        matrix.position.set(
          Math.sin(angle) * radius,
          0,
          Math.cos(angle) * radius,
        );
        matrix.rotation.set(0.12 * Math.sin(angle), 0, 0.12 * Math.cos(angle));
        matrix.updateMatrix();
        rods.setMatrixAt(i, matrix.matrix);
      }
      ring.position.y = 0.35 + row * 0.45;
      ring.add(rods);
      group.add(ring);
      rings.push(ring);
    }
    group.userData.rings = rings;
    group.userData.gold = gold;
  } else {
    const base = 'mobs_mc_ghast';
    const side = new THREE.MeshLambertMaterial({
      map: ghastTile(base, 0, 20),
      color: '#efeee6',
    });
    const top = new THREE.MeshLambertMaterial({
      map: ghastTile(base, 20, 0),
      color: '#efeee6',
    });
    const bottom = new THREE.MeshLambertMaterial({
      map: ghastTile(base, 40, 0),
      color: '#dedbd0',
    });
    const body = new THREE.CylinderGeometry(1.35, 1.35, 1.7, 6);
    const uv = body.getAttribute('uv'),
      index = body.getIndex();
    // Each of six side panels gets one skin tile rather than one stretched strip.
    // Cylinder vertices share columns, so duplicate triangles before remapping.
    const expanded = body.toNonIndexed(),
      euv = expanded.getAttribute('uv');
    for (let i = 0; i < expanded.groups[0].count; i++) {
      const original = uv.getX(index.getX(i));
      const triangle = Math.floor(i / 6),
        local = original * 6 - triangle;
      euv.setX(i, local);
    }
    body.dispose();
    expanded.rotateY(Math.PI / 6);
    piece(expanded, [side, top, bottom], 0, 2.45, 0);
    const face = new THREE.MeshLambertMaterial({
      map: ghastTile(base, 20, 20),
      color: '#fffdf4',
      transparent: true,
      alphaTest: 0.1,
    });
    const panel = piece(
      new THREE.PlaneGeometry(1.32, 1.55),
      face,
      0,
      2.45,
      -1.18,
    );
    panel.rotation.y = Math.PI;
    group.userData.face = face;
    group.userData.idleFace = face.map;
    group.userData.firingFace = ghastTile('mobs_mc_ghast_firing', 20, 20);
    const tentacles = [];
    for (let i = 0; i < 7; i++) {
      const angle = ((i - 1) * Math.PI) / 3,
        radius = i ? 0.82 : 0;
      const pivot = new THREE.Group(),
        length = 0.75 + (i % 3) * 0.22;
      pivot.position.set(
        Math.sin(angle) * radius,
        1.65,
        Math.cos(angle) * radius,
      );
      const leg = new THREE.CylinderGeometry(0.12, 0.08, length, 6);
      leg.translate(0, -length / 2, 0);
      piece(leg, side, 0, 0, 0, pivot);
      group.add(pivot);
      tentacles.push(pivot);
    }
    group.userData.tentacles = tentacles;
  }
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}
export function animateNetherMob(mob, time) {
  const data = mob.mesh.userData,
    charge = mob.charge || 0;
  data.rings?.forEach((ring, i) => {
    ring.rotation.y = time * (i === 1 ? -1 : 1) * (1.1 + charge * 1.7) + i;
    ring.position.y = 0.35 + i * 0.45 + Math.sin(time * 3 + i) * 0.055;
  });
  if (data.gold)
    data.gold.emissiveIntensity =
      0.55 + charge * 0.85 + Math.max(0, Math.sin(time * 9)) * 0.08;
  data.tentacles?.forEach((pivot, i) => {
    pivot.rotation.x = Math.sin(time * 2.4 + i * 0.9) * 0.23;
    pivot.rotation.z = Math.cos(time * 1.8 + i) * 0.16;
  });
  if (data.face) data.face.map = charge > 0.1 ? data.firingFace : data.idleFace;
}
