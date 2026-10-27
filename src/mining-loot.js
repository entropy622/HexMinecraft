import { BLOCKS } from './core.js';
import { leafDrops } from './leaves.js';

const ORES = {
  netherQuartzOre: ['netherQuartz', 1, 1, [2, 5]],
  coalOre: ['coal', 1, 1, [0, 2]],
  diamondOre: ['diamond', 1, 1, [3, 7]],
  ironOre: ['rawIron', 1, 1],
  goldOre: ['rawGold', 1, 1],
  copperOre: ['rawCopper', 2, 5],
  lapisOre: ['lapis', 4, 9, [2, 5]],
  redstoneOre: ['redstone', 4, 5, [1, 5]],
};
const SILK_EXCLUDED = new Set([
  'spawner',
  'portal',
  'endportal',
  'endGateway',
  'bedrock',
  'farmland',
]);
const integer = (random, low, high) =>
  low + Math.floor(random() * (high - low + 1));
// Fortune uses the ore multiplier distribution, not a flat guaranteed bonus.
export const fortuneMultiplier = (level, random = Math.random) =>
  Math.max(0, integer(random, 0, level + 1) - 1) + 1;
export function miningLoot(
  type,
  { harvest = true, tool = null, enchant = {}, random = Math.random } = {},
) {
  const block = BLOCKS[type];
  if (!block || !harvest || block.internal) return { stacks: [], xp: 0 };
  const fortune = Math.min(3, Math.max(0, enchant.fortune || 0));
  const silk = !!enchant.silkTouch && !SILK_EXCLUDED.has(type);
  const one = (item, count = 1, xp = 0) => ({ stacks: [{ item, count }], xp });
  if (type === 'cobweb')
    return tool === 'shears' || (tool === 'sword' && silk)
      ? one('cobweb')
      : tool === 'sword'
        ? one('string')
        : { stacks: [], xp: 0 };
  if (block.foliage)
    return {
      stacks: leafDrops(type, tool === 'shears' || silk, random, fortune),
      xp: 0,
    };
  if (silk) return one(type);
  const ore = ORES[type];
  if (ore) {
    const [item, low, high, experience] = ore;
    let count = integer(random, low, high);
    if (type === 'redstoneOre') count += integer(random, 0, fortune);
    else if (fortune) count *= fortuneMultiplier(fortune, random);
    return one(item, count, experience ? integer(random, ...experience) : 0);
  }
  if (type === 'gravel')
    return one(random() < [0.1, 1 / 7, 0.25, 1][fortune] ? 'flint' : 'gravel');
  if (type === 'snow')
    return tool === 'shovel' ? one('snowball', 4) : { stacks: [], xp: 0 };
  if (type === 'glass') return { stacks: [], xp: 0 };
  if (type === 'bookshelf') return one('book', 3);
  if (type === 'glowstone')
    return one(
      'glowDust',
      Math.min(4, integer(random, 2, 4) + integer(random, 0, fortune)),
    );
  const xp =
    type === 'spawner'
      ? integer(random, 15, 43)
      : type === 'crystal'
        ? integer(random, 2, 5)
        : 0;
  return one(block.drop || type, 1, xp);
}
