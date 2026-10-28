import { DYE_ITEMS, isGlass, isPigmentPlant } from './dye-data.js';
import { isWool } from './wool-data.js';
import {
  createElement,
  Pickaxe,
  Sword,
  Wheat,
  Beef,
  Sandwich,
  Flame,
  Orbit,
  Gem,
  Logs,
  BrickWall,
  BedDouble,
  Anvil,
  Cog,
  Fence,
  Mountain,
  CircleDot,
  Bean,
  Sprout,
  Snowflake,
  Hexagon,
  DoorOpen,
  Hammer,
  Package,
  Lamp,
  Cloud,
  Layers,
  TreePine,
  Leaf,
  Grid2X2,
  CookingPot,
  Apple,
  Axe,
  PaintBucket,
} from 'lucide';
import {
  blockTextures,
  itemTextures,
  textureURL,
  itemImage,
} from './texture-pack.js';
import { ITEMS } from './core.js';
import { POTIONS, potionDescription } from './brewing-data.js';
import { cutBlockIcon } from './shape-icons.js';
import { MINERAL_ICON_BLOCKS } from './mineral-data.js';

import { PROCESSING_BLOCKS } from './processing-data.js';
import { CAVE_BLOCKS } from './cave-data.js';
import { CIRCUIT_BLOCKS } from './redstone-data.js';
// Named imports keep the bundled icon set small; SVGs work offline on Pages.
const symbols = {
  blazeRod: Flame,
  brewingStand: CookingPot,
  anvil: Anvil,
  chippedAnvil: Anvil,
  damagedAnvil: Anvil,
  grindstone: Cog,
  emerald: Gem,
  bucket: PaintBucket,
  waterBucket: PaintBucket,
  lavaBucket: PaintBucket,
  glowBucket: PaintBucket,
  grass: Sprout,
  dirt: Layers,
  stone: Mountain,
  sand: Bean,
  wood: Logs,
  leaves: Leaf,
  planks: Fence,
  crystal: Gem,
  coal: Mountain,
  iron: Gem,
  brick: BrickWall,
  glass: Hexagon,
  lantern: Lamp,
  workbench: Hammer,
  furnace: CookingPot,
  chest: Package,
  bed: BedDouble,
  farmland: Grid2X2,
  snow: Snowflake,
  netherrack: Flame,
  basalt: Mountain,
  crimsonwood: TreePine,
  shroom: Cloud,
  glowstone: Lamp,
  endstone: CircleDot,
  obsidian: Layers,
  diamond: Gem,
  portal: DoorOpen,
  endportal: Orbit,
  bedrock: BrickWall,
  pick1: Pickaxe,
  pick2: Pickaxe,
  pick3: Pickaxe,
  pick4: Pickaxe,
  pearl: Orbit,
  ember: Flame,
  sword: Sword,
  hoe: Axe,
  ingot: Anvil,
  seed: Bean,
  wheat: Wheat,
  apple: Apple,
  bread: Sandwich,
  meat: Beef,
  cooked: Beef,
};
const cache = new Map();
export function itemIcon(id) {
  if (!cache.has(id)) {
    if (
      DYE_ITEMS[id] ||
      isPigmentPlant(id) ||
      [
        'glowBerries',
        'netherQuartz',
        'netherQuartzOre',
        'powderSnowBucket',
        'slownessArrow',
      ].includes(id)
    ) {
      cache.set(
        id,
        `<span class="block-icon pixel-icon ${id === 'netherQuartzOre' ? 'block-tile' : 'item-tile'}" title="${ITEMS[id].name}"><img src="${itemImage(id).toDataURL()}" alt="" draggable="false"></span>`,
      );
      return cache.get(id);
    }
    if (
      ITEMS[id]?.portable ||
      isGlass(id) ||
      isWool(id) ||
      PROCESSING_BLOCKS[id] ||
      CAVE_BLOCKS[id] ||
      CIRCUIT_BLOCKS[id] ||
      MINERAL_ICON_BLOCKS.has(id) ||
      (ITEMS[id]?.pillar && blockTextures[id]) ||
      [
        'slab',
        'carpet',
        'stairs',
        'egg',
        'rod',
        'chorus',
        'chorusFlower',
        'trapdoor',
      ].includes(ITEMS[id]?.shape)
    ) {
      cache.set(id, cutBlockIcon(id));
      return cache.get(id);
    }
    if (POTIONS[id]) {
      const bottle = textureURL('mcl_potions_potion_bottle'),
        overlay = textureURL('mcl_potions_potion_overlay');
      cache.set(
        id,
        `<span class="block-icon pixel-icon item-tile potion-icon" title="${potionDescription(id)}"><span class="potion-liquid" style="background:${POTIONS[id].color};mask-image:url('${overlay}')"></span><img src="${bottle}" alt="" draggable="false"></span>`,
      );
      return cache.get(id);
    }
    if (ITEMS[id]?.foliage) {
      cache.set(
        id,
        `<span class="block-icon pixel-icon block-tile" title="${ITEMS[id].name}"><span style="display:inline-flex;width:85%;height:85%;clip-path:var(--hex);background:${ITEMS[id].leafTint};isolation:isolate;mask-image:url('${textureURL(blockTextures[id][0])}');mask-size:100% 100%"><img src="${textureURL(blockTextures[id][0])}" alt="" draggable="false" style="width:100%;height:100%;mix-blend-mode:multiply"></span></span>`,
      );
      return cache.get(id);
    }
    const tile =
      itemTextures[id] ||
      (![
        'grass',
        'leaves',
        'anvil',
        'chippedAnvil',
        'damagedAnvil',
        'grindstone',
        'brewingStand',
      ].includes(id)
        ? blockTextures[id]?.at(-1)
        : null);
    if (tile) {
      const shape = blockTextures[id] ? 'block-tile' : 'item-tile';
      const label = ITEMS[id]?.name || id;
      cache.set(
        id,
        `<span class="block-icon pixel-icon ${shape}" title="${label}"><img src="${textureURL(tile)}" alt="" draggable="false"></span>`,
      );
      return cache.get(id);
    }
    const svg = createElement(symbols[id] || Hexagon, {
      width: 24,
      height: 24,
      'stroke-width': 2.2,
      'aria-hidden': 'true',
      focusable: 'false',
    }).outerHTML;
    cache.set(
      id,
      `<span class="block-icon item-symbol" style="--block:${ITEMS[id]?.color || '#d5b778'}">${svg}</span>`,
    );
  }
  return cache.get(id);
}
