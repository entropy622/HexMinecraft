// Pixel Perfection / VoxeLibre. Asset provenance and licenses: public/textures/NOTICE.md.
import { POTIONS } from './brewing-data.js';
import { CUT_MATERIALS } from './building-data.js';
import { WOOD_BLOCKS } from './wood-data.js';
export const blockTextures = {
  birchWood: ['mcl_core_log_birch_top', 'mcl_core_log_birch'],
  birchLeaves: ['mcl_core_leaves_birch'],
  birchPlanks: ['mcl_core_planks_birch'],
  spruceWood: ['mcl_core_log_spruce_top', 'mcl_core_log_spruce'],
  spruceLeaves: ['mcl_core_leaves_spruce'],
  sprucePlanks: ['mcl_core_planks_spruce'],
  chorusPlant: ['mcl_end_chorus_plant'],
  chorusFlower: ['mcl_end_chorus_flower'],
  chorusFlowerDead: ['mcl_end_chorus_flower_dead'],
  endstoneBricks: ['mcl_end_end_bricks'],
  purpurPillar: ['mcl_end_purpur_pillar_top', 'mcl_end_purpur_pillar'],
  endRod: ['mcl_end_end_rod'],
  shulkerBox: ['mobs_mc_shulker_purple'],
  dragonEgg: ['mcl_end_dragon_egg'],
  brewingStand: ['mcl_brewing_top', 'mcl_brewing_side'],
  brewingBase: ['mcl_brewing_base'],
  soulSand: ['mcl_nether_soul_sand'],
  redstoneOre: ['mcl_core_redstone_ore'],
  ironBlock: ['default_steel_block'],
  anvil: ['mcl_anvils_anvil_top_damaged_0', 'mcl_anvils_anvil_side'],
  chippedAnvil: ['mcl_anvils_anvil_top_damaged_1', 'mcl_anvils_anvil_side'],
  damagedAnvil: ['mcl_anvils_anvil_top_damaged_2', 'mcl_anvils_anvil_side'],
  anvilBase: ['mcl_anvils_anvil_base'],
  grindstone: ['grindstone_side', 'grindstone_top'],
  grindstoneFrame: ['grindstone_front'],
  lapisOre: ['mcl_core_lapis_ore'],
  enchantingTable: ['mcl_enchanting_table_top', 'mcl_enchanting_table_side'],
  door: ['default_wood', 'mcl_doors_door_wood_lower'],
  doorTop: ['default_wood', 'mcl_doors_door_wood_upper'],
  fence: ['default_wood'],
  gate: ['default_wood'],
  ladder: ['default_wood'],
  bookshelf: ['mcl_books_bookshelf_top', 'default_bookshelf'],
  deepslate: ['mcl_deepslate_top', 'mcl_deepslate'],
  gold: ['mcl_core_gold_ore'],
  copper: ['mcl_copper_ore'],
  goldBlock: ['default_gold_block'],
  copperBlock: ['mcl_copper_block_cut'],
  mossybrick: ['default_mossycobble'],
  sandstone: ['mcl_core_sandstone_top', 'mcl_core_sandstone_normal'],
  netherbrick: ['mcl_nether_nether_brick'],
  purpur: ['mcl_end_purpur_block'],
  spawner: ['mob_spawner'],
  torch: ['default_tree'],
  grass: ['mcl_core_grass_block_top', 'default_dirt'],
  dirt: ['default_dirt'],
  stone: ['default_stone'],
  sand: ['default_sand'],
  wood: ['default_tree_top', 'default_tree'],
  leaves: ['default_leaves'],
  planks: ['default_wood'],
  coal: ['mcl_core_coal_ore'],
  iron: ['mcl_core_iron_ore'],
  diamond: ['mcl_core_diamond_ore'],
  brick: ['default_stone_brick'],
  endstone: ['mcl_end_end_stone'],
  netherrack: ['mcl_nether_netherrack'],
  obsidian: ['default_obsidian'],
  snow: ['default_snow'],
  workbench: ['crafting_workbench_top', 'crafting_workbench_side'],
  furnace: ['default_furnace_top', 'default_furnace_front'],
  furnaceLit: ['default_furnace_top', 'default_furnace_front_active'],
  furnaceCasing: ['default_furnace_top', 'default_furnace_side'],
  farmland: ['mcl_farming_farmland_wet', 'default_dirt'],
  glowstone: ['mcl_nether_glowstone'],
  bedrock: ['mcl_core_bedrock'],
  wool: ['wool_white'],
};
for (const [base] of CUT_MATERIALS) {
  blockTextures[base + 'Slab'] = blockTextures[base];
  blockTextures[base + 'Stairs'] = blockTextures[base];
}
export const itemTextures = {
  birchSapling: 'mcl_core_sapling_birch',
  spruceSapling: 'mcl_core_sapling_spruce',
  chorusFruit: 'mcl_end_chorus_fruit',
  poppedChorusFruit: 'mcl_end_chorus_fruit_popped',
  shulkerShell: 'mcl_mobitems_shulker_shell',
  elytra: 'mcl_armor_inv_elytra',
  fireworkRocket: 'vl_fireworks_rocket',
  phantomMembrane: 'vl_mobitems_spectre_membrane',
  endCrystal: 'mcl_end_crystal_item',
  pearl: 'mcl_throwing_ender_pearl',
  snowball: 'mcl_throwing_snowball',
  ghastTear: 'mcl_mobitems_ghast_tear',
  blazeRod: 'vl_mobitems_flaming_rod',
  ember: 'vl_mobitems_flaming_powder',
  glassBottle: 'mcl_potions_potion_bottle',
  netherWart: 'mcl_nether_nether_wart',
  redstone: 'redstone_redstone_dust',
  glowDust: 'mcl_nether_glowstone_dust',
  magmaCream: 'mcl_mobitems_magma_cream',
  slimeBall: 'mcl_mobitems_slimeball',
  pufferFish: 'mcl_fishing_pufferfish_raw',
  goldNugget: 'mcl_core_gold_nugget',
  goldenCarrot: 'farming_carrot_gold',
  glisteringMelon: 'mcl_potions_melon_speckled',
  melonSlice: 'farming_melon',
  melonSeed: 'mcl_farming_melon_seeds',
  lapis: 'mcl_core_lapis',
  shield: 'mcl_shield',
  boat: 'mcl_boats_oak_boat',
  fishingRod: 'mcl_fishing_fishing_rod',
  rawCod: 'mcl_fishing_fish_raw',
  cookedCod: 'mcl_fishing_fish_cooked',
  rawSalmon: 'mcl_fishing_salmon_raw',
  cookedSalmon: 'mcl_fishing_salmon_cooked',
  tropicalFish: 'mcl_fishing_clownfish_raw',
  charcoal: 'mcl_core_charcoal',
  door: 'doors_item_wood',
  fence: 'mcl_fences_fence_oak',
  gate: 'mcl_fences_fence_gate_oak',
  ladder: 'default_ladder',
  sapling: 'default_sapling',
  carrot: 'farming_carrot',
  potato: 'farming_potato',
  bakedPotato: 'farming_potato_baked',
  sugarCane: 'mcl_core_reeds',
  sugar: 'mcl_core_sugar',
  paper: 'default_paper',
  book: 'default_book',
  goldIngot: 'default_gold_ingot',
  copperIngot: 'mcl_copper_ingot',
  goldenApple: 'mcl_core_apple_golden',
  torch: 'default_torch_on_floor',
  shears: 'default_tool_shears',
  leather: 'mcl_mobitems_leather',
  feather: 'mcl_mobitems_feather',
  egg: 'mcl_throwing_egg',
  bone: 'mcl_mobitems_bone',
  boneMeal: 'mcl_mobitems_bone',
  gunpowder: 'default_gunpowder',
  milkBucket: 'mcl_mobitems_bucket_milk',
  cake: 'cake',
  leatherHead: 'mcl_armor_inv_helmet_leather',
  leatherChest: 'mcl_armor_inv_chestplate_leather',
  leatherLegs: 'mcl_armor_inv_leggings_leather',
  leatherFeet: 'mcl_armor_inv_boots_leather',
  bow: 'mcl_bows_bow',
  arrow: 'mcl_bows_arrow_inv',
  string: 'mcl_mobitems_string',
  axe1: 'default_tool_woodaxe',
  axe2: 'default_tool_stoneaxe',
  axe3: 'default_tool_steelaxe',
  axe4: 'default_tool_diamondaxe',
  shovel1: 'default_tool_woodshovel',
  shovel2: 'default_tool_stoneshovel',
  shovel3: 'default_tool_steelshovel',
  shovel4: 'default_tool_diamondshovel',
  sword1: 'default_tool_woodsword',
  sword2: 'default_tool_stonesword',
  sword4: 'default_tool_diamondsword',
  ironHead: 'mcl_armor_inv_helmet_iron',
  ironChest: 'mcl_armor_inv_chestplate_iron',
  ironLegs: 'mcl_armor_inv_leggings_iron',
  ironFeet: 'mcl_armor_inv_boots_iron',
  diamondHead: 'mcl_armor_inv_helmet_diamond',
  diamondChest: 'mcl_armor_inv_chestplate_diamond',
  diamondLegs: 'mcl_armor_inv_leggings_diamond',
  diamondFeet: 'mcl_armor_inv_boots_diamond',
  pick1: 'default_tool_woodpick',
  pick2: 'default_tool_stonepick',
  pick3: 'default_tool_steelpick',
  pick4: 'default_tool_diamondpick',
  sword: 'default_tool_steelsword',
  hoe: 'farming_tool_woodhoe',
  emerald: 'mcl_core_emerald',
  ingot: 'default_steel_ingot',
  apple: 'default_apple',
  bread: 'farming_bread',
  meat: 'mcl_mobitems_beef_raw',
  cooked: 'mcl_mobitems_beef_cooked',
  wheat: 'farming_wheat_harvested',
  seed: 'mcl_farming_wheat_seeds',
  bucket: 'mcl_buckets_bucket',
  waterBucket: 'mcl_buckets_water_bucket',
  lavaBucket: 'mcl_buckets_lava_bucket',
};
export const textureURL = (name) =>
  `${import.meta.env.BASE_URL}textures/pixel-perfection/${name}.png`;
