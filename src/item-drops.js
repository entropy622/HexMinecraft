import * as THREE from 'three';
import { ITEMS, BLOCKS, worldToAxial } from './core.js';
import { itemImage } from './texture-pack.js';
import { validWear } from './equipment.js';
import { fluidHeight } from './fluids.js';
import { enchantmentsOf } from './enchanting-data.js';
import { buildingItemMesh } from './building-graphics.js';
import { validStack } from './inventory.js';
import { portableBoxMesh } from './portable-box-graphics.js';
import { isDoor } from './building-data.js';

const vec = (p) =>
  Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
export function validDrops(state) {
  return (
    Array.isArray(state) &&
    state.length <= 20000 &&
    state.every(
      (d) =>
        d &&
        Object.hasOwn(ITEMS, d.item) &&
        Number.isInteger(d.count) &&
        d.count > 0 &&
        (ITEMS[d.item].portable
          ? validStack({ item: d.item, count: d.count, contents: d.contents })
          : d.contents === undefined) &&
        d.count <= (ITEMS[d.item].durability ? 256 : 1e6) &&
        vec(d.position) &&
        Math.abs(d.position[0]) < 2e9 &&
        Math.abs(d.position[2]) < 2e9 &&
        d.position[1] >= -100 &&
        d.position[1] < 512 &&
        vec(d.velocity) &&
        d.velocity.every((v) => Math.abs(v) < 100) &&
        Number.isFinite(d.life) &&
        d.life > 0 &&
        d.life <= 600 &&
        Number.isFinite(d.delay) &&
        d.delay >= 0 &&
        d.delay <= 3 &&
        validWear(d.wear, { [d.item]: d.count }),
    )
  );
}

