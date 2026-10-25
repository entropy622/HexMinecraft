import * as THREE from 'three';
import { axialToWorld, worldToAxial } from './core.js';
import { END_FLOOR, END_PILLARS, newDragonFight } from './end-data.js';
import {
  createDragon,
  createEndCrystal,
  animateDragon,
} from './dragon-graphics.js';
import { disposeMob } from './mob-graphics.js';

export class DragonFight {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.actors = [];
    this.orbs = [];
    this.clouds = [];
    this.clock = 0;
    this.orbGeometry = new THREE.SphereGeometry(0.28, 6, 4);
    this.orbMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#d185fb').multiplyScalar(1.8),
    });
    this.cloudGeometry = new THREE.CylinderGeometry(1, 1, 0.08, 6);
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      color: '#bf79ed',
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.beamGeometry = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: '#d1a0f4',
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.beams = Array.from({ length: 6 }, () => {
      const mesh = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    });
  }
  clearAttacks() {
    for (const record of [...this.orbs, ...this.clouds])
      record.mesh.removeFromParent();
    this.orbs.length = this.clouds.length = 0;
  }
  load(world, state) {
    for (const actor of this.actors) disposeMob(actor.mesh);
    this.actors = [];
    this.clearAttacks();
    this.beams.forEach((beam) => (beam.visible = false));
    this.world = world;
    this.state =
      world.dimension === 'end'
        ? structuredClone(state || newDragonFight())
        : null;
    this.active = false;
    this.hitTime =
      this.damageTimer =
      this.healTimer =
      this.breathTimer =
      this.contactTimer =
        0;
    this.healer = -1;
    this.phase = 'orbit';
    this.phaseTimer = 14;
    this.angle = 0;
    if (!this.state) return;
    const mesh = createDragon();
    mesh.position.set(21, END_FLOOR + 20, 0);
    mesh.visible = ['fight', 'dying'].includes(this.state.mode);
    this.scene.add(mesh);
    this.dragon = {
      kind: 'dragon',
      bossType: 'dragon',
      mesh,
      hp: this.state.hp,
      hitboxes: () => this.dragonBoxes(),
    };
    mesh.userData.bossActor = this.dragon;
    this.actors.push(this.dragon);
    this.crystals = END_PILLARS.map((p, index) => {
      const mesh = createEndCrystal(),
        point = axialToWorld(p.q, p.r);
      mesh.position.set(point.x, END_FLOOR + p.height + 2, point.z);
      mesh.visible = !this.state.broken[index];
      this.scene.add(mesh);
      const actor = {
        kind: 'endCrystal',
        bossType: 'crystal',
        index,
        mesh,
        hp: 1,
        hitboxes: () => [
          { center: mesh.position.clone(), radius: 0.85, part: 'crystal' },
        ],
      };
      mesh.userData.bossActor = actor;
      this.actors.push(actor);
      return actor;
    });
  }
  serialize() {
    return this.state ? structuredClone(this.state) : undefined;
  }
  get combatants() {
    return this.actors.filter((a) => a.mesh.visible);
  }
  dragonBoxes() {
    const mesh = this.dragon.mesh;
    mesh.updateWorldMatrix(true, true);
    return [
      {
        center: mesh.userData.head
          .getWorldPosition(new THREE.Vector3())
          .add(new THREE.Vector3(0, 0.1, 0)),
        radius: 0.95,
        part: 'head',
      },
      { center: mesh.position.clone(), radius: 1.55, part: 'body' },
      ...mesh.userData.wings.map((wing) => ({
        center: wing.localToWorld(new THREE.Vector3(3, 0, 1.5)),
        radius: 1.7,
        part: 'body',
      })),
      ...mesh.userData.tails.slice(0, 4).map((tail) => ({
        center: tail.getWorldPosition(new THREE.Vector3()),
        radius: 0.65,
        part: 'body',
      })),
    ];
  }
  partOf(object) {
    while (object) {
      if (object.userData.dragonPart) return object.userData.dragonPart;
      if (object.userData.bossActor)
        return object.userData.bossActor.bossType === 'crystal'
          ? 'crystal'
          : 'body';
      object = object.parent;
    }
    return 'body';
  }
  target(camera, limit = 4.5) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(), camera);
    const hit = ray
      .intersectObjects(
        this.combatants.map((a) => a.mesh),
        true,
      )
      .find((h) => h.distance <= limit);
    if (!hit) return null;
    let root = hit.object;
    while (root && !root.userData.bossActor) root = root.parent;
    return root
      ? {
          actor: root.userData.bossActor,
          part: this.partOf(hit.object),
          distance: hit.distance,
        }
      : null;
  }
  damageDragon(amount) {
    if (this.state.mode !== 'fight') return;
    this.state.hp = Math.max(0, this.state.hp - amount);
    this.dragon.hp = this.state.hp;
    this.hitTime = 0.25;
    if (this.state.hp <= 0) {
      this.state.mode = 'dying';
      this.state.timer = 12;
      this.clearAttacks();
      this.callbacks.sound('dragonDeath');
      this.callbacks.notice('末影龙失去了力量，天空开始崩解……');
    }
  }
  hit(actor, amount, source, part = 'body') {
    if (!this.state || !actor.mesh.visible) return 'immune';
    if (actor.bossType === 'crystal') {
      if (this.state.broken[actor.index]) return 'immune';
      this.state.broken[actor.index] = true;
      actor.mesh.visible = false;
      if (this.healer === actor.index) {
        this.healer = -1;
        this.damageDragon(10);
      }
      this.callbacks.blast(actor.mesh.position.clone());
      this.callbacks.notice(
        `末地水晶已摧毁 · 剩余 ${this.state.broken.filter((b) => !b).length} / 6`,
      );
      this.callbacks.save();
      return 'hit';
    }
    if (this.state.mode !== 'fight') return 'immune';
    if (source === 'arrow' && this.phase === 'perch') return 'dodged';
    if (this.damageTimer > 0) return 'immune';
    this.damageTimer = 0.35;
    this.damageDragon(amount * (part === 'head' ? 1 : 0.25));
    this.callbacks.sound('dragonHurt');
    return 'hit';
  }
  summon(camera) {
    if (
      !this.state ||
      this.state.mode !== 'dead' ||
      Math.hypot(camera.position.x, camera.position.z) > 6
    )
      return false;
    this.state.hp = this.dragon.hp = 200;
    this.state.broken.fill(false);
    this.state.mode = 'summon';
    this.state.timer = 15;
    this.phase = 'orbit';
    this.phaseTimer = 14;
    this.clearAttacks();
    this.callbacks.rebuild();
    this.callbacks.sound('dragonSummon');
    this.callbacks.notice('六座晶柱再次共鸣，末影龙将在十五秒后归来。');
    return true;
  }
  clearPath(from, to) {
    const length = from.distanceTo(to),
      steps = Math.ceil(length / 0.25);
    for (let i = 1; i < steps; i++) {
      const p = from.clone().lerp(to, i / steps);
      if (this.world.pointSolid(p.x, p.y, p.z)) return false;
    }
    return true;
  }
  shootBreath(target) {
    if (this.orbs.length >= 8) return;
    const from = this.dragon.mesh.userData.head.getWorldPosition(
      new THREE.Vector3(),
    );
    const mesh = new THREE.Mesh(this.orbGeometry, this.orbMaterial);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.orbs.push({
      mesh,
      velocity: target.clone().sub(from).normalize().multiplyScalar(9),
      life: 7,
    });
    this.callbacks.sound('dragonBreath');
  }
  cloud(point) {
    if (this.clouds.length >= 6) this.clouds.shift().mesh.removeFromParent();
    const floor = this.world.groundAt(
      point.x,
      point.z,
      point.y - 12,
      point.y + 1,
    );
    if (floor === null) return;
    const mesh = new THREE.Mesh(this.cloudGeometry, this.cloudMaterial);
    mesh.position.set(point.x, floor + 0.06, point.z);
    this.scene.add(mesh);
    this.clouds.push({ mesh, life: 8, hurt: 0, mote: 0 });
  }
  updateAttacks(dt, camera, creative) {
    for (const orb of [...this.orbs]) {
      orb.life -= dt;
      let remove = orb.life <= 0;
      const steps = Math.max(1, Math.ceil((orb.velocity.length() * dt) / 0.14));
      for (let i = 0; i < steps && !remove; i++) {
        orb.mesh.position.addScaledVector(orb.velocity, dt / steps);
        const p = orb.mesh.position,
          a = worldToAxial(p.x, p.z);
        if (!this.world.loaded(a.q, a.r) || p.y < 0 || p.y > 90) {
          remove = true;
          break;
        }
        if (
          this.world.pointSolid(p.x, p.y, p.z) ||
          (!creative &&
            p.distanceTo(
              camera.position.clone().add(new THREE.Vector3(0, -0.7, 0)),
            ) < 0.65)
        ) {
          this.cloud(p);
          remove = true;
        }
      }
      if (remove) {
        orb.mesh.removeFromParent();
        this.orbs.splice(this.orbs.indexOf(orb), 1);
      } else this.callbacks.mote(orb.mesh.position, 1);
    }
    for (const cloud of [...this.clouds]) {
      if (!this.clouds.includes(cloud)) continue;
      cloud.life -= dt;
      cloud.hurt -= dt;
      cloud.mote -= dt;
      const radius = Math.min(2.6, (8 - cloud.life) * 1.8 + 0.4);
      cloud.mesh.scale.set(radius, 1, radius);
      cloud.mesh.rotation.y += dt * 0.15;
      if (cloud.mote <= 0) {
        cloud.mote = 0.12;
        const p = cloud.mesh.position.clone();
        p.x += (Math.random() - 0.5) * radius * 1.6;
        p.z += (Math.random() - 0.5) * radius * 1.6;
        p.y += Math.random() * 1.2;
        this.callbacks.mote(p, 1);
      }
      if (
        !creative &&
        cloud.hurt <= 0 &&
        Math.hypot(
          camera.position.x - cloud.mesh.position.x,
          camera.position.z - cloud.mesh.position.z,
        ) < radius &&
        Math.abs(camera.position.y - 1.65 - cloud.mesh.position.y) < 1.7 &&
        this.clearPath(
          cloud.mesh.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
          camera.position.clone().add(new THREE.Vector3(0, -0.6, 0)),
        )
      ) {
        cloud.hurt = 1;
        this.callbacks.hurt(3, null, 'dragonBreath');
      }
      if (cloud.life <= 0) {
        cloud.mesh.removeFromParent();
        this.clouds.splice(this.clouds.indexOf(cloud), 1);
      }
    }
  }
  update(dt, camera, creative) {
    if (!this.state) {
      this.active = false;
      return;
    }
    this.active = Math.hypot(camera.position.x, camera.position.z) < 70;
    for (const actor of this.crystals) {
      const p = END_PILLARS[actor.index];
      actor.mesh.visible =
        this.active &&
        !this.state.broken[actor.index] &&
        this.world.loaded(p.q, p.r);
    }
    this.dragon.mesh.visible =
      this.active && !['dead', 'summon'].includes(this.state.mode);
    for (const record of [...this.orbs, ...this.clouds])
      record.mesh.visible = this.active;
    if (!this.active) {
      this.beams.forEach((beam) => (beam.visible = false));
      return;
    }
    this.clock += dt;
    this.hitTime = Math.max(0, this.hitTime - dt);
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    for (const actor of this.crystals) {
      actor.mesh.userData.cage.rotation.y = this.clock * 0.8;
      actor.mesh.userData.cage.rotation.x = Math.sin(this.clock * 0.8) * 0.2;
      actor.mesh.userData.cage.position.y =
        Math.sin(this.clock * 2 + actor.index) * 0.15;
    }
    const mesh = this.dragon.mesh;
    if (this.state.mode === 'summon') {
      this.state.timer = Math.max(0, this.state.timer - dt);
      if (!this.state.timer) {
        this.state.mode = 'fight';
        mesh.position.set(20, END_FLOOR + 20, 0);
        this.callbacks.sound('dragonRoar');
        this.callbacks.save();
      }
    } else if (this.state.mode === 'dying') {
      this.state.timer = Math.max(0, this.state.timer - dt);
      mesh.position.y += dt * 0.9;
      this.callbacks.mote(
        mesh.position
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 5,
              0,
              (Math.random() - 0.5) * 5,
            ),
          ),
        3,
      );
      if (!this.state.timer) {
        const first = this.state.victories === 0;
        this.state.mode = 'dead';
        this.state.victories++;
        mesh.visible = false;
        this.callbacks.victory(first);
      }
    } else if (this.state.mode === 'fight')
      this.updateDragon(dt, camera, creative);
    this.updateAttacks(dt, camera, creative);
    animateDragon(
      mesh,
      this.clock,
      this.phase === 'perch',
      this.breathTimer < 0.6,
      this.hitTime,
    );
    mesh.updateWorldMatrix(true, true);
    for (let i = 0; i < 6; i++) {
      const beam = this.beams[i],
        from = this.crystals[i].mesh.position;
      beam.visible =
        this.crystals[i].mesh.visible &&
        (this.state.mode === 'summon' ||
          (this.state.mode === 'fight' && this.healer === i));
      if (!beam.visible) continue;
      const to =
        this.state.mode === 'summon'
          ? new THREE.Vector3(0, END_FLOOR + 20, 0)
          : mesh.position;
      const direction = to.clone().sub(from);
      beam.position.copy(from).add(to).multiplyScalar(0.5);
      beam.scale.y = direction.length();
      beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
    }
  }
  updateDragon(dt, camera, creative) {
    const mesh = this.dragon.mesh;
    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      this.phase = {
        orbit: 'strafe',
        strafe: 'land',
        land: 'perch',
        perch: 'takeoff',
        takeoff: 'orbit',
      }[this.phase];
      this.phaseTimer = {
        orbit: 16,
        strafe: 6,
        land: 5,
        perch: 12,
        takeoff: 4,
      }[this.phase];
      if (this.phase === 'strafe') {
        const direction = camera.position
          .clone()
          .sub(mesh.position)
          .setY(0)
          .normalize();
        this.strafeGoal = camera.position
          .clone()
          .addScaledVector(direction, 12);
        this.strafeGoal.y = Math.max(END_FLOOR + 3, camera.position.y + 1);
        if (!creative) this.callbacks.sound('dragonRoar');
      }
    }
    this.angle += dt * 0.32;
    const goal =
      this.phase === 'orbit'
        ? new THREE.Vector3(
            Math.cos(this.angle) * 21,
            END_FLOOR + 20 + Math.sin(this.clock * 0.4) * 2,
            Math.sin(this.angle) * 21,
          )
        : this.phase === 'strafe'
          ? this.strafeGoal
          : this.phase === 'takeoff'
            ? new THREE.Vector3(0, END_FLOOR + 22, 0)
            : new THREE.Vector3(0, END_FLOOR + 1.7, 0);
    const delta = goal.clone().sub(mesh.position),
      length = delta.length();
    if (length > 0.02)
      mesh.position.addScaledVector(
        delta,
        Math.min(1, (dt * (this.phase === 'strafe' ? 14 : 9)) / length),
      );
    const facing =
      this.phase === 'perch'
        ? camera.position.clone().sub(mesh.position)
        : delta;
    if (Math.hypot(facing.x, facing.z) > 0.01) {
      const angle = Math.atan2(-facing.x, -facing.z) - mesh.rotation.y;
      mesh.rotation.y +=
        Math.atan2(Math.sin(angle), Math.cos(angle)) * Math.min(1, dt * 2.5);
    }
    this.healTimer -= dt;
    if (this.healTimer <= 0) {
      this.healTimer = 0.5;
      this.healer = -1;
      let nearest = 38;
      this.crystals.forEach((actor, i) => {
        const distance = actor.mesh.position.distanceTo(mesh.position);
        if (
          actor.mesh.visible &&
          distance < nearest &&
          this.clearPath(actor.mesh.position, mesh.position)
        ) {
          nearest = distance;
          this.healer = i;
        }
      });
      if (this.healer >= 0) this.state.hp = Math.min(200, this.state.hp + 1);
      this.dragon.hp = this.state.hp;
    }
    mesh.updateWorldMatrix(true, true);
    this.breathTimer -= dt;
    if (
      !creative &&
      ['strafe', 'perch'].includes(this.phase) &&
      this.breathTimer <= 0
    ) {
      this.breathTimer = this.phase === 'perch' ? 2.8 : 3.5;
      this.shootBreath(
        camera.position.clone().add(new THREE.Vector3(0, -0.9, 0)),
      );
    }
    this.contactTimer -= dt;
    if (
      !creative &&
      this.contactTimer <= 0 &&
      this.dragonBoxes().some(
        (box) =>
          box.part === 'head' && box.center.distanceTo(camera.position) < 2,
      )
    ) {
      this.contactTimer = 1;
      this.callbacks.hurt(8, mesh.position.clone(), 'combat');
    }
  }
  get label() {
    return this.state?.mode === 'dying'
      ? '末影龙 · 消逝'
      : this.state?.mode === 'dead'
        ? '末影龙已被击败'
        : this.state?.mode === 'summon'
          ? `晶柱共鸣 · ${Math.ceil(this.state.timer)} 秒`
          : `末影龙 · ${{ orbit: '盘旋', strafe: '冲袭', land: '降落', perch: '栖息 · 近战攻击头部', takeoff: '升空' }[this.phase]}`;
  }
}
