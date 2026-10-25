import * as THREE from 'three';
import { axialToWorld, worldToAxial, hash } from './core.js';
import { MOBS, ANIMALS, HOSTILES } from './mob-data.js';
import { createMob, disposeMob } from './mob-graphics.js';

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
    if (MOBS[m.kind].hostile) return;
    const record = {
      id: m.id,
      kind: m.kind,
      position: m.mesh.position.toArray(),
      hp: m.hp,
      angle: m.angle,
      eggs: m.eggs,
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
    };
    this.active.push(m);
    return m;
  }
  spawn(kind, position, baby = 0) {
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
    });
    this.remember(m);
    return m;
  }
  remove(m) {
    this.records.delete(m.id);
    const index = this.active.indexOf(m);
    if (index >= 0) this.active.splice(index, 1);
    disposeMob(m.mesh);
  }
  floor(x, z, y, kind, step = 0.8) {
    const world = this.world,
      def = MOBS[kind],
      radius = kind === 'chicken' ? 0.18 : 0.32;
    const center = worldToAxial(x, z);
    if (!world.loaded(center.q, center.r)) return null;
    for (
      let floor = Math.floor(y + step);
      floor >= Math.floor(y - 3);
      floor--
    ) {
      if (
        floor < 1 ||
        floor > 62 ||
        !world.solid(center.q, floor - 1, center.r)
      )
        continue;
      let clear = true;
      for (const [dx, dz] of [
        [0, 0],
        [radius, 0],
        [-radius, 0],
        [0, radius],
        [0, -radius],
      ]) {
        const a = worldToAxial(x + dx, z + dz);
        if (!world.loaded(a.q, a.r) || world.fluids.get(a.q, floor, a.r)) {
          clear = false;
          break;
        }
        for (let h = 0; h < def.height; h += 0.35)
          if (world.solid(a.q, Math.floor(floor + h), a.r)) {
            clear = false;
            break;
          }
        if (!clear) break;
      }
      if (clear) return floor;
    }
    return null;
  }
  visible(from, to) {
    const length = from.distanceTo(to),
      steps = Math.ceil(length / 0.35);
    for (let i = 1; i < steps; i++) {
      const p = from.clone().lerp(to, i / steps),
        a = worldToAxial(p.x, p.z);
      if (
        !this.world.loaded(a.q, a.r) ||
        this.world.solid(a.q, Math.floor(p.y), a.r)
      )
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
            if (y !== null && y >= 6) this.spawn(kind, [p.x, y, p.z]);
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
    return this.active.find((m) => m.mesh === object) || null;
  }
  hit(m, damage, direction, loot = true) {
    m.hp -= damage;
    m.hit = 0.3;
    m.flee = 3;
    m.anger = 12;
    if (direction) {
      const p = m.mesh.position.clone().addScaledVector(direction, 0.5);
      const y = this.floor(p.x, p.z, m.mesh.position.y, m.kind);
      if (y !== null) m.mesh.position.set(p.x, y, p.z);
    }
    if (m.hp > 0) return;
    if (loot && !m.baby) {
      const drops = { ...MOBS[m.kind].drops };
      if (m.kind === 'sheep' && m.wool > 0) delete drops.wool;
      if (m.kind === 'crawler' && this.world.dimension === 'nether') {
        delete drops.pearl;
        drops.ember = 1;
      }
      for (const [id, n] of Object.entries(drops)) this.callbacks.drop(id, n);
    }
    this.remove(m);
  }
  interact(m, item) {
    const def = MOBS[m.kind];
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
    if (item === def.food) {
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
      message: `${def.name} · 手持${{ wheat: '小麦', seed: '麦种', apple: '苹果' }[def.food]}吸引并按 E 喂食`,
    };
  }
  update(dt, time, camera, held, creative) {
    const world = this.world,
      night = world.dimension !== 'overworld' || time % 600 >= 300;
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
        const kind =
          world.dimension === 'overworld'
            ? ['zombie', 'skeleton', 'spider'][
                Math.floor(hash(q, 17, r, world.seed) * 3)
              ]
            : 'crawler';
        for (let attempt = 0; attempt < 8; attempt++) {
          const cell = axialToWorld(
            q + Math.round(Math.random() * 4 - 2),
            r + Math.round(Math.random() * 4 - 2),
          );
          const floor = this.floor(cell.x, cell.z, y, kind, 1);
          if (floor !== null) {
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
        const kind =
          world.dimension === 'overworld'
            ? HOSTILES[Math.floor(Math.random() * HOSTILES.length)]
            : 'crawler';
        const p = axialToWorld(q, r),
          y = this.floor(p.x, p.z, world.terrainHeight(q, r), kind, 1);
        if (y !== null && y > 5) {
          this.spawn(kind, [p.x, y, p.z]);
          break;
        }
      }
    }
    for (const m of [...this.active]) {
      if (!this.active.includes(m)) continue;
      const def = MOBS[m.kind],
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
      m.mesh.scale.setScalar((m.baby > 0 ? 0.55 : 1) * (m.hit > 0 ? 1.08 : 1));
      m.sunCheck = (m.sunCheck || 0) - dt;
      if (def.sunlight && !night && m.sunCheck <= 0) {
        m.sunlit = this.visible(
          p.clone().add(new THREE.Vector3(0, def.height, 0)),
          new THREE.Vector3(p.x, 64, p.z),
        );
        m.sunCheck = 1;
      }
      const fluid = world.fluids.get(cell.q, Math.floor(p.y), cell.r);
      if (fluid?.type === 'lava') {
        m.hp -= dt * 6;
        if (m.hp <= 0) {
          this.remove(m);
          continue;
        }
      }
      if (def.sunlight && !night && m.sunlit) {
        m.hp -= dt * 3;
        m.hit = 0.1;
        if (m.hp <= 0) {
          this.remove(m);
          continue;
        }
      }
      const aggressive =
        def.hostile &&
        !creative &&
        (m.kind !== 'spider' || night || m.anger > 0);
      const dist = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      const attracted = !def.hostile && held === def.food && dist < 12;
      let speed = def.speed;
      if (m.flee > 0 && !def.hostile) {
        m.angle = Math.atan2(p.x - camera.position.x, p.z - camera.position.z);
        speed = 2.5;
      } else if ((aggressive && dist < 20) || attracted) {
        m.angle = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
        if (attracted) speed = dist < 2 ? 0 : 1.4;
        if (m.kind === 'skeleton' && dist < 8) {
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
      const x = p.x + Math.sin(m.angle) * speed * dt,
        z = p.z + Math.cos(m.angle) * speed * dt;
      const y = this.floor(x, z, p.y, m.kind, def.hostile ? 1 : 0.7);
      if (y !== null) p.set(x, y, z);
      else {
        m.angle += 1.4;
        m.think = 0.5;
      }
      m.mesh.rotation.y = m.angle + Math.PI;
      for (let j = 0; j < m.mesh.userData.legs.length; j++)
        m.mesh.userData.legs[j].rotation.x =
          Math.sin(time * 7 + j * Math.PI) * Math.min(0.3, speed * 0.25);
      if (aggressive && dist < 18) {
        const eye = p.clone().add(new THREE.Vector3(0, def.height * 0.8, 0));
        m.sightTimer = (m.sightTimer || 0) - dt;
        if (m.sightTimer <= 0) {
          m.sight = this.visible(eye, camera.position);
          m.sightTimer = 0.25;
        }
        const sight = m.sight;
        if (m.kind === 'skeleton' && sight && m.attack <= 0) {
          this.callbacks.shoot(eye, camera.position);
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
        } else if (
          dist < 1.5 &&
          Math.abs(p.y - (camera.position.y - 1.65)) < 1.5 &&
          sight &&
          m.attack <= 0
        ) {
          this.callbacks.damage(m.kind === 'zombie' ? 3 : 2);
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
      !ANIMALS.includes(m.kind) ||
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