export class ItemDrops {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.records = [];
    this.templates = new Map();
    this.clock = 0;
    this.haloGeometry = new THREE.TorusGeometry(0.23, 0.012, 3, 6);
    this.haloMaterial = new THREE.MeshBasicMaterial({ color: '#ae77ef' });
  }
  load(state = []) {
    for (const d of this.records) this.scene.remove(d.mesh);
    this.records = state.map((d) => ({ ...structuredClone(d), mesh: null }));
  }
  serialize() {
    return this.records.map(({ mesh, ...data }) => structuredClone(data));
  }
  spawnStack(stack, position, velocity = null, life = 300) {
    const wear = ITEMS[stack.item]?.durability
      ? { [stack.item]: [stack.wear ?? ITEMS[stack.item].durability] }
      : {};
    this.spawn(
      stack.item,
      stack.count,
      position,
      wear,
      velocity,
      life,
      stack.contents,
    );
  }
  spawn(
    item,
    count,
    position,
    wear = {},
    velocity = null,
    life = 300,
    contents = undefined,
  ) {
    if (!ITEMS[item] || count <= 0) return;
    if (ITEMS[item].portable && count > 1) {
      for (let i = 0; i < count; i++)
        this.spawn(item, 1, position, wear, velocity, life, contents);
      return;
    }
    // Nearby stacks share one entity. Equipment retains its ordered durability.
    const near = this.records.find(
      (d) =>
        d.item === item &&
        !ITEMS[item].portable &&
        d.delay <= 0 &&
        d.count + count <= (ITEMS[item].durability ? 256 : 1e6) &&
        Math.hypot(...d.position.map((v, i) => v - position[i])) < 1.1,
    );
    if (near) {
      if (ITEMS[item].durability) {
        const max = ITEMS[item].durability;
        near.wear[item] = Array.from(
          { length: near.count },
          (_, i) => near.wear[item]?.[i] ?? max,
        ).concat(
          Array.from({ length: count }, (_, i) => wear[item]?.[i] ?? max),
        );
      }
      near.count += count;
      near.life = Math.max(near.life, life);
      near.delay = Math.max(near.delay, 0.8);
      return;
    }
    this.records.push({
      item,
      count,
      position: [...position],
      wear: structuredClone(wear),
      ...(ITEMS[item].portable && contents !== undefined
        ? { contents: structuredClone(contents) }
        : {}),
      velocity: velocity || [
        (Math.random() - 0.5) * 2,
        2.8,
        (Math.random() - 0.5) * 2,
      ],
      life,
      delay: 0.8,
      mesh: null,
    });
  }
  model(id) {
    if (!this.templates.has(id) && ITEMS[id]?.portable) {
      const mesh = portableBoxMesh();
      mesh.userData = {};
      mesh.scale.setScalar(0.22);
      mesh.position.y = -0.11;
      this.templates.set(id, mesh);
    }
    if (
      !this.templates.has(id) &&
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
        'redstoneTorch',
        'repeater',
        'comparator',
        'cobweb',
        'sporeBlossom',
        'pointedDripstone',
      ].includes(BLOCKS[id]?.shape)
    ) {
      const mesh = buildingItemMesh(id, this.textures);
      mesh.scale.setScalar(0.22);
      this.templates.set(id, mesh);
    }
    if (!this.templates.has(id)) {
      let geometry, material;
      const image = itemImage(id);
      if (BLOCKS[id] && !isDoor(id)) {
        geometry = new THREE.CylinderGeometry(0.19, 0.19, 0.26, 6);
        material = ['side', 'top', 'top'].map(
          (face) =>
            new THREE.MeshLambertMaterial({
              map: this.textures.single(id + ':' + face),
              alphaTest: BLOCKS[id]?.foliage ? 0.5 : 0,
              side: BLOCKS[id]?.foliage ? THREE.DoubleSide : THREE.FrontSide,
            }),
        );
      } else if (image) {
        const map = new THREE.Texture(image);
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = map.minFilter = THREE.NearestFilter;
        map.needsUpdate = true;
        geometry = new THREE.PlaneGeometry(0.42, 0.42);
        material = new THREE.MeshLambertMaterial({
          map,
          alphaTest: 0.4,
          side: THREE.DoubleSide,
        });
      } else {
        geometry = new THREE.IcosahedronGeometry(0.17, 0);
        material = new THREE.MeshLambertMaterial({
          color: ITEMS[id].color || '#ffffff',
        });
      }
      this.templates.set(id, new THREE.Mesh(geometry, material));
    }
    const group = new THREE.Group(),
      halo = new THREE.Mesh(this.haloGeometry, this.haloMaterial);
    group.add(this.templates.get(id).clone(), halo);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.16;
    group.userData.enchantHalo = halo;
    return group;
  }
  blocked(world, p) {
    const a = worldToAxial(p[0], p[2]);
    return !world.loaded(a.q, a.r) || world.pointSolid(...p);
  }
  clearPath(world, from, to) {
    const steps = Math.ceil(Math.hypot(...from.map((v, i) => v - to[i])) / 0.2);
    for (let i = 1; i <= steps; i++) {
      if (
        this.blocked(
          world,
          from.map((v, j) => v + ((to[j] - v) * i) / steps),
        )
      )
        return false;
    }
    return true;
  }
  update(dt, world, camera, collect) {
    this.clock += dt;
    const player = [
      camera.position.x,
      camera.position.y - 1,
      camera.position.z,
    ];
    let visible = 0;
    for (const d of this.records) {
      const p = d.position,
        a = worldToAxial(p[0], p[2]);
      const distance = Math.hypot(...p.map((v, i) => v - player[i]));
      if (!world.loaded(a.q, a.r) || distance > 64) {
        if (d.mesh) {
          this.scene.remove(d.mesh);
          d.mesh = null;
        }
        continue;
      }
      d.life -= dt;
      d.delay = Math.max(0, d.delay - dt);
      const fluid = world.fluids.get(a.q, Math.floor(p[1]), a.r);
      if (fluid?.type === 'lava' || p[1] < -20) d.life = 0;
      if (d.life <= 0) continue;
      if (distance < 2.2 && d.delay === 0 && this.clearPath(world, p, player)) {
        if (distance < 0.85) {
          const taken = collect(d);
          d.count -= taken;
          if (d.wear[d.item]) d.wear[d.item] = d.wear[d.item].slice(taken);
          if (!d.count) {
            d.life = 0;
            continue;
          }
          d.delay = 0.3;
        } else {
          // Do not pull items into the player's body when their pack is full.
          if (collect(d, true) > 0) {
            d.velocity = player.map((v, i) => (v - p[i]) * 6);
          }
        }
      }
      d.velocity[1] += (fluid ? 10 : -18) * dt;
      d.velocity[1] = THREE.MathUtils.clamp(d.velocity[1], -22, fluid ? 2 : 12);
      if (fluid && p[1] > Math.floor(p[1]) + fluidHeight(fluid) - 0.12)
        d.velocity[1] *= Math.exp(-12 * dt);
      const steps = Math.max(
        1,
        Math.ceil((Math.max(...d.velocity.map(Math.abs)) * dt) / 0.12),
      );
      // Axis collision against actual hex cells also handles stairs and cave floors.
      for (let step = 0; step < steps; step++) {
        for (const axis of [0, 2, 1]) {
          const next = [...p];
          next[axis] += (d.velocity[axis] * dt) / steps;
          const probe = [...next];
          probe[1] -= 0.15;
          if (this.blocked(world, probe)) {
            d.velocity[axis] = 0;
          } else p[axis] = next[axis];
        }
      }
      const drag = Math.exp(-(fluid ? 3 : 2) * dt);
      d.velocity[0] *= drag;
      d.velocity[2] *= drag;
      if (distance < 44 && visible++ < 256) {
        if (!d.mesh) {
          d.mesh = this.model(d.item);
          this.scene.add(d.mesh);
        }
        d.mesh.position.fromArray(p);
        d.mesh.userData.enchantHalo.visible =
          Object.keys(enchantmentsOf(d.wear[d.item]?.[0])).length > 0;
        d.mesh.position.y += 0.04 + Math.sin(this.clock * 3 + p[0]) * 0.035;
        d.mesh.rotation.y = this.clock * 1.3 + p[2];
        d.mesh.visible = d.life > 15 || Math.sin(this.clock * 14) > 0;
      } else if (d.mesh) {
        this.scene.remove(d.mesh);
        d.mesh = null;
      }
    }
    this.records = this.records.filter((d) => {
      if (d.life > 0) return true;
      this.scene.remove(d.mesh);
      return false;
    });
  }
}
