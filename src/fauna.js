import * as THREE from 'three';
import { axialToWorld, worldToAxial, hash } from './core.js';
import { MOBS, ANIMALS, HOSTILES } from './mob-data.js';
import { createMob, disposeMob, animateMob } from './mob-graphics.js';
import { flyingClear, updateNetherFlier } from './nether-mobs.js';
import { updateEnderman, teleportEnderman } from './endermen.js';
import { ENDERMAN_BLOCKS } from './enderman-data.js';
import {
  updateShulker,
  teleportShulker,
  orientShulker,
  shulkerHitboxes,
} from './shulkers.js';
import { findFloor, bodyClear, bodyOffsets } from './grounding.js';
import { Freezing } from './survival.js';
import { powderContact } from './powder-snow.js';
import { campfireHeat } from './campfires.js';
import { spawnCaveBats, updateBat } from './bats.js';
import { touchesWeb } from './cobwebs.js';

const timers = ['baby', 'love', 'cooldown', 'wool', 'milk', 'eggTimer'];
export class Fauna {
  constructor(scene, textures, callbacks) {
    this.scene = scene;
    this.textures = textures;
    this.callbacks = callbacks;
    this.active = [];
    this.records = new Map();
    this.regions = new Set();
    this.nextId = 1;
    this.ray = new THREE.Raycaster();
    this.syncTimer = this.hostileTimer = this.spawnerTimer = 0;
  }
  load(world, state = {}) {
    for (const m of this.active) disposeMob(m.mesh);
    this.active.length = 0;
    this.world = world;
    this.records = new Map((state.mobs || []).map((m) => [m.id, m]));
    this.regions = new Set(state.regions || []);
    this.nextId = state.nextId || 1;
    this.syncTimer = this.hostileTimer = 0;
  }
  remember(m) {
    if (
      MOBS[m.kind].ambient ||
      (MOBS[m.kind].hostile &&
        !MOBS[m.kind].persistent &&
        !(m.kind === 'enderman' && m.carried))
    ) {
      this.records.delete(m.id);
      return;
    }
    const record = {
      id: m.id,
      kind: m.kind,
      position: m.mesh.position.toArray(),
      hp: m.hp,
      angle: m.angle,
      eggs: m.eggs,
      ...(m.kind === 'enderman' ? { carried: m.carried } : {}),
      ...(m.kind === 'shulker' ? { attach: m.attach } : {}),
    };
    for (const field of timers) record[field] = m[field];
    this.records.set(m.id, record);
  }
  serialize() {
    for (const m of this.active) this.remember(m);
    return {
      nextId: this.nextId,
      regions: [...this.regions],
      mobs: [...this.records.values()],
    };
  }
  instantiate(record) {
    const mesh = createMob(record.kind, this.textures);
    mesh.position.fromArray(record.position);
    this.scene.add(mesh);
    const m = {
      ...record,
      mesh,
      think: 0,
      hit: 0,
      flee: 0,
      attack: 1,
      fuse: 0,
      anger: 0,
      frost: new Freezing(),
      snowFall: false,
      conversion: 0,
    };
    this.active.push(m);
    if (m.kind === 'shulker') {
      m.attach = record.attach ?? 0;
      m.peek = 0;
      m.hitboxes = () => shulkerHitboxes(m);
      orientShulker(m);
    }
    return m;
  }
  spawn(kind, position, baby = 0, attach = 0) {
    const m = this.instantiate({
      id: this.nextId++,
      kind,
      position,
      hp: MOBS[kind].hp,
      angle: Math.random() * Math.PI * 2,
      baby,
      love: 0,
      cooldown: 0,
      wool: 0,
      milk: 0,
      eggTimer: 100 + Math.random() * 60,
      eggs: 0,
      ...(kind === 'shulker' ? { attach } : {}),
    });
    this.remember(m);
    return m;
  }
  remove(m) {
    if (m.carried) this.callbacks.drop(m.carried, 1, m.mesh.position.toArray());
    this.records.delete(m.id);
    const index = this.active.indexOf(m);
    if (index >= 0) this.active.splice(index, 1);
    disposeMob(m.mesh);
  }
  floor(x, z, y, kind, step = 0.8) {
    return findFloor(this.world, x, z, y, {
      step,
      height: MOBS[kind].height,
      radius: MOBS[kind].radius ?? (kind === 'chicken' ? 0.18 : 0.32),
    });
  }
  canSpawnAt(kind, x, y, z) {
    const def = MOBS[kind];
    return (
      powderContact(this.world, x, y, z, def.height, def.radius || 0.32)
        .length === 0
    );
  }
  visible(from, to) {
    const length = from.distanceTo(to),
      steps = Math.ceil(length / 0.35);
    for (let i = 1; i < steps; i++) {
      const p = from.clone().lerp(to, i / steps),
        a = worldToAxial(p.x, p.z);
      if (!this.world.loaded(a.q, a.r) || this.world.pointSolid(p.x, p.y, p.z))
        return false;
    }
    return true;
  }
  sync(camera) {
    const world = this.world,
      a = worldToAxial(camera.position.x, camera.position.z);
    for (const m of [...this.active]) {
      this.remember(m);
      if (m.mesh.position.distanceTo(camera.position) > 58) {
        this.active.splice(this.active.indexOf(m), 1);
        disposeMob(m.mesh);
      }
    }
    if (world.dimension === 'overworld') {
      spawnCaveBats(this, camera);
      const cx = Math.floor(a.q / 24),
        cz = Math.floor(a.r / 24);
      for (let x = cx - 1; x <= cx + 1; x++)
        for (let z = cz - 1; z <= cz + 1; z++) {
          const key = x + ',' + z;
          if (
            this.regions.has(key) ||
            this.records.size >= 2048 ||
            this.active.length >= 64
          )
            continue;
          // Wait until a region's center is loaded, so exploring its edge cannot erase its wildlife.
          if (!world.loaded(x * 24 + 12, z * 24 + 12)) continue;
          this.regions.add(key);
          for (let i = 0; i < 5 && this.records.size < 2048; i++) {
            const q = x * 24 + 3 + Math.floor(hash(x, i, z, world.seed) * 18);
            const r =
              z * 24 + 3 + Math.floor(hash(z, i + 71, x, world.seed) * 18);
            const kind = ANIMALS[(i + Math.abs(x + z)) % ANIMALS.length],
              p = axialToWorld(q, r);
            const y = this.floor(p.x, p.z, world.terrainHeight(q, r), kind);
            if (y !== null && y >= 6 && this.canSpawnAt(kind, p.x, y, p.z))
              this.spawn(kind, [p.x, y, p.z]);
          }
        }
    }
    const loaded = new Set(this.active.map((m) => m.id));
    for (const record of this.records.values()) {
      if (this.active.length >= 72) break;
      if (loaded.has(record.id)) continue;
      const [x, y, z] = record.position,
        a = worldToAxial(x, z);
      if (
        Math.hypot(x - camera.position.x, z - camera.position.z) < 45 &&
        world.loaded(a.q, a.r)
      )
        this.instantiate(record);
    }
  }
  target(camera, distance = Infinity) {
    this.ray.setFromCamera(new THREE.Vector2(), camera);
    this.ray.far = Math.min(4.5, distance);
    const hit = this.ray.intersectObjects(
      this.active.map((m) => m.mesh),
      true,
    )[0];
    if (!hit) return null;
    let object = hit.object;
    while (object.parent && !this.active.some((m) => m.mesh === object))
      object = object.parent;
    const mob = this.active.find((m) => m.mesh === object) || null;
    if (mob) mob.targetDistance = hit.distance;
    return mob;
  }
  nudge(m, direction, distance = 0.5) {
    if (MOBS[m.kind].stationary) return;
    if (direction) {
      const steps = Math.max(1, Math.ceil(distance / 0.2));
      for (let i = 0; i < steps; i++) {
        const p = m.mesh.position
          .clone()
          .addScaledVector(direction, distance / steps);
        if (MOBS[m.kind].flying) {
          if (!flyingClear(this.world, p, m.kind)) break;
          m.mesh.position.copy(p);
        } else {
          const y = this.floor(p.x, p.z, m.mesh.position.y, m.kind);
          if (y === null) break;
          m.mesh.position.set(p.x, y, p.z);
        }
      }
    }
  }
  hatch(point, count) {
    let spawned = 0;
    const positions = [
      [0, 0],
      ...Array.from({ length: 6 }, (_, i) => [
        Math.cos((i * Math.PI) / 3) * 0.65,
        Math.sin((i * Math.PI) / 3) * 0.65,
      ]),
    ];
    for (const [dx, dz] of positions) {
      if (
        spawned >= count ||
        this.records.size >= 2048 ||
        this.active.length >= 72
      )
        break;
      const x = point.x + dx,
        z = point.z + dz;
      const y = this.floor(x, z, point.y, 'chicken');
      if (y === null) continue;
      this.spawn('chicken', [x, y, z], 180);
      spawned++;
    }
    return spawned;
  }
  dodge(m) {
    if (!m || m.kind !== 'enderman' || !this.active.includes(m)) return false;
    if (!this.creative && m.anger <= 0)
      this.callbacks.mobSound?.('endermanAngry', m.mesh.position);
    if (!this.creative) m.anger = 60;
    if (this.camera) teleportEnderman(this, m, this.camera);
    return true;
  }
  hit(m, damage, direction, loot = true, provoked = true, knockback = 0.5) {
    if (m.kind === 'shulker' && (m.peek || 0) < 0.15) damage *= 0.2;
    m.hp -= damage;
    m.hit = 0.3;
    m.flee = 3;
    if (provoked) {
      if (m.kind === 'enderman' && m.anger <= 0)
        this.callbacks.mobSound?.('endermanAngry', m.mesh.position);
      m.anger = m.kind === 'enderman' ? 60 : 12;
    }
    this.nudge(m, direction, knockback);
    if (m.hp > 0) {
      if (m.kind === 'shulker' && m.hp < 15 && provoked && Math.random() < 0.25)
        teleportShulker(this, m);
      if (
        m.kind === 'enderman' &&
        provoked &&
        this.camera &&
        Math.random() < 0.25
      )
        teleportEnderman(this, m, this.camera);
      return;
    }
    if (loot && !m.baby) {
      this.callbacks.experience?.(
        MOBS[m.kind].experience ??
          (MOBS[m.kind].hostile ? 5 : 1 + Math.floor(Math.random() * 3)),
        [m.mesh.position.x, m.mesh.position.y + 0.5, m.mesh.position.z],
      );
      const drops = { ...MOBS[m.kind].drops };
      if (m.kind === 'enderman' && Math.random() < 0.5) delete drops.pearl;
      if (m.kind === 'shulker' && Math.random() < 0.5)
        delete drops.shulkerShell;
      if (m.kind === 'sheep' && m.wool > 0) delete drops.wool;
      if (m.kind === 'crawler' && this.world.dimension === 'nether') {
        delete drops.pearl;
        drops.ember = 1;
      }
      for (const [id, n] of Object.entries(drops))
        this.callbacks.drop(id, n, [
          m.mesh.position.x,
          m.mesh.position.y + 0.5,
          m.mesh.position.z,
        ]);
    }
    this.remove(m);
  }
  interact(m, item) {
    const def = MOBS[m.kind];
    if (def.ambient) return { message: '蝙蝠喜欢安静的洞穴，靠近时会惊飞。' };
    if (def.hostile) return null;
    if (item === 'shears' && m.kind === 'sheep' && !m.baby) {
      if (m.wool > 0) return { message: '羊毛尚未长好，让它在草地上吃草。' };
      m.wool = 120;
      return {
        wear: 'shears',
        give: { wool: 3 },
        message: '剪下羊毛 ×3 · 绵羊安然无恙',
      };
    }
    if (item === 'bucket' && m.kind === 'cow' && !m.baby) {
      if (m.milk > 0) return { message: '奶牛需要休息片刻。' };
      m.milk = 30;
      return {
        consume: 'bucket',
        give: { milkBucket: 1 },
        replace: 'milkBucket',
        message: '装满一桶牛奶',
      };
    }
    if ((def.foods || [def.food]).includes(item)) {
      if (m.baby) {
        m.baby = Math.max(0, m.baby - 45);
        return { consume: item, message: '幼崽吃饱了，成长加快。' };
      }
      if (m.cooldown > 0 || m.love > 0)
        return {
          message:
            m.love > 0 ? '正在寻找同类伙伴。' : '刚刚繁殖过，稍等一会儿。',
        };
      m.love = 40;
      return {
        consume: item,
        message: '喂食成功 · 再喂一只同类，靠近后即可繁殖',
      };
    }
    if (m.kind === 'chicken' && m.eggs > 0) {
      const count = m.eggs;
      m.eggs = 0;
      return { give: { egg: count }, message: '收集鸡蛋 ×' + count };
    }
    return {
      message: `${def.name} · 手持${m.kind === 'pig' ? '胡萝卜 / 马铃薯 / 苹果' : { wheat: '小麦', seed: '麦种', apple: '苹果' }[def.food]}吸引并右键喂食`,
    };
  }
  update(dt, time, camera, held, creative, weather = null) {
    const hands = Array.isArray(held) ? held : [held];
    this.camera = camera;
    this.creative = creative;
    const world = this.world,
      night =
        world.dimension !== 'overworld' ||
        time % 600 >= 300 ||
        (weather?.storm || 0) > 0.65;
    this.syncTimer -= dt;
    this.hostileTimer -= dt;
    this.spawnerTimer -= dt;
    if (this.spawnerTimer <= 0 && !creative) {
      this.spawnerTimer = 8;
      for (const k of world.spawners) {
        if (
          this.active.length >= 80 ||
          this.active.filter((m) => MOBS[m.kind].hostile).length >= 14
        )
          break;
        const [q, y, r] = k.split(',').map(Number),
          p = axialToWorld(q, r),
          center = new THREE.Vector3(p.x, y, p.z);
        if (center.distanceTo(camera.position) > 16) continue;
        let lit = false;
        for (let dq = -3; dq <= 3 && !lit; dq++)
          for (let dr = -3; dr <= 3 && !lit; dr++)
            for (let dy = -3; dy <= 3; dy++) {
              const type = world.get(q + dq, y + dy, r + dr);
              if (type === 'torch' || type === 'lantern') {
                const light = axialToWorld(q + dq, r + dr);
                if (Math.hypot(light.x - p.x, dy, light.z - p.z) <= 5)
                  lit = true;
              }
            }
        if (
          lit ||
          this.active.filter(
            (m) =>
              MOBS[m.kind].hostile && m.mesh.position.distanceTo(center) < 7,
          ).length >= 4
        )
          continue;
        const mineNest =
          world.dimension === 'overworld' &&
          world
            .structures(q, r, 0)
            .some(
              (s) =>
                s.kind === 'mine' &&
                s.mine.nest.q === q &&
                s.mine.nest.y === y &&
                s.mine.nest.r === r,
            );
        const kind = mineNest
          ? 'caveSpider'
          : world.dimension === 'overworld'
            ? ['zombie', 'skeleton', 'spider'][
                Math.floor(hash(q, 17, r, world.seed) * 3)
              ]
            : world.dimension === 'nether'
              ? 'blaze'
              : 'crawler';
        for (let attempt = 0; attempt < 8; attempt++) {
          const cell = axialToWorld(
            q + Math.round(Math.random() * 4 - 2),
            r + Math.round(Math.random() * 4 - 2),
          );
          const floor = this.floor(cell.x, cell.z, y, kind, 1);
          if (floor !== null && this.canSpawnAt(kind, cell.x, floor, cell.z)) {
            this.spawn(kind, [cell.x, floor, cell.z]);
            break;
          }
        }
      }
    }
    if (this.syncTimer <= 0) {
      this.sync(camera);
      this.syncTimer = 1;
    }
    if (
      night &&
      this.hostileTimer <= 0 &&
      this.active.filter((m) => MOBS[m.kind].hostile).length < 10
    ) {
      this.hostileTimer = 12;
      const center = worldToAxial(camera.position.x, camera.position.z);
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = Math.random() * Math.PI * 2,
          radius = 13 + Math.random() * 12;
        const q = center.q + Math.round(Math.cos(angle) * radius),
          r = center.r + Math.round(Math.sin(angle) * radius);
        const endermen = this.active.filter(
          (m) => m.kind === 'enderman',
        ).length;
        let kind =
          world.dimension === 'overworld'
            ? endermen < 3 && Math.random() < 0.12
              ? 'enderman'
              : HOSTILES[Math.floor(Math.random() * HOSTILES.length)]
            : world.dimension === 'end'
              ? endermen < 6 && Math.random() < 0.75
                ? 'enderman'
                : 'crawler'
              : world.dimension === 'nether' &&
                  Math.random() < 0.4 &&
                  this.active.filter((m) => m.kind === 'ghast').length < 2
                ? 'ghast'
                : 'crawler';
        const p = axialToWorld(q, r),
          y = MOBS[kind].flying
            ? Math.min(42, world.terrainHeight(q, r) + 5 + Math.random() * 6)
            : this.floor(p.x, p.z, world.terrainHeight(q, r), kind, 1);
        if (
          MOBS[kind].flying &&
          !flyingClear(world, new THREE.Vector3(p.x, y, p.z), kind)
        )
          continue;
        if (y !== null && y > 5 && this.canSpawnAt(kind, p.x, y, p.z)) {
          if (
            kind === 'skeleton' &&
            world.biome(q, r) === '雪原' &&
            world.surface(q, r) <= y &&
            Math.random() < 0.8
          )
            kind = 'stray';
          this.spawn(kind, [p.x, y, p.z]);
          break;
        }
      }
    }
    for (const m of [...this.active]) {
      if (!this.active.includes(m)) continue;
      let def = MOBS[m.kind],
        p = m.mesh.position;
      for (const field of timers)
        if (field !== 'wool' && field !== 'eggTimer')
          m[field] = Math.max(0, m[field] - dt);
      m.think -= dt;
      m.hit = Math.max(0, m.hit - dt);
      m.flee = Math.max(0, m.flee - dt);
      m.anger = Math.max(0, m.anger - dt);
      m.attack -= dt;
      const cell = worldToAxial(p.x, p.z);
      if (
        m.wool > 0 &&
        world.get(cell.q, Math.floor(p.y) - 1, cell.r) === 'grass'
      )
        m.wool = Math.max(0, m.wool - dt);
      if (m.kind === 'chicken' && !m.baby) {
        m.eggTimer -= dt;
        if (m.eggTimer <= 0) {
          m.eggs = Math.min(8, m.eggs + 1);
          m.eggTimer = 150;
        }
      }
      if (m.mesh.userData.wool) m.mesh.userData.wool.visible = m.wool <= 0;
      m.mesh.scale.setScalar(
        (def.scale || 1) * (m.baby > 0 ? 0.55 : 1) * (m.hit > 0 ? 1.08 : 1),
      );
      m.sunCheck = (m.sunCheck || 0) - dt;
      if ((def.sunlight || def.webImmune) && !night && m.sunCheck <= 0) {
        m.sunlit = this.visible(
          p.clone().add(new THREE.Vector3(0, def.height, 0)),
          new THREE.Vector3(p.x, 64, p.z),
        );
        m.sunCheck = 1;
      }
      const snow =
        powderContact(world, p.x, p.y, p.z, def.height, def.radius || 0.32)
          .length > 0;
      if (m.kind === 'skeleton') {
        const headInSnow =
          world.get(cell.q, Math.floor(p.y + def.height * 0.9), cell.r) ===
          'powderSnow';
        m.conversion = m.conversion >= 7 || headInSnow ? m.conversion + dt : 0;
        if (m.conversion >= 22) {
          const mesh = createMob('stray', this.textures);
          mesh.position.copy(p);
          mesh.rotation.copy(m.mesh.rotation);
          disposeMob(m.mesh);
          this.scene.add(mesh);
          m.mesh = mesh;
          m.kind = 'stray';
          m.conversion = 0;
          p = mesh.position;
          def = MOBS.stray;
        }
      }
      const frozen = m.frost.tick(dt, snow && !def.freezeImmune);
      if (frozen) {
        this.hit(
          m,
          frozen * (m.kind === 'blaze' ? 5 : 1),
          null,
          true,
          false,
          0,
        );
        if (!this.active.includes(m)) continue;
      }
      const fluid = world.fluids.get(cell.q, Math.floor(p.y), cell.r);
      if (fluid?.type === 'lava' && !def.fireImmune) {
        m.hp -= dt * 6;
        if (m.hp <= 0) {
          this.remove(m);
          continue;
        }
      }
      const heat = campfireHeat(world, p.x, p.y, p.z);
      if (heat && !def.fireImmune) {
        m.hp -= dt * heat;
        m.hit = 0.1;
        if (m.hp <= 0) {
          this.remove(m);
          continue;
        }
      }
      if (def.sunlight && !night && m.sunlit && (weather?.rain || 0) < 0.3) {
        m.hp -= dt * 3;
        m.hit = 0.1;
        if (m.hp <= 0) {
          this.remove(m);
          continue;
        }
      }
      if (m.kind === 'bat') {
        updateBat(this, m, dt, time, camera);
        continue;
      }
      if (def.flying) {
        updateNetherFlier(this, m, dt, time, camera, creative);
        continue;
      }
      if (m.kind === 'shulker') {
        updateShulker(this, m, dt, time, camera, creative);
        continue;
      }
      if (m.kind === 'enderman') {
        updateEnderman(this, m, dt, time, camera, creative, night, weather);
        continue;
      }
      const aggressive =
        def.hostile &&
        !creative &&
        (!def.webImmune || night || !m.sunlit || m.anger > 0);
      const dist = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      const withinMeleeReach =
        dist < 1.5 && Math.abs(p.y - (camera.position.y - 1.65)) < 1.5;
      const attracted =
        !def.hostile &&
        hands.some((item) => (def.foods || [def.food]).includes(item)) &&
        dist < 12;
      let speed = def.speed;
      if (m.flee > 0 && !def.hostile) {
        m.angle = Math.atan2(p.x - camera.position.x, p.z - camera.position.z);
        speed = 2.5;
      } else if ((aggressive && dist < 20) || attracted) {
        m.angle = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
        if (attracted) speed = dist < 2 ? 0 : 1.4;
        if (def.ranged && dist < 8) {
          speed = dist < 5 ? 0.8 : 0;
          if (dist < 5) m.angle += Math.PI;
        }
      } else if (m.think <= 0) {
        m.angle += (Math.random() - 0.5) * 2.5;
        m.think = 2 + Math.random() * 4;
      }
      if (m.love > 0 && !def.hostile) {
        const partner = this.active.find(
          (other) =>
            other !== m &&
            other.kind === m.kind &&
            other.love > 0 &&
            !other.baby &&
            other.mesh.position.distanceTo(p) < 8,
        );
        if (partner) {
          m.angle = Math.atan2(
            partner.mesh.position.x - p.x,
            partner.mesh.position.z - p.z,
          );
          speed = 1;
          if (
            partner.mesh.position.distanceTo(p) < 1.8 &&
            this.records.size < 2048 &&
            this.active.length < 72
          ) {
            m.love = partner.love = 0;
            m.cooldown = partner.cooldown = 100;
            this.spawn(m.kind, p.toArray(), 180);
            this.callbacks.experience?.(1 + Math.floor(Math.random() * 7), [
              p.x,
              p.y + 0.5,
              p.z,
            ]);
            this.callbacks.notice('一只' + def.name + '幼崽出生了！');
          }
        }
      }
      if (m.baby && !attracted) {
        const adult = this.active.find(
          (other) =>
            other.kind === m.kind &&
            !other.baby &&
            other.mesh.position.distanceTo(p) < 8,
        );
        if (adult && adult.mesh.position.distanceTo(p) > 2) {
          m.angle = Math.atan2(
            adult.mesh.position.x - p.x,
            adult.mesh.position.z - p.z,
          );
          speed = 1.3;
        }
      }
      if (aggressive && !def.ranged && withinMeleeReach) speed = 0;
      if (
        !def.webImmune &&
        touchesWeb(world, p.x, p.y, p.z, def.height, def.radius || 0.32)
      )
        speed *= 0.25;
      if (snow) speed *= 0.2;
      const previousX = p.x,
        previousZ = p.z;
      const x = p.x + Math.sin(m.angle) * speed * dt,
        z = p.z + Math.cos(m.angle) * speed * dt;
      const y = this.floor(x, z, p.y, m.kind, def.hostile ? 1 : 0.7);
      const nearSnow =
        powderContact(
          world,
          x,
          p.y - 0.06,
          z,
          def.height + 0.06,
          def.radius || 0.32,
        ).length > 0;
      m.snowFall ||= nearSnow;
      if (m.snowFall) {
        const descent = dt * (nearSnow ? 0.8 : 6);
        const clear = bodyClear(
          world,
          x,
          z,
          p.y + 0.025,
          p.y + def.height - 0.025,
          def.radius || 0.32,
        );
        let floor = clear ? y : this.floor(p.x, p.z, p.y, m.kind, 0);
        // A block placed into a mob can invalidate standing clearance, but
        // cannot remove the solid support crossed by this downward step.
        if (floor === null)
          for (const [dx, dz] of bodyOffsets(def.radius || 0.32)) {
            const support = world.groundAt(
              p.x + dx,
              p.z + dz,
              p.y - descent - 0.025,
              p.y + 0.025,
            );
            if (support !== null) floor = Math.max(floor ?? -Infinity, support);
          }
        if (clear) {
          p.x = x;
          p.z = z;
        }
        if (floor !== null && floor >= p.y - descent) {
          p.y = floor;
          m.snowFall = false;
        } else p.y -= descent;
        if (p.y < -8) {
          this.remove(m);
          continue;
        }
      } else if (y !== null) p.set(x, y, z);
      else {
        m.angle += 1.4;
        m.think = 0.5;
      }
      const turn = m.angle + Math.PI - m.mesh.rotation.y;
      m.mesh.rotation.y +=
        Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 8);
      animateMob(
        m,
        dt,
        time,
        camera,
        aggressive && dist < 20,
        Math.hypot(p.x - previousX, p.z - previousZ),
      );
      if (aggressive && dist < 18) {
        const eye = p.clone().add(new THREE.Vector3(0, def.height * 0.8, 0));
        m.sightTimer = (m.sightTimer || 0) - dt;
        if (m.sightTimer <= 0) {
          m.sight = this.visible(eye, camera.position);
          m.sightTimer = 0.25;
        }
        const sight = m.sight;
        if (def.ranged && sight && m.attack <= 0) {
          this.callbacks.shoot(eye, camera.position, def.arrowEffect);
          m.attack = 2.7;
        } else if (m.kind === 'creeper') {
          if (m.fuse === 0 && dist < 2.7 && sight) this.callbacks.fuse?.();
          m.fuse = Math.max(0, m.fuse + (dist < 2.7 && sight ? dt : -dt * 2));
          m.mesh.scale.multiplyScalar(
            1 + Math.sin(m.fuse * 22) * m.fuse * 0.08,
          );
          if (m.fuse >= 1.6) {
            const center = p.clone();
            this.remove(m);
            this.callbacks.explode(center);
            continue;
          }
        } else if (withinMeleeReach && sight && m.attack <= 0) {
          this.callbacks.damage(m.kind === 'zombie' ? 3 : 2, p, def.poison);
          m.attack = 1.1;
        }
      } else m.fuse = 0;
      if (m.kind === 'creeper')
        m.mesh.traverse((o) =>
          o.material?.emissive?.setScalar(
            m.fuse > 0 ? Math.max(0, Math.sin(m.fuse * 22)) * 0.65 : 0,
          ),
        );
    }
  }
}

