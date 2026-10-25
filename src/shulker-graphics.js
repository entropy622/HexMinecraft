import * as THREE from 'three';
import { MobRig, skinBox, animateRig } from './mob-skins.js';

export function createShulker() {
  const rig = new MobRig(),
    skin = rig.material('mobs_mc_shulker_purple');
  rig.part(1, 0.5, 1, skinBox(0, 28, 16, 8, 16), skin, 0, 0.25, 0);
  const lid = rig.pivot(0, 0.7, 0);
  rig.part(1.04, 0.6, 1.04, skinBox(0, 0, 16, 12, 16), skin, 0, 0, 0, lid);
  const head = rig.pivot(0, 0.75, 0);
  rig.part(0.375, 0.375, 0.375, skinBox(0, 52, 6, 6, 6), skin, 0, 0, 0, head);
  head.visible = false;
  return rig.finish({ kind: 'shulker', lid, head, legs: [] });
}

export function animateShulker(m, dt, time, camera) {
  const local = camera.position
    .clone()
    .sub(m.mesh.position)
    .applyQuaternion(m.mesh.quaternion.clone().invert());
  animateRig(
    m.mesh,
    dt,
    time,
    0,
    {
      yaw: Math.atan2(-local.x, -local.z),
      pitch: THREE.MathUtils.clamp(
        Math.atan2(local.y - 0.75, Math.hypot(local.x, local.z)),
        -0.65,
        0.65,
      ),
    },
    m.hit,
  );
  const data = m.mesh.userData;
  data.lid.position.y = 0.7 + m.peek * 0.7;
  data.lid.rotation.y = (m.peek * Math.PI) / 2;
  data.head.visible = m.peek > 0.15;
}
