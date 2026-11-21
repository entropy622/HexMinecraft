import * as THREE from 'three';
import { MobRig, skinBox, animateRig } from './mob-skins.js';
import { ENDERMAN_EYES } from './enderman-data.js';

export function createEnderman(textures) {
  const rig = new MobRig(),
    skin = rig.material('mobs_mc_enderman'),
    eyes = rig.material('mobs_mc_enderman_eyes', '#deb6ff', true),
    dark = rig.material(null, '#130f19');
  eyes.color.multiplyScalar(1.8);
  rig.box([8, 12, 4], [0, 33, 0], skin, [32, 16]);
  const head = rig.pivot(0, ENDERMAN_EYES, 0);
  const face = skinBox(0, 0, 8, 8, 8);
  face.bottom = face.top;
  rig.box([8, 8, 8], [0, 0, 0], skin, face, head);
  rig.box([8.05, 8.05, 8.05], [0, 0, 0], eyes, face, head);
  const jaw = rig.joint(0, -4, 0, head);
  rig.box([7, 2, 7], [0, 0, 0], dark, [0, 0], jaw);
  const limbUv = skinBox(56, 0, 2, 30, 2);
  const legs = [-2, 2].map((x) => rig.limb(x, 27, 0, [2, 27, 2], skin, limbUv));
  const arms = [-5, 5].map((x) => rig.limb(x, 39, 0, [2, 27, 2], skin, limbUv));
  const carried = rig.pivot(0, 1.21, -0.66);
  return rig.finish({
    kind: 'enderman',
    head,
    headY: ENDERMAN_EYES,
    legs,
    arms,
    wings: [],
    jaw,
    carried,
    textures,
  });
}

function updateCarried(data, item) {
  if (data.carriedItem === item) return;
  data.carriedItem = item;
  for (const mesh of [...data.carried.children]) {
    mesh.geometry.dispose();
    for (const material of mesh.material) material.dispose();
    data.carried.remove(mesh);
  }
  if (!item) return;
  const material = ['side', 'top', 'top'].map(
    (face) =>
      new THREE.MeshLambertMaterial({
        map: data.textures.single(item + ':' + face),
      }),
  );
  const block = new THREE.Mesh(
    new THREE.CylinderGeometry(0.39, 0.39, 0.63, 6),
    material,
  );
  block.castShadow = block.receiveShadow = true;
  data.carried.add(block);
}

export function animateEnderman(mob, dt, time, camera, distanceMoved) {
  const data = mob.mesh.userData,
    p = mob.mesh.position;
  const dx = camera.position.x - p.x,
    dz = camera.position.z - p.z;
  const distance = Math.hypot(dx, dz),
    angry = mob.anger > 0;
  const look =
    distance < 9 || angry
      ? {
          yaw: THREE.MathUtils.clamp(
            Math.atan2(
              Math.sin(Math.atan2(dx, dz) + Math.PI - mob.mesh.rotation.y),
              Math.cos(Math.atan2(dx, dz) + Math.PI - mob.mesh.rotation.y),
            ),
            -1.0,
            1.0,
          ),
          pitch: THREE.MathUtils.clamp(
            Math.atan2(camera.position.y - p.y - ENDERMAN_EYES, distance),
            -0.5,
            0.5,
          ),
        }
      : null;
  const { phase, weight } = animateRig(
    mob.mesh,
    dt,
    time,
    distanceMoved,
    look,
    mob.hit,
  );
  data.head.position.y = ENDERMAN_EYES + (angry ? 0.09 : 0);
  data.head.position.x = angry ? Math.sin(time * 26 + mob.id) * 0.008 : 0;
  data.jaw.visible = angry;
  data.arms.forEach((arm, i) => {
    arm.rotation.x = THREE.MathUtils.damp(
      arm.rotation.x,
      mob.carried ? 0.55 : Math.sin(phase + (i ? 0 : Math.PI)) * 0.32 * weight,
      8,
      dt,
    );
    arm.rotation.z = mob.carried ? (i ? -0.08 : 0.08) : 0;
  });
  updateCarried(data, mob.carried || null);
}
