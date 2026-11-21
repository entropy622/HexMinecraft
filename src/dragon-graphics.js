import * as THREE from 'three';
import { MobRig, skinBox, skinTile } from './mob-skins.js';

// Each wing panel meets the next one on its hinge. The fingers and leading
// spar have square cross-sections, with a double-sided pixel membrane between.
function dragonWing(rig, side, membrane, spar) {
  const wing = rig.pivot(side * 0.9, 0.55, -0.55);
  wing.scale.x = side;
  const tip = rig.pivot(2.7, 0.18, -0.65, wing);
  function fan(parent, vertices, fingers) {
    const pos = [],
      uv = [];
    for (let i = 1; i < vertices.length - 1; i++) {
      for (const point of [vertices[0], vertices[i + 1], vertices[i]]) {
        pos.push(...point);
        uv.push((4 + point[0] * 3) / 256, 1 - (112 + point[2] * 2) / 256);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    parent.add(new THREE.Mesh(g, membrane));
    for (const i of fingers) {
      const end = new THREE.Vector3(...vertices[i]);
      const width = i === 1 ? 0.16 : 0.085;
      const beam = rig.solid(
        width,
        end.length(),
        width,
        spar,
        end.x / 2,
        end.y / 2,
        end.z / 2,
        parent,
      );
      beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.normalize(),
      );
    }
  }
  fan(
    wing,
    [
      [0, 0, 0],
      [2.7, 0.18, -0.65],
      [2.7, 0.18, 2.45],
      [1.1, -0.08, 2],
      [0, -0.1, 1.7],
    ],
    [1, 3],
  );
  fan(
    tip,
    [
      [0, 0, 0],
      [3.05, -0.06, 1.25],
      [2.45, -0.08, 1.75],
      [2.1, 0, 1.65],
      [1.35, -0.13, 3.2],
      [0.85, -0.04, 2.85],
      [0, 0, 3.1],
    ],
    [1, 4, 6],
  );
  wing.userData.side = side;
  wing.userData.tip = tip;
  return wing;
}
export function createDragon() {
  const rig = new MobRig();
  const skin = rig.material('mobs_mc_dragon'),
    spar = rig.material(null, '#302632'),
    membrane = rig.material('mobs_mc_dragon', '#b79fbf');
  membrane.side = THREE.DoubleSide;
  const hide = skinTile([30, 25, 12, 12]),
    plate = rig.material(null, '#554354');
  rig.box([34, 25, 52], [0, 0, 0], skin, skinBox(0, 0, 24, 24, 64));
  const neck = rig.pivot(0, 0.2, -1.7);
  rig.box([14, 13, 15], [0, 0, -5], skin, hide, neck);
  rig.box([12, 12, 15], [0, 1, -17], skin, hide, neck);
  const head = rig.joint(0, 1, -24, neck);
  head.userData.dragonPart = 'head';
  rig.box([18, 15, 20], [0, 2, -1], skin, hide, head);
  rig.box([14, 7, 16], [0, -1, -16], skin, hide, head);
  const jaw = rig.joint(0, -4, -6, head);
  rig.box([14, 3, 18], [0, -2, -9], skin, hide, jaw);
  const eyes = rig.material(null, '#cf76ed', true);
  const ivory = rig.material(null, '#c7b7a4');
  for (const sign of [-1, 1]) {
    for (const z of [-21, -15])
      rig.box([1, 2, 1], [sign * 5.8, -5, z], ivory, [0, 0], head);
    rig.box([0.5, 2, 5], [sign * 9, 4, -8.5], eyes, [0, 0], head);
    rig.box([3, 2, 0.5], [sign * 7.5, 4, -11], eyes, [0, 0], head);
    rig.box([2, 2, 3], [sign * 4.5, 3, -21], plate, [0, 0], head);
    rig.box([3, 7, 3], [sign * 6, 12, 3], plate, [0, 0], head).rotation.x = 0.3;
    for (const z of [-13, 16]) {
      const leg = rig.joint(sign * 13, -8, z);
      rig.box([6, 13, 7], [0, -5, 0], skin, hide, leg).rotation.x = -0.28;
      rig.box([5, 8, 5], [0, -13, 2], skin, hide, leg);
      rig.box([6, 3, 10], [0, -17, 0], skin, hide, leg);
    }
  }
  for (const z of [-19, -5, 9, 23]) rig.box([3, 6, 5], [0, 14, z], plate);
  const tails = [];
  let base = rig.pivot(0, -0.1, 1.6);
  for (let i = 0; i < 6; i++) {
    const joint = rig.joint(0, 0, i ? 14 : 0, base);
    rig.box([12 - i * 1.5, 10 - i * 1.3, 15], [0, 0, 7], skin, hide, joint);
    rig.box([2, 3, 3], [0, 5.5 - i * 0.65, 6], plate, [0, 0], joint);
    tails.push(joint);
    base = joint;
  }
  const wings = [-1, 1].map((side) => dragonWing(rig, side, membrane, spar));
  return rig.finish({ head, jaw, neck, tails, wings });
}
export function animateDragon(mesh, clock, perched, breathing, hit) {
  const data = mesh.userData;
  for (const wing of data.wings) {
    const beat = clock * (perched ? 2 : 6);
    wing.rotation.z =
      wing.userData.side * (0.14 + Math.sin(beat) * (perched ? 0.18 : 0.58));
    wing.userData.tip.rotation.z =
      (perched ? -0.28 : -0.08) +
      Math.sin(beat - 0.7) * (perched ? 0.12 : 0.24);
  }
  data.tails.forEach((tail, i) => {
    tail.rotation.y = Math.sin(clock * 2 - i * 0.55) * 0.12;
    tail.rotation.x = Math.sin(clock * 1.5 - i * 0.4) * 0.05;
  });
  data.body.position.y = Math.sin(clock * 4) * (perched ? 0.035 : 0.12);
  data.jaw.rotation.x = breathing ? -0.32 : -0.05 + Math.sin(clock * 2) * 0.035;
  for (const material of data.materials)
    if (material.isMeshLambertMaterial)
      material.color
        .copy(material.userData.baseColor)
        .lerp(new THREE.Color('#ff8aa7'), Math.min(0.7, hit * 3));
}

export function createEndCrystal() {
  const group = new THREE.Group(),
    cage = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 6, 3),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#f6c6ff').multiplyScalar(2),
    }),
  );
  cage.add(core);
  for (const scale of [0.68, 0.9]) {
    const geometry = new THREE.EdgesGeometry(
      new THREE.CylinderGeometry(scale, scale, scale * 1.4, 6),
    );
    const frame = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: '#f2d8ff' }),
    );
    frame.rotation.z = Math.PI / 5;
    cage.add(frame);
  }
  group.add(cage);
  group.userData.cage = cage;
  return group;
}
