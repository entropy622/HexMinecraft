import * as THREE from 'three';
import {
  BLOCKS,
  DIRECTIONS,
  axialToWorld,
  hash,
  worldToAxial,
} from './core.js';
const corners = Array.from({ length: 6 }, (_, i) => [
  Math.cos(((i * 60 - 30) * Math.PI) / 180),
  Math.sin(((i * 60 - 30) * Math.PI) / 180),
]);
// Counter-clockwise axial neighbors correspond to the outward side normals.
export class Graphics {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b5d9cf');
    this.scene.fog = new THREE.FogExp2('#b5d9cf', 0.012);
    this.camera = new THREE.PerspectiveCamera(
      72,
      innerWidth / innerHeight,
      0.08,
      220,
    );
    this.camera.rotation.order = 'YXZ';
    this.hemi = new THREE.HemisphereLight('#d7f2ea', '#6b7650', 2.3);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe3ad', 2.7);
    this.sun.position.set(30, 55, 20);
    this.scene.add(this.sun);
    this.terrain = new THREE.Group();
    this.scene.add(this.terrain);
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glassMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.38,
      shininess: 95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ray = new THREE.Raycaster();
    this.ray.far = 7;
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.CylinderGeometry(1.009, 1.009, 1.009, 6),
      ),
      new THREE.LineBasicMaterial({
        color: '#fff1b4',
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    const waterMat = new THREE.MeshPhongMaterial({
      color: '#59a9ae',
      transparent: true,
      opacity: 0.68,
      shininess: 85,
      depthWrite: false,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 3.15;
    this.scene.add(this.water);
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({
      color: '#fff5d9',
      transparent: true,
      opacity: 0.83,
    });
    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(3 + (j % 2), 3 + (j % 2), 0.7, 6),
          cloudMat,
        );
        m.position.set(j * 3, Math.sin(j) * 0.4, (j % 2) * 2);
        cloud.add(m);
      }
      cloud.position.set(
        hash(i, 1) * 170 - 85,
        29 + hash(i, 2) * 8,
        hash(i, 3) * 150 - 75,
      );
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    this.skyObjects = new THREE.Group();
    this.sunDisk = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 6),
      new THREE.MeshBasicMaterial({ color: '#fff0bd', fog: false }),
    );
    this.moonDisk = new THREE.Mesh(
      new THREE.CircleGeometry(3, 6),
      new THREE.MeshBasicMaterial({ color: '#d0e5dd', fog: false }),
    );
    this.skyObjects.add(this.sunDisk, this.moonDisk);
    const starPositions = [];
    for (let i = 0; i < 350; i++) {
      const angle = hash(i, 712) * Math.PI * 2;
      const height = hash(i, 914) * 0.95 + 0.04;
      const radius = Math.sqrt(1 - height * height) * 110;
      starPositions.push(
        Math.cos(angle) * radius,
        height * 110,
        Math.sin(angle) * radius,
      );
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: '#e9eed8',
        size: 0.25,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
      }),
    );
    this.skyObjects.add(this.stars);
    this.scene.add(this.skyObjects);
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.beaconMeshes = [];
    this.particles = [];
    this.cropMeshes = new Map();
    this.lights = new Map();
    this.hand = new THREE.Group();
    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.22, 0.48),
      new THREE.MeshLambertMaterial({ color: '#436e65' }),
    );
    sleeve.rotation.x = -0.25;
    this.hand.add(sleeve);
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.18, 0.18),
      new THREE.MeshLambertMaterial({ color: '#d7b68d' }),
    );
    palm.position.set(0, 0.03, -0.3);
    this.hand.add(palm);
    this.hand.scale.setScalar(0.64);
    this.hand.position.set(0.38, -0.32, -0.65);
    this.camera.add(this.hand);
    this.scene.add(this.camera);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }
  chunkKey(q, r) {
    return `${Math.floor(q / 8)},${Math.floor(r / 8)}`;
  }
  build(world) {
    this.world = world;
    for (const m of this.chunks.values()) {
      m.traverse((o) => o.geometry?.dispose());
      this.terrain.remove(m);
    }
    this.chunks.clear();
    const keys = new Set();
    for (const k of world.blocks.keys()) {
      const [q, , r] = k.split(',').map(Number);
      keys.add(this.chunkKey(q, r));
    }
    for (const k of keys) this.buildChunk(k);
    for (const child of [...this.decor.children]) {
      child.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
      this.decor.remove(child);
    }
    this.beaconMeshes = [];
    this.cropMeshes.clear();
    this.lights.clear();
    for (const b of world.beacons) {
      const p = axialToWorld(b.q, b.r),
        g = new THREE.Group();
      g.position.set(p.x, b.y, p.z);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.86, 0.35, 6),
        new THREE.MeshLambertMaterial({ color: '#c5b79a' }),
      );
      base.position.y = 0.175;
      g.add(base);
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.58),
        new THREE.MeshStandardMaterial({
          color: '#88c4bb',
          emissive: '#28534e',
          emissiveIntensity: 0.25,
          roughness: 0.3,
        }),
      );
      gem.position.y = 1.45;
      g.add(gem);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.035, 4, 6),
        new THREE.MeshBasicMaterial({ color: '#e0bf7c' }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.7;
      g.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.6, 55, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: '#a2f9d8',
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
        }),
      );
      beam.position.y = 28;
      beam.visible = false;
      g.add(beam);
      this.decor.add(g);
      this.beaconMeshes.push({ g, gem, ring, beam });
    }
  }
  buildChunk(k) {
    const [cq, cr] = k.split(',').map(Number),
      positions = [],
      colors = [],
      glassPositions = [],
      glassColors = [];
    const world = this.world;
    let transparent = false;
    const tri = (a, b, c, color) => {
      const pp = transparent ? glassPositions : positions,
        cc = transparent ? glassColors : colors;
      pp.push(...a, ...b, ...c);
      for (let i = 0; i < 3; i++) cc.push(color.r, color.g, color.b);
    };
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++)
        for (let y = 0; y <= 32; y++) {
          const type = world.get(q, y, r);
          if (!type) continue;
          transparent = type === 'glass';
          const data = BLOCKS[type],
            p = axialToWorld(q, r),
            varn = 0.92 + hash(q, y, r) * 0.15,
            top = new THREE.Color(data.color).multiplyScalar(varn),
            side = new THREE.Color(data.side).multiplyScalar(varn);
          if (
            !world.get(q, y + 1, r) ||
            (type !== 'glass' && world.get(q, y + 1, r) === 'glass')
          ) {
            for (let i = 0; i < 6; i++) {
              const a = corners[i],
                b = corners[(i + 1) % 6],
                a3 = [p.x + a[0], y + 1, p.z + a[1]],
                b3 = [p.x + b[0], y + 1, p.z + b[1]],
                ai = [p.x + a[0] * 0.94, y + 1.006, p.z + a[1] * 0.94],
                bi = [p.x + b[0] * 0.94, y + 1.006, p.z + b[1] * 0.94];
              tri(
                [p.x, y + 1.006, p.z],
                bi,
                ai,
                top.clone().multiplyScalar(1 + (i % 2) * 0.018),
              );
              tri(ai, bi, b3, top.clone().multiplyScalar(0.86));
              tri(ai, b3, a3, top.clone().multiplyScalar(0.86));
            }
          }
          if (
            y > 0 &&
            (!world.get(q, y - 1, r) ||
              (type !== 'glass' && world.get(q, y - 1, r) === 'glass'))
          )
            for (let i = 0; i < 6; i++)
              tri(
                [p.x, y, p.z],
                [p.x + corners[i][0], y, p.z + corners[i][1]],
                [
                  p.x + corners[(i + 1) % 6][0],
                  y,
                  p.z + corners[(i + 1) % 6][1],
                ],
                side,
              );
          for (let i = 0; i < 6; i++) {
            const [dq, dr] = DIRECTIONS[i];
            const neighbor = world.get(q + dq, y, r + dr);
            if (neighbor && (neighbor !== 'glass' || type === 'glass'))
              continue;
            const a = corners[i],
              b = corners[(i + 1) % 6],
              v0 = [p.x + a[0], y, p.z + a[1]],
              v1 = [p.x + b[0], y, p.z + b[1]],
              v2 = [p.x + b[0], y + 1, p.z + b[1]],
              v3 = [p.x + a[0], y + 1, p.z + a[1]];
            const c = side.clone().multiplyScalar(0.87 + i * 0.035);
            tri(v0, v2, v1, c);
            tri(v0, v3, v2, c);
            if (type === 'grass') {
              const ox = (dq + dr * 0.5) * 0.002,
                oz = dr * 0.866 * 0.002,
                l0 = [v0[0] + ox, y + 0.82, v0[2] + oz],
                l1 = [v1[0] + ox, y + 0.82, v1[2] + oz],
                t0 = [v3[0] + ox, y + 1, v3[2] + oz],
                t1 = [v2[0] + ox, y + 1, v2[2] + oz];
              tri(l0, t0, t1, top);
              tri(l0, t1, l1, top);
            }
            if (
              [
                'wood',
                'planks',
                'brick',
                'workbench',
                'chest',
                'furnace',
              ].includes(type)
            ) {
              const at = y + (type === 'wood' ? 0.22 : 0.48),
                t = 0.035,
                aa = [
                  v0[0] * 0.999 + p.x * 0.001,
                  at,
                  v0[2] * 0.999 + p.z * 0.001,
                ],
                bb = [
                  v1[0] * 0.999 + p.x * 0.001,
                  at,
                  v1[2] * 0.999 + p.z * 0.001,
                ];
              const offset = new THREE.Vector3(
                dq + dr * 0.5,
                0,
                dr * 0.866,
              ).multiplyScalar(0.005);
              aa[0] += offset.x;
              aa[2] += offset.z;
              bb[0] += offset.x;
              bb[2] += offset.z;
              tri(
                aa,
                [bb[0], at + t, bb[2]],
                bb,
                c.clone().multiplyScalar(0.6),
              );
              tri(
                aa,
                [aa[0], at + t, aa[2]],
                [bb[0], at + t, bb[2]],
                c.clone().multiplyScalar(0.6),
              );
            }
          }
        }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    let mesh = this.chunks.get(k);
    if (mesh) {
      mesh.geometry.dispose();
      for (const child of [...mesh.children]) {
        child.geometry.dispose();
        mesh.remove(child);
      }
    } else {
      mesh = new THREE.Mesh(geo, this.material);
      this.terrain.add(mesh);
      this.chunks.set(k, mesh);
    }
    mesh.geometry = geo;
    if (glassPositions.length) {
      const glassGeo = new THREE.BufferGeometry();
      glassGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(glassPositions, 3),
      );
      glassGeo.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(glassColors, 3),
      );
      glassGeo.computeVertexNormals();
      glassGeo.computeBoundingSphere();
      mesh.add(new THREE.Mesh(glassGeo, this.glassMaterial));
    }
  }
  updateBlock(q, y, r) {
    const keys = new Set([
      this.chunkKey(q, r),
      ...DIRECTIONS.map(([a, b]) => this.chunkKey(q + a, r + b)),
    ]);
    for (const k of keys) this.buildChunk(k);
    this.updateLight(q, y, r);
  }
  updateLight(q, y, r) {
    const k = `${q},${y},${r}`;
    if (this.lights.has(k)) {
      this.decor.remove(this.lights.get(k));
      this.lights.delete(k);
    }
    if (this.world.get(q, y, r) === 'lantern' && this.lights.size < 24) {
      const p = axialToWorld(q, r),
        light = new THREE.PointLight('#ffd58a', 5, 9, 2);
      light.position.set(p.x, y + 1.3, p.z);
      this.lights.set(k, light);
      this.decor.add(light);
    }
  }
  target() {
    this.ray.setFromCamera(new THREE.Vector2(), this.camera);
    const hit = this.ray.intersectObjects(this.terrain.children, true)[0];
    if (!hit) {
      this.outline.visible = false;
      return null;
    }
    const pt = hit.point.clone().addScaledVector(hit.face.normal, -0.035),
      a = worldToAxial(pt.x, pt.z),
      y = Math.floor(pt.y);
    const outside = hit.point.clone().addScaledVector(hit.face.normal, 0.045),
      b = worldToAxial(outside.x, outside.z);
    const p = axialToWorld(a.q, a.r);
    this.outline.position.set(p.x, y + 0.5, p.z);
    this.outline.visible = true;
    return {
      ...a,
      y,
      type: this.world.get(a.q, y, a.r),
      place: { ...b, y: Math.floor(outside.y) },
      distance: hit.distance,
    };
  }
  burst(q, y, r, color) {
    const p = axialToWorld(q, r);
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.065 + Math.random() * 0.065),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.set(p.x, y + 0.6, p.z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        v: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 4,
          (Math.random() - 0.5) * 3,
        ),
        life: 0.7,
      });
    }
  }
  crop(k, age) {
    let g = this.cropMeshes.get(k);
    if (!g) {
      const [q, y, r] = k.split(',').map(Number),
        p = axialToWorld(q, r);
      g = new THREE.Group();
      g.position.set(p.x, y + 1, p.z);
      for (let i = 0; i < 5; i++) {
        const stalk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.025, 0.65, 3),
          new THREE.MeshLambertMaterial({ color: '#d5bd66' }),
        );
        stalk.position.set(
          Math.sin(i * 2.4) * 0.38,
          0.33,
          Math.cos(i * 2.4) * 0.38,
        );
        g.add(stalk);
      }
      this.decor.add(g);
      this.cropMeshes.set(k, g);
    }
    g.scale.y = 0.15 + Math.min(age / 90, 1) * 0.85;
    g.children.forEach((s) =>
      s.material.color.set(age >= 90 ? '#e3bd62' : '#8daf65'),
    );
  }
  removeCrop(k) {
    const g = this.cropMeshes.get(k);
    if (g) {
      g.traverse((m) => {
        m.geometry?.dispose();
        m.material?.dispose();
      });
      this.decor.remove(g);
      this.cropMeshes.delete(k);
    }
  }
  frame(dt, time, activated, playing, moving, mining) {
    const phase = (time % 600) / 600,
      day = Math.max(0.08, Math.sin(phase * Math.PI * 2)),
      sky = new THREE.Color('#122c47').lerp(new THREE.Color('#bbdccc'), day);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.hemi.intensity = 0.45 + day * 1.7;
    this.sun.intensity = 0.2 + day * 2.4;
    this.sun.position.set(
      Math.cos(phase * Math.PI * 2) * 50,
      Math.sin(phase * Math.PI * 2) * 60,
      25,
    );
    this.clouds.position.x = Math.sin(time * 0.006) * 10;
    this.skyObjects.position.copy(this.camera.position);
    this.sunDisk.position.set(
      Math.cos(phase * Math.PI * 2) * 78,
      Math.sin(phase * Math.PI * 2) * 78,
      -45,
    );
    this.moonDisk.position.copy(this.sunDisk.position).multiplyScalar(-1);
    this.sunDisk.quaternion.copy(this.camera.quaternion);
    this.moonDisk.quaternion.copy(this.camera.quaternion);
    this.stars.material.opacity = Math.max(0, 1 - day * 2.5);
    this.water.position.y = 3.12 + Math.sin(time * 0.7) * 0.025;
    this.beaconMeshes.forEach((b, i) => {
      b.gem.rotation.y = time * 0.7;
      b.gem.position.y = 1.5 + Math.sin(time * 1.5 + i) * 0.15;
      b.ring.rotation.z = time * 0.25;
      b.beam.visible = activated.includes(i);
      b.gem.material.emissiveIntensity = activated.includes(i) ? 2 : 0.25;
    });
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.v.y -= dt * 8;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * 3;
      p.mesh.scale.setScalar(Math.max(0, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
    this.hand.visible = playing;
    this.hand.rotation.x = mining ? Math.sin(time * 25) * 0.5 : 0;
    this.hand.position.y = -0.32 + (moving ? Math.sin(time * 11) * 0.018 : 0);
    this.renderer.render(this.scene, this.camera);
  }
}
export function createCreature(kind) {
  const group = new THREE.Group();
  const hostile = kind === 'crawler';
  const mat = new THREE.MeshLambertMaterial({
      color: hostile ? '#719d96' : '#e7d8b7',
    }),
    dark = new THREE.MeshLambertMaterial({
      color: hostile ? '#354e59' : '#8e7962',
    });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(
      hostile ? 0.43 : 0.48,
      hostile ? 0.5 : 0.48,
      hostile ? 0.65 : 0.75,
      6,
    ),
    mat,
  );
  body.position.y = 0.7;
  body.rotation.z = hostile ? 0 : Math.PI / 2;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.24, 0.42, 6),
    mat,
  );
  head.position.set(0, 1, hostile ? -0.14 : -0.45);
  group.add(head);
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.08, 0.05),
      new THREE.MeshBasicMaterial({ color: hostile ? '#ffe29a' : '#263e3c' }),
    );
    eye.position.set(x, 1.05, -0.69 + (hostile ? 0.28 : 0));
    group.add(eye);
  }
  for (const x of [-0.28, 0.28])
    for (const z of [-0.27, 0.27]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.085, 0.4, 6),
        dark,
      );
      leg.position.set(x, 0.23, z);
      group.add(leg);
    }
  return group;
}
