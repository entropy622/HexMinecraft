import * as THREE from 'three';
import { MobRig, skinBox, skinTile, animateRig } from './mob-skins.js';

export function createVillager(role) {
  const rig = new MobRig();
  const file = {
    farmer: 'farmer',
    smith: 'smith',
    merchant: 'librarian',
    fisher: 'fisherman',
  }[role];
  const coat = rig.material(
    file ? 'mobs_mc_villager_' + file : 'mobs_mc_villager',
  );
  const head = rig.joint(0, 24, 0);
  rig.box([8, 10, 8], [0, 4, 0], coat, [0, 0], head);
  rig.box([2, 4, 2], [0, 1, -5], coat, [24, 0], head);
  const white = rig.material(null, '#ddd7bd');
  const iris = rig.material(null, '#46835f');
  for (const side of [-1, 1]) {
    rig.box([1, 1, 0.25], [side * 2.5, 3.5, -4], white, [0, 0], head);
    rig.box([1, 1, 0.25], [side * 1.5, 3.5, -4], iris, [0, 0], head);
  }
  rig.box([8, 12, 6], [0, 18, 0], coat, [16, 20]);
  rig.box([9, 18, 7], [0, 15, 0], coat, skinBox(0, 38, 8, 18, 6));
  const folded = rig.joint(0, 21, -2);
  for (const side of [-1, 1]) {
    rig.box(
      [4, 8, 4],
      [side * 5, -3, -0.7],
      coat,
      skinBox(44, 22, 4, 8, 4),
      folded,
    ).rotation.x = 0.67;
  }
  rig.box([8, 4, 4], [0, -5.5, -3.4], coat, skinBox(40, 38, 8, 4, 4), folded);
  const legs = [-2, 2].map((x) =>
    rig.limb(x, 12, 0, [4, 12, 4], coat, [0, 22]),
  );
  if (role === 'farmer' || role === 'fisher') {
    const straw = rig.material(
      'mcl_farming_hayblock_side',
      role === 'fisher' ? '#cab485' : '#ecd18b',
    );
    const band = rig.material(null, role === 'fisher' ? '#465f57' : '#93713e');
    const weave = skinTile([1, 4, 8, 8]);
    rig.box([13, 1, 12], [0, 9.5, 0], straw, weave, head);
    rig.box([8, 3, 8], [0, 11.5, 0], straw, weave, head);
    rig.box([8.2, 1, 8.2], [0, 10.5, 0], band, [0, 0], head);
    if (role === 'fisher') rig.box([3, 5, 2], [4, 9, 3], band, [0, 0], head);
  } else if (role === 'smith') {
    const leather = rig.material(null, '#594039'),
      steel = rig.material(null, '#949392');
    rig.box([7, 8, 1], [0, 14, -3.6], leather);
    rig.box([2, 2, 1], [0, 13, -4.2], steel);
  } else if (role === 'merchant') {
    const brass = rig.material(null, '#ab925a');
    for (const side of [-1, 1]) {
      rig.box([3, 0.55, 0.5], [side * 2, 4.5, -4.1], brass, [0, 0], head);
      rig.box([0.55, 1.5, 0.5], [side * 3.25, 3.9, -4.1], brass, [0, 0], head);
    }
  }
  return rig.finish({ head, headY: head.position.y, legs, folded });
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
