import * as THREE from 'three';
import { BLOCKS, axialToWorld, worldToAxial } from './core.js';
import { buildingMesh } from './building-graphics.js';
import { effectImage } from './texture-pack.js';
import { BlockParticles } from './block-particles.js';

export class MiningEffects {
  constructor(scene, textures, models) {
    this.textures = textures;
    this.models = models;
    this.particles = new BlockParticles(scene, textures);
    this.mask = { value: 0 };
    const image = effectImage('crack_anylength');
    this.materials = Array.from({ length: 10 }, (_, stage) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      if (image)
        canvas
          .getContext('2d')
          .drawImage(image, 0, stage * 16, 16, 16, 0, 0, 16, 16);
      const map = new THREE.CanvasTexture(canvas);
      map.magFilter = map.minFilter = THREE.NearestFilter;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.generateMipmaps = false;
      const material = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0.95,
        alphaTest: 0.015,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.sourceAtlas = { value: textures.atlas };
        shader.uniforms.useSourceMask = this.mask;
        shader.vertexShader =
          'attribute vec2 sourceUv; varying vec2 vSourceUv;\n' +
          shader.vertexShader.replace(
            '#include <uv_vertex>',
            '#include <uv_vertex>\nvSourceUv = sourceUv;',
          );
        shader.fragmentShader =
          'uniform sampler2D sourceAtlas; uniform float useSourceMask; varying vec2 vSourceUv;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            '#include <map_fragment>\nif (useSourceMask > 0.5) diffuseColor.a *= texture2D(sourceAtlas, vSourceUv).a;',
          );
      };
      material.customProgramCacheKey = () => 'hex-mining-cracks-v1';
      return material;
    });
    this.overlay = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.materials[0],
    );
    this.overlay.visible = false;
    this.overlay.renderOrder = 0;
    this.overlay.raycast = () => {};
    scene.add(this.overlay);
    this.hitTimer = 0;
    this.key = '';
  }
  geometry(world, target) {
    const { q, y, r, type } = target,
      p = axialToWorld(q, r),
      cell = `${q},${y},${r}`;
    const root = this.models.map((m) => m.models.get(cell)).find(Boolean);
    const state = world.state(q, y, r);
    const identity = `${cell}/${type}/${target.renderObject?.geometry.uuid || root?.uuid || ''}/${JSON.stringify(state)}`;
    if (identity === this.key) return this.overlay.geometry;
    this.key = identity;
    if (this.cell !== `${cell}/${type}`) {
      this.hitTimer = 0;
      this.cell = `${cell}/${type}`;
    }
    const positions = [],
      sourceUV = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      normal = new THREE.Vector3();
    const center = new THREE.Vector3(p.x, y, p.z);
    const append = (object, filter) => {
      const geo = object.geometry,
        pos = geo?.attributes.position;
      if (!pos) return;
      object.updateWorldMatrix(true, false);
      const index = geo.index,
        count = index?.count || pos.count,
        uv = geo.attributes.uv;
      for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map((n) => (index ? index.getX(i + n) : i + n));
        a.fromBufferAttribute(pos, ids[0]).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(pos, ids[1]).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(pos, ids[2]).applyMatrix4(object.matrixWorld);
        if (filter) {
          const cx = (a.x + b.x + c.x) / 3,
            cy = (a.y + b.y + c.y) / 3,
            cz = (a.z + b.z + c.z) / 3;
          if (
            Math.abs(cx - p.x) > 1.01 ||
            Math.abs(cz - p.z) > 1.01 ||
            cy < y - 0.01 ||
            cy > y + 1.01
          )
            continue;
          normal.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
          const hex = worldToAxial(
            cx - normal.x * 0.005,
            cz - normal.z * 0.005,
          );
          if (
            hex.q !== q ||
            hex.r !== r ||
            Math.floor(cy - normal.y * 0.005) !== y
          )
            continue;
        }
        for (const [n, v] of [a, b, c].entries()) {
          positions.push(v.x - center.x, v.y - center.y, v.z - center.z);
          sourceUV.push(uv?.getX(ids[n]) || 0, uv?.getY(ids[n]) || 0);
        }
      }
    };
    let atlas = false;
    if (BLOCKS[type]?.shape) {
      const sample = buildingMesh(
        world,
        q,
        y,
        r,
        { x: 0, z: 0 },
        this.textures,
        this.materials[0],
      );
      append(sample, false);
      sample.geometry.dispose();
      atlas = true;
    } else if (root) {
      const excluded = new Set([
        root.userData.book,
        root.userData.glyphs,
        root.userData.fire,
        ...(root.userData.bottles || []),
        ...(root.userData.bubbles || []),
      ]);
      const visit = (o) => {
        if (!o.visible || excluded.has(o)) return;
        if (
          o.isMesh &&
          !o.material?.transparent &&
          !o.material?.isMeshBasicMaterial
        )
          append(o, false);
        o.children.forEach(visit);
      };
      visit(root);
    } else if (target.renderObject) {
      append(target.renderObject, true);
      atlas = true;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'sourceUv',
      new THREE.Float32BufferAttribute(sourceUV, 2),
    );
    geometry.computeVertexNormals();
    const pos = geometry.attributes.position,
      normals = geometry.attributes.normal,
      uv = [];
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(normals.getY(i)) > 0.5)
        uv.push((pos.getX(i) + 1) / 2, (pos.getZ(i) + 1) / 2);
      else
        uv.push(
          -pos.getX(i) * normals.getZ(i) + pos.getZ(i) * normals.getX(i) + 0.5,
          pos.getY(i),
        );
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeBoundingSphere();
    this.overlay.geometry.dispose();
    this.overlay.geometry = geometry;
    this.overlay.position.copy(center);
    this.mask.value = atlas ? 1 : 0;
    return geometry;
  }
  update(world, target, progress, dt) {
    if (!target || progress <= 0 || target.crop || target.fluid) {
      this.hide();
      return false;
    }
    this.geometry(world, target);
    this.overlay.visible = true;
    this.overlay.material =
      this.materials[Math.min(9, Math.floor(progress * 10))];
    this.hitTimer -= dt;
    if (this.hitTimer > 0) return false;
    this.hitTimer += 0.25;
    this.particles.hit(target);
    return true;
  }
  shatter(world, target) {
    this.particles.burst(target, this.geometry(world, target));
    this.hide();
  }
  hide() {
    this.overlay.visible = false;
    this.hitTimer = 0;
  }
  clear() {
    this.hide();
    this.key = '';
    this.particles.clear();
  }
}
