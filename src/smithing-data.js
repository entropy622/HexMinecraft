export const ANVILS = ['anvil', 'chippedAnvil', 'damagedAnvil'];
export const isSmithingStation = (id) =>
  ANVILS.includes(id) || id === 'grindstone';
export const SMITHING_BLOCKS = {
  ironBlock: {
    name: '铁块',
    color: '#d7d9d4',
    side: '#a6aaa8',
    hardness: 2.5,
    tool: 2,
  },
  anvil: {
    name: '铁砧',
    color: '#777c80',
    side: '#4b5057',
    hardness: 3,
    tool: 1,
  },
  chippedAnvil: {
    name: '开裂的铁砧',
    color: '#777c80',
    side: '#4b5057',
    hardness: 3,
    tool: 1,
  },
  damagedAnvil: {
    name: '损坏的铁砧',
    color: '#777c80',
    side: '#4b5057',
    hardness: 3,
    tool: 1,
  },
  grindstone: {
    name: '砂轮',
    color: '#b3af9e',
    side: '#8a8372',
    hardness: 2,
    tool: 1,
  },
};
export const SMITHING_RECIPES = [
  {
    id: 'ironBlock',
    count: 1,
    title: '压铸铁块',
    station: true,
    pattern: ['ingot', 'ingot', 'ingot', 'ingot', 'ingot', 'ingot', 'ingot'],
    patternCounts: [1, 1, 1, 3, 1, 1, 1],
    cost: { ingot: 9 },
    desc: '九铁锭压成铁块，用于六棱铁砧，也可以装饰或压缩储存。',
  },
  {
    id: 'ingot',
    count: 9,
    title: '拆解铁块',
    station: false,
    pattern: [null, null, null, 'ironBlock', null, null, null],
    cost: { ironBlock: 1 },
    desc: '把铁块还原为九铁锭。',
  },
  {
    id: 'anvil',
    count: 1,
    title: '六棱铁砧',
    station: true,
    pattern: [
      'ironBlock',
      'ironBlock',
      'ironBlock',
      'ingot',
      'ingot',
      'ingot',
      'ingot',
    ],
    cost: { ironBlock: 3, ingot: 4 },
    desc: 'E 打开铁砧，消耗经验等级修复、合并或命名装备。附魔随装备保留，反复加工会变贵。',
  },
  {
    id: 'grindstone',
    count: 1,
    title: '六角砂轮',
    station: true,
    pattern: ['wood', 'stone', 'wood', null, 'planks', null, 'planks'],
    cost: { wood: 2, stone: 1, planks: 2 },
    desc: 'E 打开砂轮，免费祛除附魔并返还部分经验，或将两件同类装备合为一件修复。',
  },
];
