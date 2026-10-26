import * as THREE from 'three';
import { worldToAxial } from './core.js';
import { fluidHeight } from './fluids.js';
import { fishingConditions, fishingLoot } from './fishing-data.js';
import { itemImage } from './texture-pack.js';

export class Fishing {
  constructor(scene, callbacks, touch = false) {
    this.callbacks = callbacks;
    this.biteWindow = touch ? 2.1 : 1.6;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bobber = new THREE.Group();
    for (const [color, y] of [
      ['#f1ead8', -0.05],
      ['#cc493b', 0.05],
    ]) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.1, 6),
        new THREE.MeshLambertMaterial({ color }),
      );
      mesh.position.y = y;
      this.bobber.add(mesh);
    }
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6),
      new THREE.MeshLambertMaterial({ color: '#302c25' }),
    );
    stem.position.y = 0.18;
    this.bobber.add(stem);
    this.group.add(this.bobber);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(25 * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: '#e8dfc6',
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.line.frustumCulled = false;
    this.group.add(this.line);
    const points = Array.from(
      { length: 6 },
      (_, i) =>
        new THREE.Vector3(
          Math.cos((i * Math.PI) / 3),
          0,
          Math.sin((i * Math.PI) / 3),
        ),
    );
    this.rings = Array.from({ length: 4 }, () => {
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: '#c5e6eb',
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      this.group.add(ring);
      return ring;
    });
    this.splash = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.035, 0.045, 0.035),
      new THREE.MeshBasicMaterial({
        color: '#bedfed',
        transparent: true,
        opacity: 0.9,
      }),
      12,
    );
    this.splash.frustumCulled = false;
    this.group.add(this.splash);
    this.dummy = new THREE.Object3D();
    this.tip = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.clear();
  }
  clear() {
    this.phase = 'idle';
    this.group.visible = false;
    this.clock = 0;
    this.splashAge = 2;
    this.checkTimer = 0;
    if (this.prize) {
      this.group.remove(this.prize);
      this.prize.geometry.dispose();
      this.prize.material.map?.dispose();
      this.prize.material.dispose();
      this.prize = null;
    }
  }
  get active() {
    return this.phase !== 'idle';
  }
  get status() {
    if (this.phase === 'flying') return '抛线中… · 右键收回';
    if (this.phase === 'snagged') return '鱼钩挂住了 · 右键收回';
    if (this.phase === 'bite') return '咬钩了！右键收杆';
    if (this.phase === 'approach') return '水纹靠近了… 准备收杆';
    if (this.phase === 'return') return '收杆';
    if (this.phase === 'waiting')
      return `等待咬钩 · ${this.conditions.open ? '开阔深水' : '浅水 / 狭窄水域'}${this.conditions.raining ? ' · 雨中更活跃' : !this.conditions.sky ? ' · 遮蔽水面' : ''}`;
    return '鱼竿 · 对准水面右键抛线';
  }
  act(world, camera, rain) {
    if (this.phase === 'return') return;
    if (!this.active) {
      const a = worldToAxial(camera.position.x, camera.position.z),
        y = Math.floor(camera.position.y);
      if (world.fluids.get(a.q, y, a.r)) {
        this.callbacks.notice('请到水面上方抛线。');
        return;
      }
      const aim = camera.getWorldDirection(new THREE.Vector3());
      this.position.copy(camera.position).addScaledVector(aim, 0.35);
      this.velocity.copy(aim).multiplyScalar(12);
      this.velocity.y += 3;
      this.clock = 0;
      this.phase = 'flying';
      this.group.visible = true;
      this.callbacks.sound('cast');
      return;
    }
    if (this.phase === 'bite') {
      // Recheck the water at the moment of collection, after block/fluid edits.
      const f = world.fluids.get(this.cell.q, this.cell.y, this.cell.r);
      if (
        f?.type !== 'water' ||
        world.get(this.cell.q, this.cell.y, this.cell.r)
      ) {
        this.clear();
        return;
      }
      this.conditions = fishingConditions(
        world,
        this.cell.q,
        this.cell.y,
        this.cell.r,
        rain,
      );
      const loot = fishingLoot(this.conditions);
      this.showPrize(loot.item);
      this.callbacks.catch(loot);
      this.callbacks.wear(1);
      this.callbacks.sound('catch');
    } else if (this.phase === 'snagged') {
      this.callbacks.wear(2);
      this.callbacks.notice('收回挂住的鱼钩 · 耐久 −2');
    } else this.callbacks.notice('收回鱼线，还没有鱼咬钩。');
    // The last point of durability can break the rod and clear the session.
    if (!this.active) return;
    this.phase = 'return';
    this.returnStart = this.position.clone();
    this.returnTime = 0;
  }
  showPrize(item) {
    const image = itemImage(item);
    if (!image) return;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    this.prize = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({
        map: texture,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    this.group.add(this.prize);
  }
  wait(world, rain) {
    this.conditions = fishingConditions(
      world,
      this.cell.q,
      this.cell.y,
      this.cell.r,
      rain,
    );
    this.phase = 'waiting';
    this.remaining = 9 + Math.random() * 16;
    this.checkTimer = 0;
  }
  update(dt, world, camera, rain) {
    if (!this.active) return;
    this.clock += dt;
    this.splashAge += dt;
    if (this.phase === 'return') {
      this.returnTime += dt;
      const t = Math.min(1, this.returnTime / 0.45);
      this.position.lerpVectors(this.returnStart, this.tip, t);
      this.position.y += Math.sin(t * Math.PI) * 0.7;
      if (t === 1) this.clear();
      return;
    }
    if (
      this.position.distanceTo(camera.position) > 24 ||
      this.position.y < 0 ||
      this.position.y > 90
    ) {
      this.clear();
      this.callbacks.notice('鱼线超出距离，已收回。');
      return;
    }
    if (this.phase === 'flying') {
      const steps = Math.max(
          1,
          Math.ceil((this.velocity.length() * dt) / 0.08),
        ),
        step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const previous = this.position.clone();
        this.velocity.y -= 14 * step;
        this.position.addScaledVector(this.velocity, step);
        const a = worldToAxial(this.position.x, this.position.z),
          y = Math.floor(this.position.y);
        if (!world.loaded(a.q, a.r)) {
          this.clear();
          return;
        }
        const fluid = world.fluids.get(a.q, y, a.r);
        if (
          world.pointSolid(this.position.x, this.position.y, this.position.z)
        ) {
          this.position.copy(previous);
          this.phase = 'snagged';
          break;
        }
        if (fluid && this.position.y <= y + fluidHeight(fluid)) {
          if (fluid.type !== 'water') {
            this.clear();
            this.callbacks.notice('这里钓不到鱼，试试平静的水面。');
            break;
          }
          if (fluid.falling || world.fluids.get(a.q, y + 1, a.r)) {
            this.phase = 'snagged';
            break;
          }
          this.cell = { ...a, y };
          this.position.y = y + fluidHeight(fluid);
          this.splashAge = 0;
          this.wait(world, rain);
          this.callbacks.sound('splash');
          break;
        }
      }
      if (this.clock > 8 && this.phase === 'flying') this.phase = 'snagged';
      return;
    }
    if (this.phase === 'snagged') return;
    const { q, y, r } = this.cell,
      fluid = world.fluids.get(q, y, r);
    if (
      fluid?.type !== 'water' ||
      fluid.falling ||
      world.get(q, y, r) ||
      world.fluids.get(q, y + 1, r)
    ) {
      this.clear();
      this.callbacks.notice('水面发生变化，鱼线已收回。');
      return;
    }
    this.position.y = y + fluidHeight(fluid);
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = 0.5;
      this.conditions = fishingConditions(world, q, y, r, rain);
      const distance = this.tip.distanceTo(this.position);
      for (let n = 0.4; n < distance - 0.2; n += 0.2) {
        const p = this.tip.clone().lerp(this.position, n / distance);
        if (world.pointSolid(p.x, p.y, p.z)) {
          this.clear();
          this.callbacks.notice('鱼线被挡住了，换个位置抛线。');
          return;
        }
      }
    }
    if (this.phase === 'waiting') {
      this.remaining -= dt * this.conditions.rate;
      if (this.remaining <= 0) {
        this.phase = 'approach';
        this.remaining = 2.2;
      }
    } else if (this.phase === 'approach') {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.phase = 'bite';
        this.remaining = this.biteWindow;
        this.splashAge = 0;
        this.callbacks.sound('bite');
      }
    } else if (this.phase === 'bite') {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.wait(world, rain);
        this.callbacks.notice('鱼跑掉了… 保持鱼线，等待下一次咬钩。');
      }
    }
  }
  render(camera, tip, visible) {
    this.tip.copy(tip);
    this.group.visible = this.active && visible;
    if (!this.group.visible) return;
    const floating = ['waiting', 'approach', 'bite'].includes(this.phase);
    this.bobber.position.copy(this.position);
    if (floating)
      this.bobber.position.y +=
        this.phase === 'bite'
          ? -0.14 + Math.sin(this.clock * 28) * 0.05
          : Math.sin(this.clock * 3) * 0.035;
    this.bobber.rotation.z =
      this.phase === 'bite' ? Math.sin(this.clock * 25) * 0.18 : 0;
    const positions = this.line.geometry.attributes.position;
    const sag = Math.min(1.2, tip.distanceTo(this.position) * 0.065);
    for (let i = 0; i < 25; i++) {
      const t = i / 24,
        p = tip.clone().lerp(this.bobber.position, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
    this.rings.forEach((ring, i) => {
      ring.visible = floating;
      const t = (this.clock * (this.phase === 'bite' ? 2.4 : 0.6) + i / 4) % 1;
      ring.position.copy(this.position);
      ring.position.y += 0.03;
      if (this.phase === 'approach') {
        const distance = this.remaining * 1.1;
        ring.position.x += Math.cos(this.clock * 2) * distance;
        ring.position.z += Math.sin(this.clock * 2) * distance;
      }
      ring.scale.setScalar(0.12 + t * (this.phase === 'bite' ? 0.95 : 0.45));
      ring.material.opacity = (1 - t) * 0.6;
    });
    this.splash.visible = floating && this.splashAge < 0.7;
    if (this.splash.visible) {
      for (let i = 0; i < 12; i++) {
        const t = this.splashAge,
          a = (i * Math.PI) / 6;
        this.dummy.position.set(
          this.position.x + Math.cos(a) * t,
          this.position.y + Math.max(0, t * (1.4 + (i % 3) * 0.3) - 3 * t * t),
          this.position.z + Math.sin(a) * t,
        );
        this.dummy.updateMatrix();
        this.splash.setMatrixAt(i, this.dummy.matrix);
      }
      this.splash.instanceMatrix.needsUpdate = true;
    }
    if (this.prize) {
      this.prize.position.copy(this.bobber.position);
      this.prize.position.y += 0.3;
      this.prize.quaternion.copy(camera.quaternion);
    }
  }
}
