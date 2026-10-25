// Pixel Perfection / VoxeLibre. Asset provenance and licenses: public/textures/NOTICE.md.
export const blockTextures = {
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
  furnace: ['default_furnace_top', 'default_furnace_front_active'],
  farmland: ['mcl_farming_farmland_wet', 'default_dirt'],
  glowstone: ['mcl_nether_glowstone'],
  bedrock: ['mcl_core_bedrock'],
  wool: ['wool_white'],
};
export const itemTextures = {
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
  wheat: 'farming_wheat_harvested',
  seed: 'mcl_farming_wheat_seeds',
  bucket: 'mcl_buckets_bucket',
  waterBucket: 'mcl_buckets_water_bucket',
  lavaBucket: 'mcl_buckets_lava_bucket',
};
export const textureURL = (name) =>
  `${import.meta.env.BASE_URL}textures/pixel-perfection/${name}.png`;
const images = new Map();
const plantTextures = {
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
  sugarCane: ['mcl_core_reeds'],
};
export const plantImage = (kind, stage) => {
  const names = plantTextures[kind];
  return names && images.get(names[Math.min(stage, names.length - 1)]);
};
export const itemImage = (id) => images.get(itemTextures[id]);
export const bowImage = (stage) =>
  images.get(stage < 0 ? 'mcl_bows_bow' : 'mcl_bows_bow_' + stage);
export async function loadTexturePack() {
  const names = new Set([
    ...Object.values(blockTextures).flat(),
    ...Object.values(itemTextures),
    ...Object.values(plantTextures).flat(),
    'mcl_core_grass_block_side_overlay',
    'mcl_bows_bow_0',
    'mcl_bows_bow_1',
    'mcl_bows_bow_2',
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
  ctx.drawImage(image, 0, 0, 16, 16);
  if (id === 'leaves' || (id === 'grass' && top)) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = id === 'leaves' ? '#79a94d' : '#91b95d';
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
