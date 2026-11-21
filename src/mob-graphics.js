import * as THREE from 'three';
import { MOBS } from './mob-data.js';
import { createNetherMob } from './nether-mob-graphics.js';
import { MobRig, skinBox, skinTile, animateRig } from './mob-skins.js';
import { createEnderman } from './enderman-graphics.js';
import { createShulker } from './shulker-graphics.js';
import { createBat } from './bat-graphics.js';

import { pastureAnimal } from './field-models.js';
const full = skinTile();
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function biped(kind, rig, skin) {
  const bone = !!MOBS[kind].arrow,
    crawler = kind === 'crawler';
  const width = bone ? 2 : 4;
  const head = rig.joint(0, crawler ? 20 : 24, crawler ? -2 : 0);
  const reach = crawler ? 10 : 12;
  rig.box([8, 8, 8], [0, 4, 0], skin, crawler ? full : [0, 0], head);
  if (kind === 'zombie')
    rig.box([8.5, 8.5, 8.5], [0, 4, 0], skin, skinBox(32, 0, 8, 8, 8), head);
  rig.box(
    [8, crawler ? 10 : 12, 4],
    [0, crawler ? 15 : 18, 0],
    skin,
    crawler ? full : [16, 16],
  );
  const legs = [],
    arms = [];
  for (const side of [-1, 1]) {
    legs.push(
      rig.limb(
        side * (crawler ? 2.5 : 2),
        reach,
        0,
        [width, reach, width],
        skin,
        crawler ? full : [0, 16],
      ),
    );
    arms.push(
      rig.limb(
        side * (4 + width / 2),
        crawler ? 19 : 23,
        0,
        [width, crawler ? 15 : 12, width],
        skin,
        crawler ? full : [40, 16],
      ),
    );
  }
  if (crawler) {
    const light = rig.material(null, '#98ece4', true);
    for (const side of [-1, 1]) {
      rig.box([2, 1, 0.5], [side * 2, 4, -4], light, [0, 0], head);
      rig.box([2, 3, 2], [side * 3, 8.5, 0.5], skin, full, head);
      rig.box([1, 2, 1], [side * 3.5, 10.5, 0.5], light, [0, 0], head);
      rig.box([2, 1, 0.5], [side * 2, 14.5, -2], light);
    }
    rig.box([5, 1, 1], [0, 17, -2], light);
  }
  if (kind === 'stray') {
    const cloth = rig.material('stray_cloth', '#d2dce0');
    rig.box([9, 1, 9], [0, 8, 0], cloth, full, head);
    for (const side of [-1, 1])
      rig.box([1, 7, 8.5], [side * 4, 4, 0.25], cloth, full, head);
    rig.box([8, 7, 1], [0, 4, 4], cloth, full, head);
    rig.box([9, 3, 5], [0, 22, 0], cloth, full);
    for (const [x, h] of [
      [-2.5, 8],
      [0, 6],
      [2.5, 9],
    ])
      rig.box([2.5, h, 1], [x, 21 - h / 2, 2.5], cloth, full);
  }
  let bow;
  if (bone) {
    bow = rig.joint(0, -11, 0, arms[0]);
    const wood = rig.material(null, '#795331'),
      string = rig.material(null, '#d7cfaf');
    rig.box([1.5, 5, 1.5], [0, 0, 0], wood, [0, 0], bow);
    for (const sign of [-1, 1]) {
      rig.box([1, 3, 1], [0, sign * 3.5, 1], wood, [0, 0], bow).rotation.x =
        sign * 0.52;
      rig.box([1, 2, 1], [0, sign * 5.4, 2.4], wood, [0, 0], bow).rotation.x =
        sign * 0.82;
    }
    rig.box([0.38, 11.5, 0.38], [0, 0, 3.05], string, [0, 0], bow);
  }
  return { head, legs, arms, bow };
}

function spider(rig, skin) {
  const head = rig.joint(0, 6, -6);
  const headUv = skinBox(32, 4, 8, 8, 8);
  rig.box([8, 8, 8], [0, 0, -2], skin, headUv, head);
  rig.box(
    [8.08, 8.08, 8.08],
    [0, 0, -2],
    rig.material('mobs_mc_spider_eyes', '#fff4df', true),
    headUv,
    head,
  );
  rig.box([6, 6, 6], [0, 6, 0], skin, [0, 0]);
  rig.box([10, 8, 12], [0, 6, 8], skin, [0, 12]);
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const leg = rig.joint(side * 2.5, 6, (i - 1.5) * 1.75);
      const legUv = skinBox(18, 0, 16, 2, 2);
      rig.box([8, 2, 2], [side * 4, 0, 0], skin, legUv, leg);
      const knee = rig.joint(side * 7.5, 0, 0, leg);
      knee.rotation.z = -side * 0.9;
      rig.box([9, 2, 2], [side * 4.25, 0, 0], skin, legUv, knee);
      leg.rotation.order = 'YXZ';
      leg.rotation.y = leg.userData.restY = side * (1.5 - i) * 0.45;
      leg.rotation.z = leg.userData.restZ = side * 0.13;
      legs.push(leg);
    }
  }
  return { head, legs };
}

function creeper(rig, skin) {
  const head = rig.joint(0, 18, 0);
  rig.box([8, 8, 8], [0, 4, 0], skin, full, head);
  rig.box([8, 12, 4], [0, 12, 0], skin, full);
  const ink = rig.material(null, '#203225');
  for (const side of [-1, 1]) {
    rig.box([2, 2, 0.15], [side * 2, 5, -4], ink, [0, 0], head);
    rig.box([1, 3, 0.15], [side * 1.5, 1.5, -4], ink, [0, 0], head);
  }
  rig.box([2, 3, 0.15], [0, 2.5, -4], ink, [0, 0], head);
  const legs = [];
  for (const z of [-3, 3])
    for (const x of [-2, 2])
      legs.push(rig.limb(x, 6, z, [4, 6, 4], skin, full));
  return { head, legs };
}

