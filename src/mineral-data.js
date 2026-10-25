export const MINERAL_BLOCKS = {
  cobble: {
    name: '圆石',
    color: '#93958e',
    side: '#777c79',
    hardness: 2,
    tool: 1,
  },
  cobbledDeepslate: {
    name: '深板岩圆石',
    color: '#56595b',
    side: '#42464a',
    hardness: 3.5,
    tool: 1,
  },
  coalBlock: {
    name: '煤炭块',
    color: '#35363a',
    side: '#25262b',
    hardness: 5,
    tool: 1,
  },
  diamondBlock: {
    name: '钻石块',
    color: '#7de0df',
    side: '#57b9c7',
    hardness: 5,
    tool: 3,
  },
  rawIronBlock: {
    name: '粗铁块',
    color: '#bd9980',
    side: '#9a7d6a',
    hardness: 5,
    tool: 2,
  },
  rawGoldBlock: {
    name: '粗金块',
    color: '#d4b64b',
    side: '#aa8a3c',
    hardness: 5,
    tool: 3,
  },
  rawCopperBlock: {
    name: '粗铜块',
    color: '#ba8b65',
    side: '#8c7960',
    hardness: 5,
    tool: 2,
  },
};
export const MINERAL_ITEMS = {
  coal: { name: '煤炭', color: '#36363b' },
  diamond: { name: '钻石', color: '#76e1e1' },
  rawIron: { name: '粗铁', color: '#c8a68c' },
  rawGold: { name: '粗金', color: '#e5c557' },
  rawCopper: { name: '粗铜', color: '#c28b65' },
};
export const MINERAL_ICON_BLOCKS = new Set([
  ...Object.keys(MINERAL_BLOCKS),
  'stone',
  'deepslate',
  'coalOre',
  'ironOre',
  'goldOre',
  'copperOre',
  'diamondOre',
  'lapisOre',
  'redstoneOre',
]);
export const MINERAL_RECIPES = Object.entries({
  coal: 'coalBlock',
  diamond: 'diamondBlock',
  rawIron: 'rawIronBlock',
  rawGold: 'rawGoldBlock',
  rawCopper: 'rawCopperBlock',
}).flatMap(([item, block]) => [
  {
    id: block,
    count: 1,
    station: true,
    pattern: Array(7).fill(item),
    patternCounts: [1, 1, 1, 3, 1, 1, 1],
    cost: { [item]: 9 },
    desc: '九份资源压成一个六棱储存块，中心放三份。',
  },
  {
    id: item,
    count: 9,
    pattern: [null, null, null, block, null, null, null],
    cost: { [block]: 1 },
    desc: '拆开储存块，取回九份资源。',
  },
]);
