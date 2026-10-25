import * as THREE from 'three';
import { MOBS } from './mob-data.js';
import { createNetherMob } from './nether-mob-graphics.js';
import { MobRig, skinBox, skinTile, animateRig } from './mob-skins.js';
import { createEnderman } from './enderman-graphics.js';
import { createShulker } from './shulker-graphics.js';

const full = skinTile();
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
export function createMob(kind, textures) {
  if (kind === 'shulker') return createShulker();
  if (kind === 'enderman') return createEnderman(textures);
  if (MOBS[kind].flying) return createNetherMob(kind, textures);
  const rig = new MobRig(),
    legs = [],
    arms = [],
    wings = [];
  const file =
    kind === 'creeper'
      ? 'vl_stalker_default'
      : kind === 'crawler'
        ? null
        : 'mobs_mc_' + kind;
  const skin = rig.material(
    file,
    kind === 'creeper' ? '#b7e780' : kind === 'crawler' ? '#334852' : '#ffffff',
  );
  const plain = rig.material(null, '#39352e'),
    cream = rig.material(null, '#d8c397');
  let head,
    wool = null,
    headY = 1;
  const limb = (
    x,
    y,
    z,
    w,
    length,
    d,
    uv,
    parent = rig.body,
    material = skin,
  ) => {
    const pivot = rig.pivot(x, y, z, parent);
    rig.part(w, length, d, uv, material, 0, -length / 2, 0, pivot);
    return pivot;
  };
  if (['zombie', 'skeleton', 'crawler'].includes(kind)) {
    const bone = kind === 'skeleton',
      alien = kind === 'crawler',
      scale = alien ? 0.78 : 1;
    const uv = (x, y, w, h, d) => (alien ? full : skinBox(x, y, w, h, d));
    rig.part(
      (bone ? 0.33 : 0.53) * scale,
      0.72 * scale,
      0.29 * scale,
      uv(16, 16, 8, 12, 4),
      skin,
      0,
      1.1 * scale,
      0,
    );
    headY = 1.67 * scale;
    head = rig.pivot(0, headY, 0);
    rig.part(
      0.56 * scale,
      0.48 * scale,
      0.48 * scale,
      uv(0, 0, 8, 8, 8),
      skin,
      0,
      0,
      0,
      head,
    );
    for (const x of [-0.14, 0.14])
      legs.push(
        limb(
          x * scale,
          0.76 * scale,
          0,
          (bone ? 0.075 : 0.19) * scale,
          0.74 * scale,
          0.22 * scale,
          uv(0, 16, bone ? 2 : 4, 12, bone ? 2 : 4),
        ),
      );
    for (const x of bone ? [-0.22, 0.22] : [-0.36, 0.36])
      arms.push(
        limb(
          x * scale,
          1.43 * scale,
          0,
          (bone ? 0.07 : 0.17) * scale,
          0.67 * scale,
          0.2 * scale,
          uv(40, 16, bone ? 2 : 4, 12, bone ? 2 : 4),
        ),
      );
    if (alien) {
      const glow = rig.material(null, '#b4e9e3', true);
      glow.color.multiplyScalar(1.6);
      for (const x of [-0.11, 0.11])
        rig.solid(
          0.11,
          0.035,
          0.025,
          glow,
          x * scale,
          0.06 * scale,
          -0.25 * scale,
          head,
        );
    }
    if (bone) {
      const bow = rig.pivot(0, -0.6, -0.08, arms[0]);
      const wood = rig.material(null, '#987047');
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(0.25, 0.025, 4, 8, Math.PI),
        wood,
      );
      arc.rotation.z = -Math.PI / 2;
      bow.add(arc);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, -0.25, 0),
          new THREE.Vector3(0, 0.25, 0),
        ]),
        new THREE.LineBasicMaterial({ color: '#d8d0ae' }),
      );
      bow.add(line);
    }
  } else if (kind === 'spider') {
    rig.part(0.82, 0.4, 0.93, skinBox(0, 12, 16, 8, 12), skin, 0, 0.42, 0.3);
    rig.part(0.51, 0.3, 0.45, skinBox(0, 0, 10, 8, 12), skin, 0, 0.42, -0.17);
    headY = 0.45;
    head = rig.pivot(0, headY, -0.52);
    const headUV = skinBox(32, 4, 8, 8, 8);
    rig.part(0.52, 0.34, 0.45, headUV, skin, 0, 0, 0, head);
    const eyes = rig.material('mobs_mc_spider_eyes', '#ffffff', true);
    eyes.color.multiplyScalar(1.8);
    rig.part(0.527, 0.347, 0.457, headUV, eyes, 0, 0, 0, head);
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const leg = limb(
          side * 0.28,
          0.4,
          (i - 1.5) * 0.22,
          0.065,
          0.4,
          0.07,
          skinBox(18, 0, 2, 16, 2),
        );
        leg.rotation.z = side * 1.3;
        leg.userData.restZ = leg.rotation.z;
        const knee = limb(
          0,
          -0.4,
          0,
          0.055,
          0.32,
          0.06,
          skinBox(18, 0, 2, 16, 2),
          leg,
        );
        knee.rotation.z = -side * 0.65;
        legs.push(leg);
      }
  } else if (kind === 'creeper') {
    rig.part(0.45, 0.8, 0.35, full, skin, 0, 0.82, 0);
    headY = 1.42;
    head = rig.pivot(0, headY, 0);
    rig.part(0.62, 0.47, 0.48, full, skin, 0, 0, 0, head);
    for (const x of [-0.13, 0.13])
      rig.solid(0.11, 0.11, 0.025, plain, x, 0.085, -0.25, head);
    rig.solid(0.09, 0.13, 0.025, plain, 0, -0.025, -0.25, head);
    rig.solid(0.25, 0.07, 0.025, plain, 0, -0.09, -0.25, head);
    for (const x of [-0.09, 0.09])
      rig.solid(0.07, 0.11, 0.025, plain, x, -0.145, -0.25, head);
    for (const z of [-0.17, 0.17])
      for (const x of [-0.18, 0.18])
        legs.push(limb(x, 0.35, z, 0.21, 0.33, 0.25, full));
  } else if (kind === 'chicken') {
    rig.part(0.48, 0.43, 0.58, skinBox(0, 9, 6, 8, 6), skin, 0, 0.46, 0.04);
    headY = 0.72;
    head = rig.pivot(0, headY, -0.24);
    rig.part(0.26, 0.34, 0.25, skinBox(0, 0, 4, 6, 3), skin, 0, 0, 0, head);
    rig.part(
      0.21,
      0.1,
      0.16,
      skinBox(14, 0, 4, 2, 2),
      skin,
      0,
      -0.035,
      -0.18,
      head,
    );
    rig.part(
      0.1,
      0.12,
      0.08,
      skinBox(14, 4, 2, 2, 2),
      skin,
      0,
      -0.15,
      -0.15,
      head,
    );
    for (const x of [-0.12, 0.12])
      legs.push(limb(x, 0.27, 0, 0.055, 0.25, 0.07, skinBox(26, 0, 3, 5, 3)));
    for (const side of [-1, 1]) {
      const wing = rig.pivot(side * 0.25, 0.59, 0.04);
      rig.part(
        0.07,
        0.28,
        0.42,
        skinBox(24, 13, 1, 4, 6),
        skin,
        side * 0.02,
        -0.14,
        0,
        wing,
      );
      wing.userData.side = side;
      wings.push(wing);
    }
  } else {
    const cow = kind === 'cow',
      sheep = kind === 'sheep';
    const bodyUV = cow
      ? skinBox(18, 4, 12, 18, 10)
      : sheep
        ? skinBox(28, 8, 8, 16, 6)
        : skinBox(28, 8, 10, 16, 8);
    rig.part(
      cow ? 0.86 : 0.68,
      cow ? 0.74 : 0.6,
      cow ? 1.18 : 1.0,
      bodyUV,
      skin,
      0,
      cow ? 0.85 : 0.68,
      0.06,
    );
    headY = cow ? 1.12 : sheep ? 0.94 : 0.75;
    head = rig.pivot(0, headY, cow ? -0.62 : -0.49);
    const headUV = cow
      ? skinBox(0, 0, 8, 8, 6)
      : sheep
        ? skinBox(0, 0, 6, 6, 8)
        : skinBox(0, 0, 8, 8, 8);
    rig.part(
      cow ? 0.46 : 0.38,
      cow ? 0.47 : 0.38,
      0.42,
      headUV,
      skin,
      0,
      0,
      0,
      head,
    );
    if (cow) {
      for (const side of [-1, 1]) {
        rig.part(
          0.065,
          0.19,
          0.075,
          skinTile([22, 0, 2, 4]),
          cream,
          side * 0.18,
          0.29,
          0.01,
          head,
        );
        rig.part(
          0.15,
          0.05,
          0.14,
          skinTile([0, 6, 6, 8]),
          skin,
          side * 0.27,
          0.1,
          -0.02,
          head,
        );
      }
    }
    if (kind === 'pig')
      rig.part(
        0.22,
        0.15,
        0.13,
        skinBox(16, 16, 4, 3, 1),
        skin,
        0,
        -0.06,
        -0.25,
        head,
      );
    for (const z of [-0.29, 0.32])
      for (const x of [-0.22, 0.22])
        legs.push(
          limb(
            x,
            cow ? 0.53 : 0.43,
            z,
            0.13,
            cow ? 0.51 : 0.41,
            0.15,
            skinBox(0, 16, 4, kind === 'pig' ? 6 : 12, 4),
          ),
        );
    if (sheep) {
      wool = rig.pivot(0, 0, 0);
      const coat = rig.material('mobs_mc_sheep_fur');
      rig.part(0.93, 0.78, 1.13, bodyUV, coat, 0, 0.72, 0.06, wool);
    }
  }
  if (legs.length === 4)
    legs.forEach((leg, i) => {
      leg.userData.phase = i === 0 || i === 3 ? 0 : Math.PI;
    });
  return rig.finish({ kind, head, headY, legs, arms, wings, wool });
}
export function animateMob(mob, dt, time, camera, aggressive, distanceMoved) {
  const data = mob.mesh.userData,
    p = mob.mesh.position;
  const dx = camera.position.x - p.x,
    dz = camera.position.z - p.z,
    distance = Math.hypot(dx, dz);
  const look =
    distance < 7 || aggressive
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
  data.arms.forEach((arm, i) => {
    const target =
      mob.kind === 'skeleton'
        ? 1.18
        : aggressive
          ? 1.35
          : Math.sin(phase + i * Math.PI) * 0.2 * weight;
    arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, target, 8, dt);
  });
  data.wings.forEach((wing) => {
    wing.rotation.z =
      wing.userData.side *
      (0.08 +
        Math.sin(time * (mob.flee > 0 ? 18 : 5)) * (mob.flee > 0 ? 0.7 : 0.12));
  });
  if (mob.kind === 'spider')
    data.legs.forEach((leg, i) => {
      leg.rotation.x *= 0.35;
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