export function validFauna(state) {
  if (
    !state ||
    !Number.isSafeInteger(state.nextId) ||
    state.nextId < 1 ||
    !Array.isArray(state.regions) ||
    state.regions.length > 20000 ||
    state.regions.some(
      (k) => typeof k !== 'string' || !/^-?\d+,-?\d+$/.test(k),
    ) ||
    !Array.isArray(state.mobs) ||
    state.mobs.length > 2048
  )
    return false;
  const ids = new Set();
  return state.mobs.every((m) => {
    if (
      !m ||
      (!ANIMALS.includes(m.kind) &&
        m.kind !== 'shulker' &&
        !(m.kind === 'enderman' && ENDERMAN_BLOCKS.includes(m.carried))) ||
      (m.kind === 'shulker' &&
        (!Number.isInteger(m.attach) || m.attach < 0 || m.attach > 7)) ||
      !Number.isSafeInteger(m.id) ||
      m.id < 1 ||
      m.id >= state.nextId ||
      ids.has(m.id) ||
      !Array.isArray(m.position) ||
      m.position.length !== 3 ||
      !m.position.every((n) => Number.isFinite(n) && Math.abs(n) < 2e9) ||
      m.position[1] < 0 ||
      m.position[1] > 64 ||
      !Number.isFinite(m.hp) ||
      m.hp <= 0 ||
      m.hp > MOBS[m.kind].hp ||
      !Number.isFinite(m.angle) ||
      !Number.isInteger(m.eggs) ||
      m.eggs < 0 ||
      m.eggs > 8 ||
      timers.some((k) => !Number.isFinite(m[k]) || m[k] < 0 || m[k] > 1000)
    )
      return false;
    ids.add(m.id);
    return true;
  });
}
