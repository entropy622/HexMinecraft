import { MobRig, skinBox, skinTile, mobSkin } from './mob-skins.js';

export function createNetherMob(kind) {
  const rig = new MobRig();
  if (kind === 'blaze') {
    const brass = rig.material('mcl_raw_ores_raw_gold_block', '#ffce77'),
      shade = rig.material(null, '#a56322');
    brass.emissive.set('#c57913');
    const gaze = rig.material(null, '#452717');
    const head = rig.joint(0, 24, 0);
    rig.box([8, 8, 8], [0, 0, 0], brass, skinTile([2, 2, 8, 8]), head);
    for (const side of [-1, 1])
      rig.box([2, 1, 0.25], [side * 2, 0, -4], gaze, [0, 0], head);
    rig.box([2, 1, 0.25], [0, -2, -4], shade, [0, 0], head);
    const rings = [];
    for (const [row, radius] of [7.5, 9, 5].entries()) {
      const ring = rig.joint(0, 5.6 + row * 7.2, 0);
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + row * 0.35;
        const x = Math.sin(angle) * radius,
          z = Math.cos(angle) * radius;
        const y = Math.sin(angle + row) * 1.5;
        rig.box([2, 8, 2], [x, y, z], brass, skinTile([6, 4, 2, 8]), ring);
        rig.box([2.1, 1.1, 2.1], [x, y - 2.65, z], shade, [0, 0], ring);
      }
      rings.push(ring);
    }
    return rig.finish({ kind, head, rings, gold: brass });
  }
  const body = rig.material('mobs_mc_ghast');
  rig.box([40, 40, 40], [0, 36, 0], body, skinBox(0, 0, 20, 20, 20));
  const tentacles = [];
  for (let i = 0; i < 9; i++) {
    const x = ((i % 3) - 1) * 12 + (Math.floor(i / 3) % 2 ? 2 : -2);
    const length = [13, 18, 14, 20, 15, 17, 12, 19, 14][i];
    tentacles.push(
      rig.limb(
        x,
        18,
        (Math.floor(i / 3) - 1) * 12,
        [4, length, 4],
        body,
        skinBox(0, 56, 2, 14, 2),
      ),
    );
  }
  return rig.finish({
    kind,
    tentacles,
    face: body,
    idleFace: body.map,
    firingFace: mobSkin('mobs_mc_ghast_firing'),
  });
}
export function animateNetherMob(mob, time) {
  const data = mob.mesh.userData,
    charge = mob.charge || 0;
  data.rings?.forEach((ring, i) => {
    ring.rotation.y = time * (i === 1 ? -1 : 1) * (1.1 + charge * 1.7) + i;
    ring.position.y = 0.35 + i * 0.45 + Math.sin(time * 3 + i) * 0.055;
  });
  if (data.gold)
    data.gold.emissiveIntensity =
      0.55 + charge * 0.85 + Math.max(0, Math.sin(time * 9)) * 0.08;
  data.tentacles?.forEach((pivot, i) => {
    pivot.rotation.x = Math.sin(time * 2.4 + i * 0.9) * 0.23;
    pivot.rotation.z = Math.cos(time * 1.8 + i) * 0.16;
  });
  if (data.face) data.face.map = charge > 0.1 ? data.firingFace : data.idleFace;
}
