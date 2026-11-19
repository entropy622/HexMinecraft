import * as THREE from 'three';
import { axialToWorld, key, DIRECTIONS } from './core.js';
import { newChest, validChest } from './chests.js';
import { isRail } from './rail-data.js';
import { railNeighbor, ports, railPoint } from './rail-track.js';
const opposite = (d) => (d + 3) % 6;
export const validCarts = (list, mounted = null) =>
  Array.isArray(list) &&
  list.length <= 10000 &&
  new Set(list.map((c) => c?.id)).size === list.length &&
  list.every(
    (c) =>
      c &&
      typeof c.id === 'string' &&
      c.id.length < 120 &&
      Array.isArray(c.p) &&
      c.p.length === 3 &&
      c.p.every(Number.isSafeInteger) &&
      c.p[1] >= 0 &&
      c.p[1] < 64 &&
      [0, 1].includes(c.exit) &&
      Number.isFinite(c.t) &&
      c.t >= 0 &&
      c.t <= 1 &&
      Number.isFinite(c.speed) &&
      c.speed >= 0 &&
      c.speed <= 10 &&
      (c.kind === 'minecart'
        ? c.cargo === null
        : c.kind === 'chestCart' && validChest(c.cargo)),
  ) &&
  (mounted === null ||
    list.some((c) => c.kind === 'minecart' && c.id === mounted));
