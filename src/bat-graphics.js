import * as THREE from 'three';
import { MobRig, skinTile } from './mob-skins.js';

export function createBat() {
  const rig = new MobRig(),
    fur = rig.material('mobs_mc_cow', '#e2c9ba'),
    membrane = rig.material(null, '#785242'),
    innerEar = rig.material(null, '#b37e68'),
    eye = rig.material(null, '#20171b');
  const pelt = skinTile([29, 15, 6, 6]);
  rig.box([3, 5, 3], [0, 4, 0], fur, pelt);
  const head = rig.joint(0, 8, 0.5);
  rig.box([4, 3, 3], [0, 0, 0], fur, pelt, head);
  rig.box([1.5, 1, 1], [0, -0.7, 1.5], innerEar, [0, 0], head);
  const wings = [],
    tips = [];
  for (const side of [-1, 1]) {
    rig.box([1.9, 3, 1], [side * 1.45, 2.7, 0], fur, pelt, head);
    rig.box([0.8, 2, 0.35], [side * 1.45, 2.7, 0.45], innerEar, [0, 0], head);
    rig.box([0.75, 0.75, 0.4], [side * 1.15, 0.15, 1.5], eye, [0, 0], head);
    rig.box([1, 1.5, 1], [side * 0.85, 1.15, 0.3], fur, pelt);
    const wing = rig.joint(side * 1.5, 6.5, 0),
      tip = rig.joint(side * 4, 1, 0, wing);
    wing.rotation.z = side * 0.23;
    rig.box([4, 1, 1], [side * 2, 0.5, 0], fur, pelt, wing);
    rig.box([4, 3, 0.55], [side * 2, -1.25, 0], membrane, [0, 0], wing);
    rig.box([1.5, 1, 0.55], [side * 1.4, -3, 0], membrane, [0, 0], wing);
    rig.box([5, 0.9, 0.9], [side * 2.3, -0.65, 0], fur, pelt, tip).rotation.z =
      -side * 0.35;
    rig.box([3, 2, 0.55], [side * 1.5, -1.4, 0], membrane, [0, 0], tip);
    rig.box([1.5, 1, 0.55], [side * 0.75, -2.9, 0], membrane, [0, 0], tip);
    wings.push(wing);
    tips.push(tip);
  }
  return rig.finish({ kind: 'bat', wings, tips });
}
export function animateBat(m, time) {
  const data = m.mesh.userData;
  data.resting = !!m.resting;
  data.body.rotation.z = m.resting ? Math.PI : 0;
  data.body.position.y = m.resting ? 0.72 : 0;
  data.wings.forEach((wing, i) => {
    wing.rotation.y =
      (i ? 1 : -1) * (m.resting ? 1.35 : Math.sin(time * 24 + m.id) * 0.85);
    data.tips[i].rotation.y =
      (i ? 1 : -1) *
      (m.resting ? 1.1 : 0.25 + 0.3 * Math.sin(time * 24 + m.id - 0.7));
    wing.rotation.z = (i ? 1 : -1) * (m.resting ? -0.7 : 0.23);
  });
  m.mesh.rotation.y = m.angle;
  for (const material of data.materials)
    material.color
      .copy(material.userData.baseColor)
      .lerp(new THREE.Color('#ff6960'), m.hit > 0 ? 0.55 : 0);
}
