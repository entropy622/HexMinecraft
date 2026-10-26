import * as THREE from 'three';
import { MobRig } from './mob-skins.js';

// Original geometry: hinged, scalloped membranes and oversized ears.
export function createBat() {
  const rig = new MobRig(),
    fur = rig.material(null, '#5b4034'),
    skin = rig.material(null, '#805847'),
    eyes = rig.material(null, '#161211');
  rig.solid(0.2, 0.32, 0.18, fur, 0, 0.27, 0);
  rig.solid(0.25, 0.21, 0.2, fur, 0, 0.49, 0.02);
  for (const side of [-1, 1]) {
    rig.solid(0.07, 0.17, 0.045, skin, side * 0.095, 0.64, 0.01);
    rig.solid(0.04, 0.035, 0.02, eyes, side * 0.07, 0.51, 0.13);
  }
  const wings = [];
  skin.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const hinge = rig.pivot(side * 0.1, 0.35, 0),
      shape = new THREE.Shape();
    shape.moveTo(0, 0.06);
    shape.lineTo(0.28, 0.24);
    shape.lineTo(0.64, 0.12);
    shape.lineTo(0.54, -0.04);
    shape.lineTo(0.4, 0.02);
    shape.lineTo(0.31, -0.14);
    shape.lineTo(0.19, -0.06);
    shape.lineTo(0.08, -0.2);
    shape.lineTo(0, -0.1);
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), skin);
    wing.scale.x = side;
    hinge.add(wing);
    wings.push(hinge);
  }
  return rig.finish({ kind: 'bat', wings });
}
export function animateBat(m, time) {
  const data = m.mesh.userData;
  data.resting = !!m.resting;
  data.body.rotation.z = m.resting ? Math.PI : 0;
  data.body.position.y = m.resting ? 0.72 : 0;
  data.wings.forEach((wing, i) => {
    wing.rotation.y =
      (i ? 1 : -1) * (m.resting ? 1.35 : Math.sin(time * 24 + m.id) * 0.85);
    wing.rotation.z = m.resting ? (i ? -0.7 : 0.7) : 0;
  });
  m.mesh.rotation.y = m.angle;
  for (const material of data.materials)
    material.color
      .copy(material.userData.baseColor)
      .lerp(new THREE.Color('#ff6960'), m.hit > 0 ? 0.55 : 0);
}
