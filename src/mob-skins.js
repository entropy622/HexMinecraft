import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mobImage } from './texture-pack.js';

const textures = new Map();
const hitColor = new THREE.Color('#ff7373');
export function mobSkin(name) {
  if (textures.has(name)) return textures.get(name);
  const source = mobImage(name);
  if (!source) return null;
  const map = new THREE.Texture(source);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  textures.set(name, map);
  return map;
}
// Standard cuboid unwrap coordinates describe the artwork. The mesh itself
// has a broad front/back and four bevelled sides: a six-sided horizontal base.
export function skinBox(x, y, w, h, d) {
  return {
    front: [x + d, y + d, w, h],
    back: [x + d * 2 + w, y + d, w, h],
    right: [x, y + d, d, h],
    left: [x + d + w, y + d, d, h],
    top: [x + d, y, w, d],
    bottom: [x + d + w, y, w, d],
  };
}
export const skinTile = (rect = [0, 0, 16, 16]) =>
  Object.fromEntries(
    ['front', 'back', 'left', 'right', 'top', 'bottom'].map((face) => [
      face,
      rect,
    ]),
  );
function prism(w, h, d, regions, map, taper = 1) {
  const positions = [],
    uv = [],
    outline = [
      [-0.35, -0.5],
      [0.35, -0.5],
      [0.5, 0],
      [0.35, 0.5],
      [-0.35, 0.5],
      [-0.5, 0],
    ];
  const width = map?.image?.width || 16,
    height = map?.image?.height || 16;
  const vertex = (p, u, v) => {
    positions.push(...p);
    uv.push(u / width, 1 - v / height);
  };
  const triangle = (points, tex) => {
    for (let i = 0; i < 3; i++) vertex(points[i], ...tex[i]);
  };
  const sides = ['front', 'left', 'left', 'back', 'right', 'right'];
  for (let i = 0; i < 6; i++) {
    const a = outline[i],
      b = outline[(i + 1) % 6],
      [x, y, tw, th] = regions[sides[i]];
    const bottomA = [a[0] * w, -h / 2, a[1] * d],
      topA = [a[0] * w * taper, h / 2, a[1] * d * taper];
    const bottomB = [b[0] * w, -h / 2, b[1] * d],
      topB = [b[0] * w * taper, h / 2, b[1] * d * taper];
    triangle(
      [bottomA, topA, topB],
      [
        [x + tw, y + th],
        [x + tw, y],
        [x, y],
      ],
    );
    triangle(
      [bottomA, topB, bottomB],
      [
        [x + tw, y + th],
        [x, y],
        [x, y + th],
      ],
    );
  }
  for (const top of [true, false]) {
    const [x, y, tw, th] = regions[top ? 'top' : 'bottom'],
      scale = top ? taper : 1;
    const tex = (p) => [x + (p[0] + 0.5) * tw, y + (p[1] + 0.5) * th];
    for (let i = 0; i < 6; i++) {
      const a = outline[i],
        b = outline[(i + 1) % 6],
        center = [0, ((top ? 1 : -1) * h) / 2, 0];
      const va = [a[0] * w * scale, center[1], a[1] * d * scale],
        vb = [b[0] * w * scale, center[1], b[1] * d * scale];
      triangle(
        top ? [center, vb, va] : [center, va, vb],
        top
          ? [[x + tw / 2, y + th / 2], tex(b), tex(a)]
          : [[x + tw / 2, y + th / 2], tex(a), tex(b)],
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
function batch(parent) {
  for (const child of parent.children) if (child.isGroup) batch(child);
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const parts = batches.get(child.material) || [];
    const geometry = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    parts.push(geometry.applyMatrix4(child.matrix));
    batches.set(child.material, parts);
    child.geometry.dispose();
    parent.remove(child);
  }
  for (const [material, parts] of batches) {
    parent.add(new THREE.Mesh(mergeGeometries(parts), material));
    for (const part of parts) part.dispose();
  }
}
export class MobRig {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.materials = new Map();
  }
  material(name, color = '#ffffff', basic = false) {
    const key = name + ':' + color + ':' + basic;
    if (!this.materials.has(key)) {
      const Material = basic
        ? THREE.MeshBasicMaterial
        : THREE.MeshLambertMaterial;
      const material = new Material({
        map: name ? mobSkin(name) : null,
        color,
        alphaTest: name ? 0.1 : 0,
        ...(basic
          ? { transparent: true, alphaTest: 0.1, depthWrite: false }
          : {}),
      });
      material.userData.baseColor = material.color.clone();
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }
  pivot(x, y, z, parent = this.body) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    return pivot;
  }
  part(w, h, d, regions, material, x, y, z, parent = this.body, taper = 1) {
    const mesh = new THREE.Mesh(
      prism(w, h, d, regions, material.map, taper),
      material,
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  solid(w, h, d, material, x, y, z, parent = this.body) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  panel(w, h, rect, material, x, y, z, parent = this.body) {
    const geometry = new THREE.PlaneGeometry(w, h),
      uv = geometry.getAttribute('uv');
    const [sx, sy, sw, sh] = rect,
      width = material.map?.image.width || 16,
      height = material.map?.image.height || 16;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        (sx + uv.getX(i) * sw) / width,
        1 - (sy + (1 - uv.getY(i)) * sh) / height,
      );
    const panel = new THREE.Mesh(geometry, material);
    panel.rotation.y = Math.PI;
    panel.position.set(x, y, z);
    parent.add(panel);
    return panel;
  }
  finish(data) {
    batch(this.body);
    this.root.userData = {
      body: this.body,
      materials: [...this.materials.values()],
      legs: [],
      ...data,
    };
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return this.root;
  }
}
export function animateRig(rig, dt, time, moving, look, hit = 0, baby = false) {
  const data = rig.userData;
  data.walkWeight = THREE.MathUtils.damp(
    data.walkWeight || 0,
    moving > 0.001 ? 1 : 0,
    9,
    dt,
  );
  data.walkPhase = (data.walkPhase || 0) + moving * 8;
  const phase = data.walkPhase,
    weight = data.walkWeight;
  data.body.position.y = Math.sin(phase * 2) * 0.022 * weight;
  data.legs.forEach((leg, i) => {
    leg.rotation.x =
      Math.sin(phase + (leg.userData.phase ?? (i % 2 ? Math.PI : 0))) *
      0.48 *
      weight;
  });
  if (data.head) {
    data.head.rotation.y = THREE.MathUtils.damp(
      data.head.rotation.y,
      look?.yaw || 0,
      7,
      dt,
    );
    data.head.rotation.x = THREE.MathUtils.damp(
      data.head.rotation.x,
      look?.pitch || 0,
      7,
      dt,
    );
    data.head.scale.setScalar(baby ? 1.3 : 1);
  }
  const flash = Math.min(1, hit / 0.15);
  for (const mat of data.materials)
    if (mat.isMeshLambertMaterial)
      mat.color.copy(mat.userData.baseColor).lerp(hitColor, flash * 0.65);
  return { phase, weight };
}