const images = new Map();
const mobTextures = [
  'mobs_mc_shulker_purple',
  'mobs_mc_shulkerbullet',
  'mobs_mc_dragon',
  'mobs_mc_enderman',
  'mobs_mc_enderman_eyes',
  'mobs_mc_cow',
  'mobs_mc_pig',
  'mobs_mc_sheep',
  'mobs_mc_sheep_fur',
  'mobs_mc_chicken',
  'mobs_mc_zombie',
  'mobs_mc_skeleton',
  'mobs_mc_spider',
  'mobs_mc_spider_eyes',
  'vl_stalker_default',
  'mobs_mc_villager',
  'mobs_mc_villager_farmer',
  'mobs_mc_villager_fisherman',
  'mobs_mc_villager_smith',
  'mobs_mc_villager_librarian',
  'mobs_mc_ghast',
  'mobs_mc_ghast_firing',
  'mcl_fire_fire_charge',
];
export const mobImage = (name) => images.get(name);
const plantTextures = {
  netherWart: [
    'mcl_nether_nether_wart_stage_0',
    'mcl_nether_nether_wart_stage_1',
    'mcl_nether_nether_wart_stage_1',
    'mcl_nether_nether_wart_stage_2',
  ],
  melon: [
    'mcl_farming_melon_stem_disconnected',
    'mcl_farming_melon_stem_disconnected',
    'mcl_farming_melon_stem_disconnected',
    'farming_melon_side',
  ],
  melonTop: ['farming_melon_top'],
  wheat: [
    'mcl_farming_wheat_stage_0',
    'mcl_farming_wheat_stage_2',
    'mcl_farming_wheat_stage_5',
    'mcl_farming_wheat_stage_7',
  ],
  carrot: [
    'farming_carrot_1',
    'farming_carrot_2',
    'farming_carrot_3',
    'farming_carrot_4',
  ],
  potato: [
    'mcl_farming_potatoes_stage_0',
    'mcl_farming_potatoes_stage_1',
    'mcl_farming_potatoes_stage_2',
    'mcl_farming_potatoes_stage_3',
  ],
  sapling: ['default_sapling'],
  birchSapling: ['mcl_core_sapling_birch'],
  spruceSapling: ['mcl_core_sapling_spruce'],
  sugarCane: ['mcl_core_reeds'],
};
export const plantImage = (kind, stage) => {
  const names = plantTextures[kind];
  return names && images.get(names[Math.min(stage, names.length - 1)]);
};
const potionImages = new Map();
export const itemImage = (id) => {
  if (!POTIONS[id]) return images.get(itemTextures[id]);
  if (!potionImages.has(id)) {
    const overlay = images.get('mcl_potions_potion_overlay'),
      bottle = images.get('mcl_potions_potion_bottle');
    if (!overlay || !bottle) return bottle;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(overlay, 0, 0, 16, 16);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = POTIONS[id].color;
    c.fillRect(0, 0, 16, 16);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(bottle, 0, 0, 16, 16);
    potionImages.set(id, canvas);
  }
  return potionImages.get(id);
};
export const bowImage = (stage) =>
  images.get(stage < 0 ? 'mcl_bows_bow' : 'mcl_bows_bow_' + stage);
