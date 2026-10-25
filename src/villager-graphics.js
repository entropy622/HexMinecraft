import * as THREE from 'three';
import { MobRig, skinBox, skinTile, animateRig } from './mob-skins.js';

export function createVillager(role) {
  const rig = new MobRig();
  const file = {
    farmer: 'farmer',
    fisher: 'fisherman',
    smith: 'smith',
    merchant: 'librarian',
  }[role];
  const clothes = rig.material(
      file ? 'mobs_mc_villager_' + file : 'mobs_mc_villager',
    ),
    skin = rig.material('mobs_mc_villager');
  const head = rig.pivot(0, 1.52, 0),
    legs = [];
  rig.part(
    0.65,
    0.88,
    0.4,
    skinBox(0, 38, 8, 18, 6),
    clothes,
    0,
    0.87,
    0,
    rig.body,
    0.8,
  );
  rig.panel(0.3, 0.57, [22, 26, 8, 12], clothes, 0, 0.94, -0.205);
  rig.part(0.53, 0.54, 0.44, skinBox(0, 0, 8, 10, 8), skin, 0, 0, 0, head);
  rig.part(
    0.13,
    0.23,
    0.18,
    skinBox(24, 0, 2, 4, 2),
    skin,
    0,
    -0.035,
    -0.29,
    head,
  );
  const folded = rig.pivot(0, 1.05, -0.25);
  for (const side of [-1, 1])
    rig.part(
      0.3,
      0.16,
      0.2,
      skinBox(40, 22, 4, 12, 4),
      clothes,
      side * 0.13,
      0,
      0,
      folded,
    );
  rig.part(
    0.15,
    0.13,
    0.22,
    skinBox(24, 0, 2, 4, 2),
    skin,
    -0.08,
    0.01,
    -0.015,
    folded,
  );
  for (const x of [-0.15, 0.15]) {
    const pivot = rig.pivot(x, 0.47, 0);
    rig.part(
      0.17,
      0.43,
      0.21,
      skinBox(0, 22, 4, 12, 4),
      clothes,
      0,
      -0.215,
      0,
      pivot,
    );
    legs.push(pivot);
  }
  if (role === 'farmer' || role === 'fisher') {
    const straw = rig.material('default_wood', '#e1c16e');
    rig.part(0.76, 0.065, 0.65, skinTile(), straw, 0, 0.31, 0, head);
    rig.part(0.44, 0.16, 0.38, skinTile(), straw, 0, 0.395, 0, head, 0.9);
  }
  return rig.finish({ head, headY: 1.52, legs, folded });
}
export function animateVillager(resident, dt, time, camera, moved) {
  const mesh = resident.mesh,
    p = mesh.position;
  const dx = camera.position.x - p.x,
    dz = camera.position.z - p.z,
    distance = Math.hypot(dx, dz);
  const difference = Math.atan2(dx, dz) + Math.PI - mesh.rotation.y;
  const look =
    distance < 6
      ? {
          yaw: THREE.MathUtils.clamp(
            Math.atan2(Math.sin(difference), Math.cos(difference)),
            -0.55,
            0.55,
          ),
          pitch: THREE.MathUtils.clamp(
            Math.atan2(camera.position.y - p.y - 1.52, distance),
            -0.25,
            0.3,
          ),
        }
      : null;
  animateRig(mesh, dt, time, moved, look);
}
