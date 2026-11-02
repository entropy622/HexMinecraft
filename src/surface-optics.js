// Photon 6e67b36 material.glsl hardcoded optical categories, adapted to our IDs.
// Ores remain rough rock; only actual metal/gem blocks get those categories.
const classes = Object.assign(Object.create(null), {
  ironBlock: 12,
  goldBlock: 12,
  copperBlock: 12,
  diamondBlock: 13,
  amethystBlock: 13,
  buddingAmethyst: 13,
  smallAmethystBud: 55,
  mediumAmethystBud: 55,
  largeAmethystBud: 55,
  amethystCluster: 55,
  glowstone: 35,
  lantern: 35,
  redstoneLampOn: 35,
  torchFlame: 36,
  furnaceLit: 36,
  blastFurnaceLit: 36,
  smokerLit: 36,
  glowBerry: 37,
  endRod: 33,
  sand: 7,
  snow: 14,
  powderSnow: 14,
  birchPlanks: 9,
  planks: 10,
  junglePlanks: 10,
  obsidian: 11,
  endstone: 17,
});
export function surfaceOpticsClass(type, definition = {}) {
  const base = definition.base || type;
  if (definition.foliage || base?.endsWith('Leaves') || base === 'leaves')
    return 5;
  if (['flower', 'vine'].includes(definition.shape)) return 2;
  return classes[base] ?? 0;
}

export const reflectiveSurfaceClass = (category) =>
  category === 8 || category === 11 || category === 12 || category === 13;
