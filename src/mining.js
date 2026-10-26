import { BLOCKS, ITEMS } from './core.js';
import { woodKey } from './wood-data.js';

const PICK_REQUIRED = new Set([
  'stone',
  'cobble',
  'cobbledDeepslate',
  'deepslate',
  'brick',
  'mossybrick',
  'sandstone',
  'basalt',
  'netherrack',
  'endstone',
  'endstoneBricks',
  'purpur',
  'purpurPillar',
  'netherbrick',
  'furnace',
  'anvil',
  'chippedAnvil',
  'damagedAnvil',
  'grindstone',
  'brewingStand',
  'ironBlock',
  'goldBlock',
  'copperBlock',
  'spawner',
]);
const AXE = new Set([
  'wood',
  'planks',
  'workbench',
  'chest',
  'crimsonwood',
  'bookshelf',
  'door',
  'doorTop',
  'fence',
  'gate',
  'ladder',
  'bed',
  'chorusPlant',
  'chorusFlower',
  'chorusFlowerDead',
]);
const SHOVEL = new Set([
  'grass',
  'dirt',
  'sand',
  'gravel',
  'snow',
  'farmland',
  'soulSand',
]);

export function miningStats(block, held, enchant = {}) {
  const original = BLOCKS[block] || {},
    base = ITEMS[block]?.base || block;
  const def = BLOCKS[base] || original,
    item = ITEMS[held];
  const material = def.foliage
    ? 'leaves'
    : def.wooden
      ? 'planks'
      : woodKey(base);
  const kind =
    material === 'hayBale' || material === 'mossBlock'
      ? 'hoe'
      : material === 'leaves' || material === 'wool'
        ? 'shears'
        : AXE.has(material)
          ? 'axe'
          : SHOVEL.has(material)
            ? 'shovel'
            : material === 'glass' || material === 'shroom'
              ? null
              : 'pick';
  const requiredTier = def.tool || (PICK_REQUIRED.has(material) ? 1 : 0);
  const requiredTool = requiredTier
    ? 'pick'
    : material === 'snow'
      ? 'shovel'
      : null;
  const tier = item?.kind === 'pick' ? item.tier : 0;
  const harvest =
    !requiredTool ||
    (item?.kind === requiredTool &&
      (requiredTool !== 'pick' || tier >= requiredTier));
  const effective = !!kind && item?.kind === kind;
  const baseSpeed = !effective
    ? 1
    : kind === 'shears'
      ? 15
      : [1, 2, 4, 6, 8][item.tier] || 1;
  const efficiency =
    effective && baseSpeed > 1 && enchant.efficiency
      ? enchant.efficiency ** 2 + 1
      : 0;
  return {
    tier,
    kind,
    requiredTier,
    requiredTool,
    harvest,
    effective,
    speed: baseSpeed + efficiency,
  };
}
export function miningRate(
  stats,
  { underwater = false, grounded = true, aquaAffinity = false } = {},
) {
  return (
    stats.speed /
    (stats.harvest ? 1.5 : 5) /
    (underwater && !aquaAffinity ? 5 : 1) /
    (grounded ? 1 : 5)
  );
}
