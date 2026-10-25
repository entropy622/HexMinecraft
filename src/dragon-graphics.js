import * as THREE from 'three';
import { MobRig, skinTile } from './mob-skins.js';

export function createDragon() {
  const rig = new MobRig(),
    skin = rig.material('mobs_mc_dragon'),
    glow = rig.material(null, '#e799ff', true),
    dark = rig.material(null, '#211a2a');
  glow.color.multiplyScalar(2);
  const tile = skinTile([0, 0, 80, 64]);
  rig.part(2.1, 1.6, 3.3, tile, skin, 0, 0, 0);
  const neck = rig.pivot(0, 0.2, -1.8);
  rig.part(0.8, 0.85, 1.6, tile, skin, 0, 0, -0.5, neck);
  const head = rig.pivot(0, 0.1, -1.3, neck);
  head.userData.dragonPart = 'head';
  rig.part(1.15, 0.85, 1.2, tile, skin, 0, 0, -0.15, head);
  rig.part(0.85, 0.45, 1.0, tile, skin, 0, -0.15, -1, head);
  const jaw = rig.pivot(0, -0.4, -0.25, head);
  rig.part(0.85, 0.17, 1.55, tile, skin, 0, 0, -0.5, jaw);
  for (const side of [-1, 1]) {
    rig.solid(0.08, 0.17, 0.24, glow, side * 0.56, 0.16, -0.42, head);
    rig.part(0.17, 0.6, 0.2, tile, dark, side * 0.38, 0.65, 0.15, head);
  }
  for (const z of [-1, 0, 1]) rig.part(0.18, 0.5, 0.24, tile, dark, 0, 0.93, z);
  const tails = [];
  let parent = rig.pivot(0, -0.1, 1.6);
  for (let i = 0; i < 6; i++) {
    const joint = rig.pivot(0, 0, i ? 0.9 : 0, parent);
    rig.part(
      0.72 - i * 0.085,
      0.6 - i * 0.06,
      1.05,
      tile,
      skin,
      0,
      0,
      0.45,
      joint,
    );
    tails.push(joint);
    parent = joint;
  }
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = rig.pivot(side * 0.9, 0.55, -0.55);
    wing.scale.x = side;
    const vertices = [
      [0, 0, 0],
      [5.7, 0.15, 0.5],
      [4.3, 0, 2.9],
      [1.5, 0, 2.2],
      [0, 0, 1.2],
    ];
    const positions = [],
      uv = [];
    for (let i = 1; i < vertices.length - 1; i++)
      for (const v of [vertices[0], vertices[i], vertices[i + 1]]) {
        positions.push(...v);
        uv.push(
          ((v[0] / 5.7) * 108) / 256,
          1 - (100 + (v[2] / 2.9) * 88) / 256,
        );
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const membrane = rig.material('mobs_mc_dragon', '#cfb2da');
    membrane.side = THREE.DoubleSide;
    wing.add(new THREE.Mesh(geometry, membrane));
    for (const end of [vertices[1], vertices[2], vertices[3]]) {
      const length = Math.hypot(...end),
        bone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.11, length, 6),
          dark,
        );
      bone.position.fromArray(end).multiplyScalar(0.5);
      bone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...end).normalize(),
      );
      wing.add(bone);
    }
    wing.userData.side = side;
    wings.push(wing);
    for (const z of [-0.8, 0.9]) {
      const leg = rig.pivot(side * 0.85, -0.55, z);
      rig.part(0.35, 1.0, 0.4, tile, skin, 0, -0.5, 0.1, leg);
      rig.part(0.45, 0.23, 0.7, tile, skin, 0, -1.03, -0.1, leg);
    }
  }
  return rig.finish({ head, jaw, neck, tails, wings });
}
export function animateDragon(mesh, clock, perched, breathing, hit) {
  const data = mesh.userData;
  for (const wing of data.wings)
    wing.rotation.z =
      wing.userData.side *
      (0.14 + Math.sin(clock * (perched ? 2 : 6)) * (perched ? 0.18 : 0.58));
  data.tails.forEach((tail, i) => {
    tail.rotation.y = Math.sin(clock * 2 - i * 0.55) * 0.12;
    tail.rotation.x = Math.sin(clock * 1.5 - i * 0.4) * 0.05;
  });
  data.body.position.y = Math.sin(clock * 4) * (perched ? 0.035 : 0.12);
  data.jaw.rotation.x = breathing ? 0.32 : 0.05 + Math.sin(clock * 2) * 0.035;
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
