import * as THREE from 'three';
import { MobRig, skinBox, skinTile, animateRig } from './mob-skins.js';

export function createShulker() {
  const rig = new MobRig(),
    skin = rig.material('mobs_mc_shulker_purple');
  const lid = rig.joint(0, 10, 0);
  const baseUv = skinBox(0, 32, 16, 4, 16);
  baseUv.top = baseUv.bottom = [32, 28, 16, 16];
  const lidUv = skinBox(0, 0, 16, 9, 16);
  lidUv.bottom = baseUv.top;
  rig.box([16, 5, 16], [0, 2.5, 0], skin, baseUv);
  rig.box([14, 2, 14], [0, 6, 0], skin, skinTile([34, 30, 12, 12]));
  rig.box([16, 9, 16], [0, 1.5, 0], skin, lidUv, lid);
  // Offset the upper and lower teeth so they interlock when the lid closes.
  const tooth = skinTile([18, 20, 2, 2]);
  for (const side of [-7, 7]) {
    for (const offset of [-4, 4]) {
      rig.box([3, 2, 2], [offset, 6, side], skin, tooth);
      rig.box([2, 2, 3], [side, 6, offset], skin, tooth);
    }
    for (const offset of [-7, 0, 7])
      rig.box([2, 2, 2], [offset, -4, side], skin, tooth, lid);
    rig.box([2, 2, 2], [side, -4, 0], skin, tooth, lid);
  }
  const head = rig.joint(0, 9.75, 0);
  rig.box([6, 6, 6], [0, 0, 0], skin, [0, 52], head);
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
        Math.atan2(
          local.y - m.mesh.userData.head.position.y,
          Math.hypot(local.x, local.z),
        ),
        -0.65,
        0.65,
      ),
    },
    m.hit,
  );
  const data = m.mesh.userData;
  data.lid.position.y = 10 / 16 + m.peek * 0.7;
  data.lid.rotation.y = (m.peek * Math.PI) / 2;
  data.head.visible = m.peek > 0.15;
}