export function cartPosition(w, c) {
  const pair = ports(w, c.p),
    v = railPoint(w, c.p, pair, c.t),
    center = axialToWorld(c.p[0], c.p[2]);
  return [center.x + v[0], c.p[1] + v[1], center.z + v[2]];
}
export function stepCart(w, c, dt, push = false) {
  if (!w.loaded(c.p[0], c.p[2])) return;
  const type = w.get(...c.p);
  if (!isRail(type)) {
    c.speed = 0;
    return;
  }
  const pair = ports(w, c.p),
    slope = railPoint(w, c.p, pair, 1)[1] - railPoint(w, c.p, pair, 0)[1];
  const a =
    type === 'poweredRail'
      ? w.state(...c.p).powered
        ? 6
        : -11
      : (push ? 3 : 0) - 0.16;
  c.speed = Math.max(
    0,
    Math.min(8, c.speed + (a - slope * (c.exit ? 1 : -1) * 2.2) * dt),
  );
  let remaining = (c.speed * dt) / Math.sqrt(3);
  while (remaining > 0) {
    const edge = c.exit ? 1 - c.t : c.t;
    if (remaining <= edge) {
      c.t += (c.exit ? 1 : -1) * remaining;
      break;
    }
    c.t = c.exit;
    const dir = ports(w, c.p)[c.exit],
      [dq, dr] = DIRECTIONS[dir];
    if (!w.loaded(c.p[0] + dq, c.p[2] + dr)) break;
    const n = railNeighbor(w, c.p, dir);
    if (!n || !w.loaded(n[0], n[2]) || !ports(w, n).includes(opposite(dir))) {
      if (!n || w.loaded(n[0], n[2])) c.speed = 0;
      break;
    }
    const entry = ports(w, n).indexOf(opposite(dir));
    c.p = n;
    c.t = entry;
    c.exit = 1 - entry;
    remaining -= edge;
  }
}
function cartSurface(index) {
  const base = [
      [118, 128, 130],
      [64, 70, 74],
      [172, 178, 178],
      [149, 101, 54],
      [57, 49, 43],
    ][index],
    rgb = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0,
        seam = y === 14 || (index === 3 && y % 5 === 0),
        rivet = index !== 3 && [2, 13].includes(x) && [2, 13].includes(y);
      const light =
        (edge ? 10 : seam ? -24 : rivet ? -34 : 0) +
        (((x * 7 + y * (index === 3 ? 17 : 5) + x * y) % 9) - 4);
      rgb.set([...base.map((n) => n + light), 255], (16 * y + x) * 4);
    }
  const tex = new THREE.DataTexture(rgb, 16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ map: tex });
}
export class Minecarts {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();
    this.records = [];
    this.riding = null;
    this.open = null;
    this.cube = new THREE.BoxGeometry(1, 1, 1);
    this.materials = Array.from({ length: 5 }, (_, i) => cartSurface(i));
  }
  load(saved = [], mounted = null) {
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    this.meshes.clear();
    this.records = structuredClone(saved);
    this.riding = this.records.find((c) => c.id === mounted) || null;
    this.open = null;
  }
  spawn(p, kind, facing, w, id = crypto.randomUUID(), cargo = null) {
    const pair = ports(w, p);
    const exit =
      Math.cos(((pair[0] - facing) * Math.PI) / 3) >
      Math.cos(((pair[1] - facing) * Math.PI) / 3)
        ? 0
        : 1;
    const c = {
      id,
      kind,
      p: [...p],
      t: 0.5,
      exit,
      speed: 0,
      cargo: kind === 'chestCart' ? cargo || newChest() : null,
    };
    this.records.push(c);
    return c;
  }
  update(dt, w, keys) {
    const occupied = new Set();
    for (const c of this.records) {
      const loaded = w.loaded(c.p[0], c.p[2]);
      let m = this.meshes.get(c.id);
      if (!loaded) {
        if (m) m.visible = false;
        continue;
      }
      stepCart(w, c, dt, c === this.riding && keys.has('KeyW'));
      if (w.get(...c.p) === 'detectorRail') occupied.add(key(...c.p));
      if (!m) {
        m = new THREE.Group();
        const box = (x, y, z, a, b, d, i) => {
          const obj = new THREE.Mesh(this.cube, this.materials[i]);
          obj.scale.set(a, b, d);
          obj.position.set(x, y, z);
          m.add(obj);
        };
        box(0, 0.23, 0, 0.96, 0.14, 1.24, 1);
        box(0, 0.32, 0, 0.82, 0.055, 1.09, 0);
        for (const side of [-1, 1]) {
          box(side * 0.46, 0.45, 0, 0.09, 0.43, 1.25, 0);
          box(0, 0.45, side * 0.58, 0.88, 0.43, 0.09, 0);
          box(side * 0.46, 0.67, 0, 0.12, 0.06, 1.29, 2);
          box(0, 0.67, side * 0.58, 0.86, 0.06, 0.12, 2);
          for (const end of [-1, 1])
            box(side * 0.34, 0.14, end * 0.39, 0.18, 0.26, 0.26, 1);
        }
        if (c.cargo) {
          box(0, 0.62, 0, 0.79, 0.62, 0.79, 3);
          box(0, 0.73, 0, 0.8, 0.05, 0.8, 4);
          for (const z of [-0.41, 0.41]) box(0, 0.68, z, 0.1, 0.15, 0.04, 2);
        }
        this.meshes.set(c.id, m);
        this.scene.add(m);
      }
      m.visible = true;
      m.position.fromArray(cartPosition(w, c));
      const pair = ports(w, c.p),
        a = railPoint(w, c.p, pair, c.t),
        b = railPoint(w, c.p, pair, c.t + 0.001);
      m.rotation.y =
        Math.atan2(b[0] - a[0], b[2] - a[2]) + (c.exit ? 0 : Math.PI);
    }
    const changed = [];
    for (const k of w.circuitCells) {
      const p = k.split(',').map(Number);
      if (
        w.get(...p) === 'detectorRail' &&
        !!w.state(...p).powered !== occupied.has(k)
      ) {
        w.setState(...p, { ...w.state(...p), powered: occupied.has(k) });
        changed.push(p);
      }
    }
    return changed;
  }
  target(camera, limit = 5) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    ray.far = Math.min(limit, 5);
    const meshes = [...this.meshes.values()].filter((m) => m.visible);
    const hit = ray.intersectObjects(meshes, true)[0];
    return hit
      ? this.records.find((c) => this.meshes.get(c.id) === hit.object.parent)
      : null;
  }
  storage(p) {
    const c = this.records.find(
      (c) => c.cargo && c.p.every((v, i) => v === p[i]),
    );
    return c ? this.slots(c) : null;
  }
  slots(c) {
    return Object.fromEntries(
      c.cargo.map((_, i) => [
        i,
        {
          get: () => c.cargo[i],
          set: (s) => {
            c.cargo[i] = s;
          },
          accepts: () => true,
        },
      ]),
    );
  }
  remove(c) {
    const m = this.meshes.get(c.id);
    if (m) this.scene.remove(m);
    this.meshes.delete(c.id);
    this.records = this.records.filter((v) => v !== c);
    if (this.riding === c) this.riding = null;
    if (this.open === c) this.open = null;
  }
}