export async function loadTexturePack() {
  const names = new Set([
    ...Object.values(blockTextures).flat(),
    ...Object.values(itemTextures),
    ...Object.values(plantTextures).flat(),
    ...mobTextures,
    'mcl_core_grass_block_side_overlay',
    'mcl_bows_bow_0',
    'mcl_bows_bow_1',
    'mcl_bows_bow_2',
    'mcl_potions_potion_bottle',
    'mcl_potions_potion_overlay',
  ]);
  await Promise.allSettled(
    [...names].map(
      (name) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            images.set(name, image);
            resolve();
          };
          image.onerror = reject;
          image.src = textureURL(name);
        }),
    ),
  );
}
export function paintPackTile(ctx, id, top) {
  const names = blockTextures[id];
  const image =
    names && images.get(names[top ? 0 : Math.min(1, names.length - 1)]);
  if (!image) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);
  if (id === 'shulkerBox') {
    if (top) ctx.drawImage(image, 16, 0, 16, 16, 0, 0, 16, 16);
    else {
      ctx.drawImage(image, 16, 16, 16, 12, 0, 0, 16, 8);
      ctx.drawImage(image, 16, 44, 16, 8, 0, 8, 16, 8);
    }
    return;
  }
  ctx.drawImage(image, 0, 0, 16, 16);
  const leafTint = id === 'leaves' ? '#79a94d' : WOOD_BLOCKS[id]?.leafTint;
  if (leafTint || (id === 'grass' && top)) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = leafTint || '#91b95d';
    ctx.fillRect(0, 0, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (id === 'grass' && !top) {
    const overlay = images.get('mcl_core_grass_block_side_overlay');
    if (!overlay) return;
    const tint = document.createElement('canvas');
    tint.width = tint.height = 16;
    const c = tint.getContext('2d');
    c.drawImage(overlay, 0, 0, 16, 16);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#88ad54';
    c.fillRect(0, 0, 16, 16);
    c.globalCompositeOperation = 'multiply';
    c.drawImage(overlay, 0, 0, 16, 16);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(overlay, 0, 0, 16, 16);
    ctx.drawImage(tint, 0, 0);
  }
}
