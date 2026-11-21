import { skinBox, skinTile } from './mob-skins.js';

export function pastureAnimal(kind, rig, skin) {
  const legs = [],
    wings = [];
  if (kind === 'chicken') {
    const head = rig.joint(0, 10, -4);
    rig.box([4, 6, 3], [0, 1, -1.5], skin, [0, 0], head);
    rig.box([4, 2, 2], [0, 0, -4], skin, [14, 0], head);
    rig.box([2, 2, 2], [0, -2, -3.5], skin, [14, 4], head);
    rig.box([6, 8, 6], [0, 6.5, 0], skin, [0, 9]).rotation.x = -Math.PI / 2;
    const foot = rig.material(null, '#c7984c');
    for (const side of [-1, 1]) {
      const leg = rig.limb(side * 2, 4.5, 0, [1, 4, 1], foot);
      rig.box([3, 0.75, 2], [0, -4.125, -0.5], foot, [0, 0], leg);
      legs.push(leg);
      const wing = rig.joint(side * 3, 9.5, 0);
      rig.box([1, 4, 6], [side * 0.5, -2, 0], skin, [24, 13], wing);
      wing.userData.side = side;
      wings.push(wing);
    }
    return { head, legs, wings };
  }
  const cow = kind === 'cow',
    sheep = kind === 'sheep';
  const legHeight = cow || sheep ? 12 : 6;
  const head = rig.joint(0, cow ? 19 : sheep ? 17 : 12, cow ? -8 : -7);
  const headSize = cow ? [8, 8, 6] : sheep ? [6, 6, 8] : [8, 8, 8];
  rig.box(headSize, [0, 0, sheep ? -3 : -2], skin, [0, 0], head);
  let tail;
  if (cow) {
    for (const side of [-1, 1])
      rig.box([1, 3, 1], [side * 4.5, 3.5, -1], skin, [22, 0], head);
    rig.box([4, 3, 3], [0, 11, 5], skin, [52, 0]);
    tail = rig.joint(0, 19, 10);
    const tuft = rig.material(null, '#40302b');
    rig.box([1, 7, 1], [0, -3, 0.6], tuft, [0, 0], tail);
    rig.box([2, 3, 2], [0, -7, 0.6], tuft, [0, 0], tail);
  } else if (!sheep) {
    rig.box([4, 3, 1], [0, -1.5, -6.5], skin, [16, 16], head);
    tail = rig.joint(0, 12, 9);
    const pink = rig.material(null, '#d2938d');
    rig.box([1, 2, 1], [0, -0.5, 0.5], pink, [0, 0], tail);
    rig.box([2, 1, 1], [0.5, -1, 1.25], pink, [0, 0], tail);
  }
  const bodySize = cow ? [12, 18, 10] : sheep ? [8, 16, 6] : [10, 16, 8];
  const bodyY = cow ? 15.5 : sheep ? 14 : 9.5;
  const undercoat = sheep
    ? rig.material('mobs_mc_sheep', '#ffffff', false, 'fleece')
    : skin;
  const coat = sheep ? rig.material('mobs_mc_sheep_fur') : null;
  const trunk = rig.box(
    bodySize,
    [0, bodyY, 1],
    undercoat,
    cow ? [18, 4] : [28, 8],
  );
  trunk.rotation.x = -Math.PI / 2;
  let neck;
  if (sheep) {
    neck = rig.joint(0, bodyY, -6);
    rig.box([4, 8, 4], [0, -4, 0], undercoat, skinTile([4, 20, 4, 4]), neck);
    neck.scale.y = 0.1;
    rig.box(
      [12, 20, 10],
      [0, bodyY, 1],
      coat,
      skinBox(28, 8, 8, 16, 6),
    ).rotation.x = trunk.rotation.x;
    rig.box([7, 7, 6], [0, 0.5, -1.5], coat, skinBox(0, 0, 6, 6, 6), head);
  }
  for (const z of [-5, 7]) {
    for (const side of [-1, 1]) {
      const leg = rig.limb(
        side * (cow ? 4 : 3),
        legHeight,
        z,
        [4, legHeight, 4],
        skin,
        [0, 16],
      );
      if (sheep)
        rig.box([5, 6, 5], [0, -2.5, 0], coat, skinBox(0, 16, 4, 6, 4), leg);
      legs.push(leg);
    }
  }
  return {
    head,
    legs,
    wings,
    tail,
    neck,
    wool: coat,
    ...(sheep ? { woolMaterials: [coat, undercoat] } : {}),
  };
}
