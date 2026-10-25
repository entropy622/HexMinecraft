import { MobRig, skinBox } from './mob-skins.js';

// Reuse the licensed shell UVs; the inventory block has a wide hex footprint
// and a separate sliding lid instead of the creature's head and attachment.
export function portableBoxMesh() {
  const rig = new MobRig(),
    skin = rig.material('mobs_mc_shulker_purple');
  rig.part(1.72, 0.5, 1.96, skinBox(0, 28, 16, 8, 16), skin, 0, 0.25, 0);
  const lid = rig.pivot(0, 0.75, 0);
  rig.part(1.72, 0.5, 1.96, skinBox(0, 0, 16, 12, 16), skin, 0, 0, 0, lid);
  const root = rig.finish({ lid });
  root.userData = { lid, portable: true };
  return root;
}
