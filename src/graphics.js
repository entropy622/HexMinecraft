import { FluidRenderer } from './fluid-graphics.js';
import * as THREE from 'three';
import { createTextures } from './textures.js';
import {
  BLOCKS,
  ITEMS,
  DIRECTIONS,
  axialToWorld,
  hash,
  worldToAxial,
} from './core.js';
import { DIMENSIONS, VIEW_RADIUS, WORLD_HEIGHT } from './world.js';
const corners = Array.from({ length: 6 }, (_, i) => [
  Math.cos(((i * 60 - 30) * Math.PI) / 180),
  Math.sin(((i * 60 - 30) * Math.PI) / 180),
]);
let sharedTextures;
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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b5d9cf');
    this.scene.fog = new THREE.Fog('#b5d9cf', 22, 44);
    this.camera = new THREE.PerspectiveCamera(
      72,
      innerWidth / innerHeight,
      0.08,
      220,
    );
    this.camera.rotation.order = 'YXZ';
    this.hemi = new THREE.HemisphereLight('#d7f2ea', '#a8b7c5', 2.3);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe3ad', 2.7);
    this.sun.position.set(30, 55, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -24,
      right: 24,
      top: 24,
      bottom: -24,
      near: 1,
      far: 150,
    });
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun, this.sun.target);
    this.textures = createTextures();
    sharedTextures = this.textures;
    this.fluidRenderer = new FluidRenderer(this.scene, this.textures);
    this.terrain = new THREE.Group();
    this.scene.add(this.terrain);
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: this.textures.atlas,
    });
    this.foliageMaterial = new THREE.MeshLambertMaterial({
      map: this.textures.atlas,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.glassMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      map: this.textures.atlas,
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
        color: '#172019',
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color('#4b91df') },
          horizon: { value: new THREE.Color('#c0d9ed') },
        },
        vertexShader:
          'varying vec3 skyDirection; void main(){skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `
          uniform vec3 zenith; uniform vec3 horizon;
          varying vec3 skyDirection;
          void main() {
            float h = pow(max(normalize(skyDirection).y, 0.0), 0.65);
            gl_FragColor = vec4(mix(horizon, zenith, h), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({
      color: '#ffffff',
      fog: false,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(7 + (j % 2) * 3, 1.2, 5 + (j % 2) * 3),
          cloudMat,
        );
        m.position.set(j * 3, Math.sin(j) * 0.4, (j % 2) * 2);
        cloud.add(m);
      }
      cloud.position.set(
        hash(i, 1) * 170 - 85,
        42 + hash(i, 2) * 8,
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
  setQuality(value) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, value));
    this.renderer.shadowMap.enabled = value >= 1;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.traverse((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials)
        if (material) material.needsUpdate = true;
    });
  }
  chunkKey(q, r) {
    return `${Math.floor(q / 8)},${Math.floor(r / 8)}`;
  }
  build(world, q = 0, r = 0) {
    this.world = world;
    this.fluidRenderer.clear();
    for (const mesh of this.chunks.values()) {
      mesh.traverse((o) => o.geometry?.dispose());
      this.terrain.remove(mesh);
    }
    this.chunks.clear();
    this.queue = [];
    this.streamCenter = null;
    for (const child of [...this.decor.children]) {
      child.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
      this.decor.remove(child);
    }
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.particles = [];
    this.cropMeshes.clear();
    this.lights.clear();
    this.portalMeshes = new Map();
    this.sync(q, r, true);
    this.clouds.visible = world.dimension === 'overworld';
    this.sky.visible = world.dimension === 'overworld';
    this.skyObjects.visible = world.dimension !== 'nether';
    this.sunDisk.visible = world.dimension === 'overworld';
    this.moonDisk.visible = world.dimension === 'overworld';
    this.scene.fog.near = world.dimension === 'nether' ? 15 : 22;
    this.scene.fog.far = world.dimension === 'nether' ? 39 : 44;
  }
  sync(q, r, immediate = false) {
    const cq = Math.floor(q / 8),
      cr = Math.floor(r / 8),
      center = cq + ',' + cr;
    if (center !== this.streamCenter) {
      this.streamCenter = center;
      const wanted = new Set();
      for (let dq = -VIEW_RADIUS; dq <= VIEW_RADIUS; dq++)
        for (let dr = -VIEW_RADIUS; dr <= VIEW_RADIUS; dr++)
          wanted.add(cq + dq + ',' + (cr + dr));
      for (const [k, mesh] of this.chunks)
        if (!wanted.has(k)) {
          mesh.traverse((o) => o.geometry?.dispose());
          this.terrain.remove(mesh);
          this.chunks.delete(k);
        }
      this.queue = [...wanted]
        .filter((k) => !this.chunks.has(k))
        .sort((a, b) => {
          const [x, z] = a.split(',').map(Number),
            [u, v] = b.split(',').map(Number);
          return Math.hypot(x - cq, z - cr) - Math.hypot(u - cq, v - cr);
        });
      for (const [k] of this.cropMeshes) {
        const [x, , z] = k.split(',').map(Number);
        if (!wanted.has(this.chunkKey(x, z))) this.removeCrop(k);
      }
      for (const [k, g] of this.lights) {
        const [x, , z] = k.split(',').map(Number);
        if (!wanted.has(this.chunkKey(x, z))) {
          this.decor.remove(g);
          this.lights.delete(k);
        }
      }
      for (const [k, g] of this.portalMeshes) {
        const [x, , z] = k.split(',').map(Number);
        if (!wanted.has(this.chunkKey(x, z))) {
          g.traverse((o) => {
            o.geometry?.dispose();
            if (Array.isArray(o.material))
              o.material.forEach((m) => m.dispose());
            else o.material?.dispose();
          });
          this.decor.remove(g);
          this.portalMeshes.delete(k);
        }
      }
      for (const ck of wanted)
        for (const [k, t] of this.world.editChunks.get(ck) || []) {
          const [x, y, z] = k.split(',').map(Number);
          if (t === 'lantern') this.updateLight(x, y, z);
          if (t === 'portal' || t === 'endportal') this.portal(x, y, z, t);
        }
    }
    const count = immediate ? this.queue.length : 2;
    for (let n = 0; n < count && this.queue.length; n++)
      this.buildChunk(this.queue.shift());
  }
  portal(q, y, r, type) {
    const k = q + ',' + y + ',' + r;
    if (this.portalMeshes.has(k)) return;
    const p = axialToWorld(q, r),
      g = new THREE.Group(),
      color = type === 'portal' ? '#c48aff' : '#86f6dd';
    g.position.set(p.x, y, p.z);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.8, 0.18, 6),
      new THREE.MeshLambertMaterial({ color: '#494257' }),
    );
    base.position.y = 0.09;
    g.add(base);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.115, 4, 6),
      new THREE.MeshLambertMaterial({ color: '#534965' }),
    );
    rim.rotation.y = Math.PI / 2;
    rim.position.y = 1.15;
    g.add(rim);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.83 - i * 0.13, 0.025, 4, 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.85 - i * 0.2,
        }),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 1.15;
      ring.userData.spin = i ? -0.7 : 0.7;
      g.add(ring);
    }
    const surface = new THREE.Mesh(
      new THREE.CircleGeometry(0.83, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.33,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    surface.rotation.y = Math.PI / 2;
    surface.position.y = 1.15;
    surface.userData.shimmer = true;
    g.add(surface);
    g.traverse((o) => (o.userData.block = { q, y, r, type }));
    this.decor.add(g);
    this.portalMeshes.set(k, g);
  }
  swing() {
    this.swingTime = 0.28;
  }
  setHeld(id, tool) {
    const next = id + ':' + tool;
    if (this.heldKey === next) return;
    this.heldKey = next;
    if (this.held) {
      this.held.traverse((o) => {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      });
      this.hand.remove(this.held);
    }
    this.held = new THREE.Group();
    const material = ['side', 'top', 'top'].map(
      (face) =>
        new THREE.MeshLambertMaterial({
          map: this.textures.single((BLOCKS[id] ? id : 'dirt') + ':' + face),
        }),
    );
    const block = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.24, 6),
      material,
    );
    block.position.set(0, 0.17, -0.36);
    this.held.add(block);
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
    if (tool) {
      const pick = new THREE.Group(),
        handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.48, 0.055),
          new THREE.MeshLambertMaterial({ color: '#886344' }),
        ),
        head = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.08, 0.09),
          new THREE.MeshLambertMaterial({
            color: ['', '#bf9965', '#bac4bf', '#e2dccc', '#82deec'][tool],
          }),
        );
      head.position.y = 0.23;
      head.rotation.z = 0.13;
      pick.add(handle, head);
      pick.position.set(0, 0.22, -0.38);
      pick.rotation.z = -0.35;
      pick.visible = false;
      this.held.add(pick);
      this.heldPick = pick;
    } else this.heldPick = null;
    this.hand.add(this.held);
  }
  buildChunk(k) {
    const [cq, cr] = k.split(',').map(Number),
      world = this.world,
      origin = axialToWorld(cq * 8, cr * 8);
    const solid = { p: [], c: [], uv: [] },
      glass = { p: [], c: [], uv: [] },
      plants = { p: [], c: [], uv: [] };
    let out = solid;
    const tri = (verts, uvs, tile, shade = 1, ao = [1, 1, 1]) => {
      for (let i = 0; i < 3; i++) {
        out.p.push(...verts[i]);
        out.uv.push(...this.textures.uv(tile, ...uvs[i]));
        out.c.push(shade * ao[i], shade * ao[i], shade * ao[i]);
      }
    };
    const opaque = (q, y, r) => {
      const t = world.get(q, y, r);
      return t && t !== 'glass' && !BLOCKS[t]?.nonSolid;
    };
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++)
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const type = world.get(q, y, r);
          if (!type || BLOCKS[type].nonSolid) continue;
          out = type === 'glass' ? glass : solid;
          const abs = axialToWorld(q, r),
            x = abs.x - origin.x,
            z = abs.z - origin.z;
          const visible = (q, y, r) =>
            !opaque(q, y, r) &&
            (type !== 'glass' || world.get(q, y, r) !== 'glass');
          const tint = 0.94 + hash(q, y, r) * 0.06;
          const capUV = (i) => [
            (corners[i][0] + 1) / 2,
            (corners[i][1] + 1) / 2,
          ];
          const cornerAO = (i, level) => {
            const a = DIRECTIONS[i],
              b = DIRECTIONS[(i + 5) % 6];
            return (
              1 -
              0.18 *
                (Number(!!opaque(q + a[0], level, r + a[1])) +
                  Number(!!opaque(q + b[0], level, r + b[1])))
            );
          };
          if (visible(q, y + 1, r))
            for (let i = 0; i < 6; i++) {
              const j = (i + 1) % 6,
                a = corners[i],
                b = corners[j];
              tri(
                [
                  [x, y + 1, z],
                  [x + b[0], y + 1, z + b[1]],
                  [x + a[0], y + 1, z + a[1]],
                ],
                [[0.5, 0.5], capUV(j), capUV(i)],
                type + ':top',
                tint,
                [1, cornerAO(j, y + 1), cornerAO(i, y + 1)],
              );
            }
          if (y > 0 && visible(q, y - 1, r))
            for (let i = 0; i < 6; i++) {
              const j = (i + 1) % 6,
                a = corners[i],
                b = corners[j];
              tri(
                [
                  [x, y, z],
                  [x + a[0], y, z + a[1]],
                  [x + b[0], y, z + b[1]],
                ],
                [[0.5, 0.5], capUV(i), capUV(j)],
                type + ':top',
                tint * 0.65,
              );
            }
          for (let i = 0; i < 6; i++) {
            const [dq, dr] = DIRECTIONS[i];
            if (!visible(q + dq, y, r + dr)) continue;
            const j = (i + 1) % 6,
              a = corners[i],
              b = corners[j],
              v0 = [x + a[0], y, z + a[1]],
              v1 = [x + b[0], y, z + b[1]],
              v2 = [x + b[0], y + 1, z + b[1]],
              v3 = [x + a[0], y + 1, z + a[1]];
            const bottom = opaque(q + dq, y - 1, r + dr) ? 0.78 : 1;
            const shade = tint * (0.82 + Math.cos((i * Math.PI) / 3) * 0.07);
            tri(
              [v0, v2, v1],
              [
                [0, 0],
                [1, 1],
                [1, 0],
              ],
              type + ':side',
              shade,
              [bottom, cornerAO(j, y + 1), bottom],
            );
            tri(
              [v0, v3, v2],
              [
                [0, 0],
                [0, 1],
                [1, 1],
              ],
              type + ':side',
              shade,
              [bottom, cornerAO(i, y + 1), cornerAO(j, y + 1)],
            );
          }
          if (
            type === 'grass' &&
            !world.get(q, y + 1, r) &&
            hash(q, 71, r) > 0.65
          ) {
            out = plants;
            const tile = hash(q, 92, r) > 0.9 ? 'flower' : 'tuft';
            for (let i = 0; i < 3; i++) {
              const angle = (i * Math.PI) / 3,
                a = Math.cos(angle) * 0.5,
                b = Math.sin(angle) * 0.5,
                h = 0.45 + hash(q, 82, r) * 0.35;
              const v0 = [x - a, y + 1, z - b],
                v1 = [x + a, y + 1, z + b],
                v2 = [x + a, y + 1 + h, z + b],
                v3 = [x - a, y + 1 + h, z - b];
              tri(
                [v0, v1, v2],
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                ],
                tile,
              );
              tri(
                [v0, v2, v3],
                [
                  [0, 0],
                  [1, 1],
                  [0, 1],
                ],
                tile,
              );
            }
          }
        }
    const geometry = (data) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(data.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    };
    let mesh = this.chunks.get(k);
    if (mesh) {
      mesh.geometry.dispose();
      for (const child of [...mesh.children]) {
        child.geometry.dispose();
        mesh.remove(child);
      }
    } else {
      mesh = new THREE.Mesh();
      this.terrain.add(mesh);
      this.chunks.set(k, mesh);
    }
    mesh.geometry = geometry(solid);
    mesh.material = this.material;
    mesh.position.set(origin.x, 0, origin.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (glass.p.length)
      mesh.add(new THREE.Mesh(geometry(glass), this.glassMaterial));
    if (plants.p.length) {
      const foliage = new THREE.Mesh(geometry(plants), this.foliageMaterial);
      foliage.raycast = () => {};
      foliage.receiveShadow = true;
      mesh.add(foliage);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }
  updateBlock(q, y, r) {
    const keys = new Set([
      this.chunkKey(q, r),
      ...DIRECTIONS.map(([a, b]) => this.chunkKey(q + a, r + b)),
    ]);
    for (const k of keys) if (this.chunks.has(k)) this.buildChunk(k);
    const pk = q + ',' + y + ',' + r,
      t = this.world.get(q, y, r);
    if (this.portalMeshes.has(pk)) {
      const g = this.portalMeshes.get(pk);
      g.traverse((o) => {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      });
      this.decor.remove(g);
      this.portalMeshes.delete(pk);
    }
    if (t === 'portal' || t === 'endportal') this.portal(q, y, r, t);
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
  target(includeLiquids = false) {
    this.ray.setFromCamera(new THREE.Vector2(), this.camera);
    const hit = this.ray.intersectObjects(
      [
        ...this.terrain.children,
        ...this.portalMeshes.values(),
        ...(includeLiquids ? this.fluidRenderer.group.children : []),
      ],
      true,
    )[0];
    if (!hit) {
      this.outline.visible = false;
      return null;
    }
    if (hit.object.userData.liquid) {
      const pt = hit.point.clone().addScaledVector(hit.face.normal, -0.02),
        a = worldToAxial(pt.x, pt.z),
        y = Math.floor(pt.y),
        outside = hit.point.clone().addScaledVector(hit.face.normal, 0.05),
        b = worldToAxial(outside.x, outside.z);
      const f = this.world.fluids.get(a.q, y, a.r);
      if (!f) return null;
      const p = axialToWorld(a.q, a.r);
      this.outline.position.set(p.x, y + 0.5, p.z);
      this.outline.scale.set(1, 1, 1);
      this.outline.visible = true;
      return {
        ...a,
        y,
        type: f.type,
        fluid: true,
        source: f.source,
        place: { ...b, y: Math.floor(outside.y) },
        distance: hit.distance,
      };
    }
    const portal = hit.object.userData.block;
    if (portal) {
      const p = axialToWorld(portal.q, portal.r);
      this.outline.position.set(p.x, portal.y + 1, p.z);
      this.outline.scale.set(1, 2, 1);
      this.outline.visible = true;
      return {
        ...portal,
        place: { q: portal.q, y: portal.y + 2, r: portal.r },
        distance: hit.distance,
      };
    }
    this.outline.scale.set(1, 1, 1);
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
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
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
  frame(dt, time, playing, moving, mining) {
    this.fluidRenderer.sync(this.world, new Set(this.chunks.keys()));
    this.fluidRenderer.frame(time);
    const phase = (time % 600) / 600,
      day = Math.max(0.08, Math.sin(phase * Math.PI * 2)),
      sky =
        this.world?.dimension === 'overworld'
          ? new THREE.Color('#122c47').lerp(new THREE.Color('#79b6ee'), day)
          : new THREE.Color(
              DIMENSIONS[this.world?.dimension || 'overworld'].fog,
            );
    const horizon =
      this.world?.dimension === 'overworld'
        ? new THREE.Color('#132239').lerp(new THREE.Color('#c2dbee'), day)
        : sky;
    this.scene.background.copy(horizon);
    this.scene.fog.color.copy(horizon);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.zenith.value.copy(sky);
    this.sky.material.uniforms.horizon.value.copy(horizon);
    this.hemi.intensity =
      this.world?.dimension === 'overworld' ? 0.5 + day * 1.1 : 1.15;
    this.hemi.color.set(
      this.world?.dimension === 'nether'
        ? '#fbb099'
        : this.world?.dimension === 'end'
          ? '#c9b5ec'
          : '#daeaff',
    );
    this.sun.intensity =
      this.world?.dimension === 'overworld' ? 0.25 + day * 2.0 : 0.5;
    this.sun.position.set(
      this.camera.position.x + Math.cos(phase * Math.PI * 2) * 50,
      this.camera.position.y + Math.max(15, Math.sin(phase * Math.PI * 2) * 60),
      this.camera.position.z + 25,
    );
    this.sun.target.position.copy(this.camera.position);
    this.shadowTimer = (this.shadowTimer || 0) - dt;
    if (this.shadowTimer <= 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowTimer = 0.25;
    }
    this.clouds.position.x =
      this.camera.position.x + Math.sin(time * 0.006) * 10;
    this.clouds.position.z = this.camera.position.z;
    this.skyObjects.position.copy(this.camera.position);
    this.sunDisk.position.set(
      Math.cos(phase * Math.PI * 2) * 78,
      Math.sin(phase * Math.PI * 2) * 78,
      -45,
    );
    this.moonDisk.position.copy(this.sunDisk.position).multiplyScalar(-1);
    this.sunDisk.quaternion.copy(this.camera.quaternion);
    this.moonDisk.quaternion.copy(this.camera.quaternion);
    this.stars.material.opacity =
      this.world?.dimension === 'end' ? 0.9 : Math.max(0, 1 - day * 2.5);
    for (const g of this.portalMeshes?.values() || [])
      for (const child of g.children) {
        if (child.userData.spin) child.rotation.z = time * child.userData.spin;
        if (child.userData.shimmer)
          child.material.opacity = 0.28 + Math.sin(time * 2) * 0.1;
      }
    for (const g of this.cropMeshes.values())
      g.children.forEach(
        (blade, i) =>
          (blade.rotation.z = Math.sin(time * 1.4 + g.position.x + i) * 0.07),
      );
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
    this.swingTime = Math.max(0, (this.swingTime || 0) - dt);
    this.hand.rotation.x = mining
      ? Math.sin(time * 22) * 0.55
      : this.swingTime > 0
        ? Math.sin((this.swingTime / 0.28) * Math.PI) * 0.7
        : 0;
    this.hand.rotation.z = moving ? Math.sin(time * 5.5) * 0.035 : 0;
    if (this.held) {
      this.held.children[0].visible = !mining || !this.heldPick;
      if (this.heldPick) this.heldPick.visible = mining;
    }
    this.outline.material.opacity = mining
      ? 0.65 + Math.sin(time * 22) * 0.3
      : 0.8;
    this.hand.position.y = -0.32 + (moving ? Math.sin(time * 11) * 0.018 : 0);
    this.renderer.render(this.scene, this.camera);
  }
}
export function createCreature(kind, dimension = 'overworld') {
  const group = new THREE.Group();
  const hostile = kind === 'crawler';
  const mat = new THREE.MeshLambertMaterial({
      map: sharedTextures?.single(
        hostile
          ? dimension === 'nether'
            ? 'netherrack:side'
            : dimension === 'end'
              ? 'basalt:side'
              : 'leaves:side'
          : 'snow:top',
      ),
      color: hostile
        ? dimension === 'nether'
          ? '#ffe0bf'
          : dimension === 'end'
            ? '#ccb4ed'
            : '#c5dac1'
        : '#e7d8b7',
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
  const muzzle = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.15, 0.12),
    new THREE.MeshLambertMaterial({ color: hostile ? '#354038' : '#c4b4a0' }),
  );
  muzzle.position.set(0, 0.9, hostile ? -0.42 : -0.69);
  group.add(muzzle);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}
