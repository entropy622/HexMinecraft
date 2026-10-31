// Pixel Perfection / VoxeLibre. Asset provenance and licenses: public/textures/NOTICE.md.
import { POTIONS } from './brewing-data.js';
import { DYE_ITEMS, isPigmentPlant } from './dye-data.js';
import { paintPigment } from './pigment-art.js';
import { isWool, WOOL_BLOCKS, WOOL_TYPES } from './wool-data.js';
import { CUT_MATERIALS, WOOD_BUILDINGS } from './building-data.js';
import { WOOD_BLOCKS, TREES } from './wood-data.js';
import { paintJungle } from './jungle-art.js';
import { paintVine } from './vine-art.js';
export const blockTextures = {
  cobble: ['default_cobble'],
  cobbledDeepslate: ['mcl_cobbled_deepslate'],
  coalBlock: ['default_coal_block'],
  diamondBlock: ['default_diamond_block'],
  rawIronBlock: ['mcl_raw_ores_raw_iron_block'],
  rawGoldBlock: ['mcl_raw_ores_raw_gold_block'],
  rawCopperBlock: ['mcl_copper_block_raw'],
  gravel: ['default_gravel'],
  campfire: ['default_tree'],
  soulCampfire: ['default_tree'],
  campfireLog: ['default_tree'],
  campfireAsh: ['mcl_core_charcoal'],
  hayBale: ['mcl_farming_hayblock_top', 'mcl_farming_hayblock_side'],
  strippedOakWood: ['mcl_core_stripped_oak_top', 'mcl_core_stripped_oak_side'],
  strippedBirchWood: [
    'mcl_core_stripped_birch_top',
    'mcl_core_stripped_birch_side',
  ],
  strippedSpruceWood: [
    'mcl_core_stripped_spruce_top',
    'mcl_core_stripped_spruce_side',
  ],
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
  trapdoor: ['doors_trapdoor', 'doors_trapdoor_side'],
  ladder: ['default_wood'],
  bookshelf: ['mcl_books_bookshelf_top', 'default_bookshelf'],
  deepslate: ['mcl_deepslate_top', 'mcl_deepslate'],
  goldOre: ['mcl_core_gold_ore'],
  copperOre: ['mcl_copper_ore'],
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
  coalOre: ['mcl_core_coal_ore'],
  ironOre: ['mcl_core_iron_ore'],
  diamondOre: ['mcl_core_diamond_ore'],
  brick: ['default_stone_brick'],
  endstone: ['mcl_end_end_stone'],
  netherrack: ['mcl_nether_netherrack'],
  obsidian: ['default_obsidian'],
  snow: ['default_snow'],
  workbench: ['crafting_workbench_top', 'crafting_workbench_side'],
  furnace: ['default_furnace_top', 'default_furnace_front'],
  furnaceLit: ['default_furnace_top', 'default_furnace_front_active'],
  furnaceCasing: ['default_furnace_top', 'default_furnace_side'],
  blastFurnace: ['blast_furnace_top', 'blast_furnace_front'],
  blastFurnaceLit: ['blast_furnace_top', 'blast_furnace_front_on'],
  blastFurnaceCasing: ['blast_furnace_top', 'blast_furnace_side'],
  smoker: ['smoker_top', 'smoker_front'],
  smokerLit: ['smoker_top', 'smoker_front_on'],
  smokerCasing: ['smoker_top', 'smoker_side'],
  stonecutter: ['mcl_stonecutter_top', 'mcl_stonecutter_side'],
  stonecutterSaw: ['mcl_stonecutter_saw'],
  stonecutterSaw2: ['mcl_stonecutter_saw'],
  stonecutterSaw3: ['mcl_stonecutter_saw'],
  smoothStone: ['mcl_stairs_stone_slab_top'],
  smoothStoneSlab: ['mcl_stairs_stone_slab_top', 'mcl_stairs_stone_slab_side'],
  farmland: ['mcl_farming_farmland_wet', 'default_dirt'],
  glowstone: ['mcl_nether_glowstone'],
  bedrock: ['mcl_core_bedrock'],
};
for (const id of WOOL_TYPES) blockTextures[id] = ['wool_white'];
for (const species of ['birch', 'spruce']) {
  const ids = WOOD_BUILDINGS[species],
    plank = blockTextures[TREES[species].planks][0];
  blockTextures[ids.door] = [plank, `mcl_doors_door_${species}_lower`];
  blockTextures[ids.door + 'Top'] = [plank, `mcl_doors_door_${species}_upper`];
  blockTextures[ids.fence] = blockTextures[ids.gate] = [plank];
  blockTextures[ids.trapdoor] = [
    `mcl_doors_trapdoor_${species}`,
    `mcl_doors_trapdoor_${species}_side`,
  ];
}
for (const [base] of CUT_MATERIALS) {
  if (blockTextures[base]) {
    blockTextures[base + 'Slab'] = blockTextures[base];
    blockTextures[base + 'Stairs'] = blockTextures[base];
  }
}
export const itemTextures = {
  coal: 'default_coal_lump',
  diamond: 'default_diamond',
  rawIron: 'mcl_raw_ores_raw_iron',
  rawGold: 'mcl_raw_ores_raw_gold',
  rawCopper: 'mcl_copper_raw',
  flint: 'default_flint',
  flintAndSteel: 'mcl_fire_flint_and_steel',
  campfire: 'mcl_campfires_campfire_inv',
  soulCampfire: 'mcl_campfires_soul_campfire_inv',
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
for (const species of ['birch', 'spruce']) {
  const ids = WOOD_BUILDINGS[species];
  itemTextures[ids.door] = `mcl_doors_door_${species}`;
  itemTextures[ids.fence] = `mcl_fences_fence_${species}`;
  itemTextures[ids.gate] = `mcl_fences_fence_gate_${species}`;
}
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
export const mobImage = (name) => {
  if (name === 'stray_cloth' && !images.has(name)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const c = canvas.getContext('2d');
    c.fillStyle = '#718996';
    c.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        c.fillStyle = (x * 7 + y * 11) % 9 < 2 ? '#9aafba' : '#607580';
        if ((x * 3 + y * 5) % 7 < 3) c.fillRect(x, y, 1, 1);
      }
    images.set(name, canvas);
  }
  return images.get(name);
};
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
  if (kind === 'jungleSapling') return itemImage(kind);
  const names = plantTextures[kind];
  return names && images.get(names[Math.min(stage, names.length - 1)]);
};
const generatedItems = new Map();
let berriesImage;
export const itemImage = (id) => {
  if (id === 'jungleSapling') {
    if (!generatedItems.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      paintJungle(canvas.getContext('2d'), id);
      generatedItems.set(id, canvas);
    }
    return generatedItems.get(id);
  }
  if (isWool(id)) {
    if (!generatedItems.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      paintPackTile(canvas.getContext('2d'), id, true);
      generatedItems.set(id, canvas);
    }
    return generatedItems.get(id);
  }
  if (DYE_ITEMS[id] || isPigmentPlant(id)) {
    if (!generatedItems.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      paintPigment(canvas.getContext('2d'), id);
      generatedItems.set(id, canvas);
    }
    return generatedItems.get(id);
  }
  if (id === 'slownessArrow') {
    if (!generatedItems.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const c = canvas.getContext('2d');
      c.drawImage(images.get(itemTextures.arrow), 0, 0, 16, 16);
      // Tint the existing arrowhead; preserve its pixel shading and alpha.
      const pixels = c.getImageData(11, 0, 5, 5);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light = pixels.data[i] / 255;
        pixels.data[i] = 100 * light;
        pixels.data[i + 1] = 164 * light;
        pixels.data[i + 2] = 205 * light;
      }
      c.putImageData(pixels, 11, 0);
      generatedItems.set(id, canvas);
    }
    return generatedItems.get(id);
  }
  if (id === 'powderSnowBucket') {
    if (!generatedItems.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const c = canvas.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(images.get(itemTextures.bucket), 0, 0, 16, 16);
      c.fillStyle = '#d3e7f1';
      c.fillRect(4, 5, 8, 3);
      c.fillStyle = '#f7fcff';
      c.fillRect(5, 4, 6, 2);
      c.fillStyle = '#a8c8dd';
      c.fillRect(5, 7, 2, 1);
      c.fillRect(10, 6, 1, 1);
      generatedItems.set(id, canvas);
    }
    return generatedItems.get(id);
  }

  if (id === 'netherQuartz' || id === 'netherQuartzOre') {
    if (!generatedItems.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const c = canvas.getContext('2d');
      if (id === 'netherQuartzOre') paintPackTile(c, id, false);
      else {
        // Original 16px shard; the same bitmap feeds UI, held and dropped items.
        const pixels = [
          '          s     ',
          '         sls    ',
          '        slws    ',
          '       slwws    ',
          '      slwwws    ',
          '     slwwwws    ',
          '    slwwwwws    ',
          '   slwwwwwws    ',
          '  slwwwwwwms    ',
          '  slwwwwwmms    ',
          '   slwwwmmms    ',
          '    slwmmmss    ',
          '     smmmss     ',
          '      smss      ',
          '       ss       ',
        ];
        const palette = {
          s: '#8d8273',
          m: '#c6bca8',
          l: '#fff9e6',
          w: '#e9e0cb',
        };
        pixels.forEach((row, y) =>
          [...row].forEach((v, x) => {
            if (palette[v]) {
              c.fillStyle = palette[v];
              c.fillRect(x, y, 1, 1);
            }
          }),
        );
      }
      generatedItems.set(id, canvas);
    }
    return generatedItems.get(id);
  }
  if (id === 'glowBerries') {
    if (!berriesImage) {
      berriesImage = document.createElement('canvas');
      berriesImage.width = berriesImage.height = 16;
      const c = berriesImage.getContext('2d');
      c.fillStyle = '#537a32';
      c.fillRect(7, 1, 2, 7);
      c.fillRect(3, 3, 9, 2);
      c.fillStyle = '#d97726';
      c.fillRect(2, 7, 6, 6);
      c.fillRect(9, 6, 5, 6);
      c.fillStyle = '#f7b448';
      c.fillRect(3, 7, 4, 5);
      c.fillRect(9, 6, 4, 5);
      c.fillStyle = '#ffe49b';
      c.fillRect(3, 7, 2, 2);
      c.fillRect(9, 6, 2, 2);
    }
    return berriesImage;
  }
  if (!POTIONS[id]) return images.get(itemTextures[id]);
  if (!generatedItems.has(id)) {
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
    generatedItems.set(id, canvas);
  }
  return generatedItems.get(id);
};
export const bowImage = (stage) =>
  images.get(stage < 0 ? 'mcl_bows_bow' : 'mcl_bows_bow_' + stage);
