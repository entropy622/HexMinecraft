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
  Telescope,
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
import { materialIconURL } from './material-icons.js';
import { CAVE_BLOCKS } from './cave-data.js';
import { CIRCUIT_BLOCKS } from './redstone-data.js';
import { AMETHYST_BLOCKS } from './amethyst-data.js';
// Named imports keep the bundled icon set small; SVGs work offline on Pages.
const symbols = {
  spyglass: Telescope,
  amethystShard: Gem,
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
export const clearItemIcons = () => cache.clear();
export function itemIcon(id) {
  if (!cache.has(id)) {
    if (id === 'workbench') {
      const [top, side] = blockTextures.workbench.map(textureURL);
      const face = (part, src) =>
        '<img class="bench-' +
        part +
        '" src="' +
        src +
        '" alt="" draggable="false">';
      const art =
        '<span class="block-icon pixel-icon workbench-icon" title="工作台">' +
        face('left', side) +
        face('right', side) +
        face('top', top) +
        '</span>';
      cache.set(id, art);
      return art;
    }
    if (
      [
        'stick',
        'minecart',
        'chestCart',
        'rail',
        'poweredRail',
        'detectorRail',
      ].includes(id)
    ) {
      const rail = id.toLowerCase().includes('rail'),
        metal = id === 'poweredRail' ? '#f2bd43' : '#c7d2d4';
      const glyph =
        id === 'stick'
          ? '<path stroke="#62432c" stroke-width="3" d="M3 14 13 3"/><path stroke="#bd9464" stroke-width="1.5" d="M3 13 12 3"/>'
          : rail
            ? '<path stroke="#8c603b" stroke-width="2.7" d="M2 5h12M2 11h12"/><path stroke="' +
              metal +
              '" stroke-width="2" d="M5 1v14M11 1v14"/>' +
              (id === 'detectorRail'
                ? '<path fill="#bd684c" d="M6 6h4v4H6z"/>'
                : '')
            : '<path fill="#384147" d="M1 6h14l-2 7H3zM3 13h3v2H3zm7 0h3v2h-3z"/><path fill="#9caaae" d="M2 7h12l-2 4H4z"/>' +
              (id === 'chestCart'
                ? '<path fill="#a5783f" stroke="#644a32" d="M4 2h8v6H4z"/><path fill="#dfbc68" d="M7 4h2v3H7z"/>'
                : '');
      const art =
        '<span class="block-icon pixel-icon item-tile"><svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">' +
        glyph +
        '</svg></span>';
      cache.set(id, art);
      return art;
    }
    if (materialIconURL(id, 'top') || materialIconURL(id, 'side')) {
      cache.set(id, cutBlockIcon(id));
      return cache.get(id);
    }
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
      AMETHYST_BLOCKS[id] ||
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