export function createMob(kind, textures) {
  if (kind === 'bat') return createBat();
  if (kind === 'shulker') return createShulker();
  if (kind === 'enderman') return createEnderman(textures);
  if (MOBS[kind].flying) return createNetherMob(kind, textures);
  const rig = new MobRig();
  let parts;
  if (kind === 'spider' || kind === 'caveSpider') {
    parts = spider(
      rig,
      rig.material(
        'mobs_mc_spider',
        kind === 'caveSpider' ? '#65b5bf' : '#ffffff',
      ),
    );
  } else if (kind === 'creeper') {
    parts = creeper(rig, rig.material('vl_stalker_default', '#90bf63'));
  } else if (['zombie', 'skeleton', 'stray', 'crawler'].includes(kind)) {
    const skin =
      kind === 'crawler'
        ? rig.material('mcl_blackstone_basalt_smooth', '#8ba8b3')
        : rig.material(
            'mobs_mc_' + (kind === 'stray' ? 'skeleton' : kind),
            kind === 'stray' ? '#b2cfdf' : '#ffffff',
          );
    parts = biped(kind, rig, skin);
  } else {
    parts = pastureAnimal(kind, rig, rig.material('mobs_mc_' + kind));
  }
  if (parts.legs.length === 4)
    parts.legs.forEach((leg, i) => {
      leg.userData.phase = i === 0 || i === 3 ? 0 : Math.PI;
    });
  const scale = MOBS[kind].scale || 1;
  const mesh = rig.finish({
    kind,
    headY: parts.head.position.y * scale,
    arms: [],
    wings: [],
    ...parts,
  });
  mesh.scale.setScalar(scale);
  return mesh;
}
export function animateMob(mob, dt, time, camera, aggressive, distanceMoved) {
  const data = mob.mesh.userData,
    p = mob.mesh.position;
  const dx = camera.position.x - p.x,
    dz = camera.position.z - p.z,
    distance = Math.hypot(dx, dz);
  if (data.neck) {
    data.head.position.y = THREE.MathUtils.damp(
      data.head.position.y,
      (data.headY / (MOBS[mob.kind].scale || 1)) * (mob.grazing ? 0.35 : 1),
      9,
      dt,
    );
    // Extend the narrow neck from the chest to the moving head while grazing.
    const drop = data.neck.position.y - data.head.position.y;
    data.neck.scale.y = Math.max(0.1, (drop + 0.06) / 0.5);
  }
  const look = mob.grazing
    ? { yaw: 0, pitch: -0.9 + Math.sin(time * 13) * 0.08 }
    : distance < 7 || aggressive
      ? {
          yaw: THREE.MathUtils.clamp(
            wrap(Math.atan2(dx, dz) + Math.PI - mob.mesh.rotation.y),
            -0.65,
            0.65,
          ),
          pitch: THREE.MathUtils.clamp(
            Math.atan2(
              camera.position.y - p.y - data.headY * (mob.baby ? 0.55 : 1),
              distance,
            ),
            -0.35,
            0.4,
          ),
        }
      : null;
  if (mob.kind === 'chicken' && !look && distanceMoved < 0.001) {
    data.head.rotation.x =
      Math.min(0, Math.sin(time * 1.8 + mob.id) - 0.55) * 0.25;
  }
  const { phase, weight } = animateRig(
    mob.mesh,
    dt,
    time,
    distanceMoved,
    look,
    mob.hit,
    mob.baby > 0,
  );
  if (data.tail)
    data.tail.rotation.z = Math.sin(time * 3 + mob.id) * (0.11 + weight * 0.1);
  data.body.rotation.z =
    mob.kind === 'skeleton' && mob.conversion >= 7
      ? Math.sin(time * 35) * 0.025
      : 0;
  data.arms.forEach((arm, i) => {
    const target = MOBS[mob.kind].arrow
      ? 1.18
      : aggressive
        ? 1.35
        : Math.sin(phase + i * Math.PI) * 0.2 * weight;
    arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, target, 8, dt);
  });
  if (data.bow) data.bow.rotation.x = -data.arms[0].rotation.x;
  data.wings.forEach((wing) => {
    wing.rotation.z =
      wing.userData.side *
      (0.08 +
        Math.sin(time * (mob.flee > 0 ? 18 : 5)) * (mob.flee > 0 ? 0.7 : 0.12));
  });
  if (mob.kind === 'spider' || mob.kind === 'caveSpider')
    data.legs.forEach((leg, i) => {
      const side = i < 4 ? -1 : 1;
      leg.rotation.x = 0;
      leg.rotation.y =
        leg.userData.restY +
        side * Math.sin(phase + ((i % 4) * Math.PI) / 2) * weight * 0.27;
      leg.rotation.z =
        leg.userData.restZ +
        Math.cos(phase + i * Math.PI * 0.5) * weight * 0.12;
    });
}
export function disposeMob(mesh) {
  const materials = new Set();
  mesh.traverse((o) => {
    o.geometry?.dispose();
    if (o.material)
      for (const material of Array.isArray(o.material)
        ? o.material
        : [o.material])
        materials.add(material);
  });
  for (const material of materials) material.dispose();
  mesh.removeFromParent();
}