export const effectImage = (name) => images.get(name);
export async function loadTexturePack() {
  const names = new Set([
    ...Object.values(blockTextures).flat(),
    ...Object.values(itemTextures),
    ...Object.values(plantTextures).flat(),
    ...mobTextures,
    'mcl_core_grass_block_side_overlay',
    'mcl_core_palette_grass',
    'mcl_core_palette_foliage',
    'mcl_bows_bow_0',
    'mcl_bows_bow_1',
    'mcl_bows_bow_2',
    'mcl_potions_potion_bottle',
    'mcl_potions_potion_overlay',
    'mcl_campfires_campfire_fire',
    'mcl_campfires_soul_campfire_fire',
    'mcl_campfires_particle_1',
    'mcl_portals_portal',
    'crack_anylength',
    'mcl_moon_moon_phases',
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
export function paintPackTile(ctx, id, top, grassOverlay = true) {
  if (id === 'vine') {
    paintVine(ctx);
    return;
  }
  if (paintJungle(ctx, id, top)) return;
  if (id === 'powderSnow') {
    paintPackTile(ctx, 'snow', top);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 3 ? '#c8dce9' : '#f6fcff';
      ctx.fillRect(
        (i * 7 + 3) % 16,
        (i * 11 + (top ? 2 : 5)) % 16,
        (i % 2) + 1,
        1,
      );
    }
    return;
  }

  if (id === 'netherQuartzOre') {
    ctx.fillStyle = '#754236';
    ctx.fillRect(0, 0, 16, 16);
    paintPackTile(ctx, 'netherrack', top);
    // Independently drawn veins over the project's existing netherrack tile.
    for (const [x, y] of [
      [2, 2],
      [5, 7],
      [10, 3],
      [12, 11],
    ]) {
      ctx.fillStyle = '#a68e7b';
      ctx.fillRect(x - 1, y, 3, 4);
      ctx.fillStyle = '#e1d7bd';
      ctx.fillRect(x, y, 2, 3);
      ctx.fillStyle = '#fff3d8';
      ctx.fillRect(x, y, 1, 2);
    }
    return;
  }
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
  const frame = id === 'stonecutterSaw2' ? 1 : id === 'stonecutterSaw3' ? 2 : 0;
  ctx.drawImage(image, 0, frame * 16, 16, 16, 0, 0, 16, 16);
  if (isWool(id)) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = WOOL_BLOCKS[id].color;
    ctx.fillRect(0, 0, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
  }
  const leafTint = id === 'leaves' ? '#79a94d' : WOOD_BLOCKS[id]?.leafTint;
  if (leafTint || (id === 'grass' && top)) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = leafTint || '#91b95d';
    ctx.fillRect(0, 0, 16, 16);
    if (leafTint) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(image, 0, 0, 16, 16);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (id === 'grass' && !top && grassOverlay) {
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
