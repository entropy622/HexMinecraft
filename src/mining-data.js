// Common Minecraft hardness values; hex-only materials keep their own values.
const HARDNESS = {
  grass: 0.6,
  dirt: 0.5,
  sand: 0.5,
  gravel: 0.6,
  snow: 0.2,
  stone: 1.5,
  deepslate: 3,
  brick: 1.5,
  mossybrick: 2,
  sandstone: 0.8,
  basalt: 1.25,
  endstone: 3,
  endstoneBricks: 3,
  netherbrick: 2,
  purpur: 1.5,
  purpurPillar: 1.5,
  obsidian: 50,
  netherrack: 0.4,
  coal: 3,
  iron: 3,
  gold: 3,
  copper: 3,
  diamond: 3,
  lapisOre: 3,
  redstoneOre: 3,
  ironBlock: 5,
  goldBlock: 3,
  copperBlock: 3,
  glowstone: 0.3,
  crimsonwood: 2,
  workbench: 2.5,
  furnace: 3.5,
  chest: 2.5,
  shulkerBox: 2,
  bookshelf: 1.5,
  bed: 0.2,
  farmland: 0.6,
  enchantingTable: 5,
  anvil: 5,
  chippedAnvil: 5,
  damagedAnvil: 5,
  grindstone: 2,
  brewingStand: 0.5,
  spawner: 5,
  campfire: 2,
  soulCampfire: 2,
  hayBale: 0.5,
  ladder: 0.4,
  endRod: 0,
  dragonEgg: 3,
};
export function applyMiningHardness(blocks) {
  for (const [id, def] of Object.entries(blocks)) {
    if (Object.hasOwn(HARDNESS, id)) def.hardness = HARDNESS[id];
    else if (def.log || /planks$/i.test(id)) def.hardness = 2;
    else if (def.foliage) def.hardness = 0.2;
    else if (
      def.wooden &&
      ['door', 'trapdoor', 'fence', 'gate'].includes(def.shape)
    )
      def.hardness = ['door', 'trapdoor'].includes(def.shape) ? 3 : 2;
  }
  for (const def of Object.values(blocks))
    if (def.base && ['slab', 'stairs'].includes(def.shape))
      def.hardness = blocks[def.base].hardness;
}
