export const FURNACES = {
  furnace: { name: '熔炉', speed: 1, hint: '通用烧炼' },
  blastFurnace: {
    name: '高炉',
    speed: 2,
    group: 'ore',
    hint: '仅矿石与原矿 · 两倍速度',
  },
  smoker: {
    name: '烟熏炉',
    speed: 2,
    group: 'food',
    hint: '仅食物 · 两倍速度',
  },
};
export const isFurnace = (id) => Object.hasOwn(FURNACES, id);
export const PROCESSING_BLOCKS = {
  blastFurnace: { name: '高炉', color: '#9a9d97', hardness: 3.5, tool: 1 },
  smoker: { name: '烟熏炉', color: '#877562', hardness: 3.5, tool: 1 },
  stonecutter: {
    name: '切石机',
    color: '#a3a29a',
    hardness: 3.5,
    tool: 1,
    shape: 'stonecutter',
  },
  smoothStone: { name: '平滑石', color: '#b2b4b1', hardness: 2, tool: 1 },
  smoothStoneSlab: {
    name: '平滑石半砖',
    color: '#b2b4b1',
    hardness: 2,
    tool: 1,
    base: 'smoothStone',
    tile: 'smoothStoneSlab',
    shape: 'slab',
  },
};
export const PROCESSING_RECIPES = [
  {
    id: 'blastFurnace',
    count: 1,
    station: true,
    pattern: [
      'ingot',
      'ingot',
      'ingot',
      'furnace',
      'smoothStone',
      'smoothStone',
      'smoothStone',
    ],
    patternCounts: [2, 1, 2, 1, 1, 1, 1],
    cost: { ingot: 5, furnace: 1, smoothStone: 3 },
    desc: '五铁锭、三平滑石与熔炉。只炼矿石 / 原矿，速度与燃料消耗均为两倍。',
  },
  {
    id: 'smoker',
    count: 1,
    station: true,
    pattern: [null, 'wood', null, 'furnace', 'wood', 'wood', 'wood'],
    cost: { wood: 4, furnace: 1 },
    desc: '四份任意原木包围熔炉。只烹饪食物，速度与燃料消耗均为两倍。',
  },
  {
    id: 'stonecutter',
    count: 1,
    station: true,
    pattern: [null, 'ingot', null, 'stone', 'stone', 'stone', null],
    cost: { ingot: 1, stone: 3 },
    desc: '一铁锭、三石头。放入石材、选产物，取出时才扣一份原料；不需要燃料。',
  },
  {
    id: 'smoothStoneSlab',
    count: 6,
    station: true,
    pattern: [
      null,
      null,
      'smoothStone',
      'smoothStone',
      'smoothStone',
      null,
      null,
    ],
    cost: { smoothStone: 3 },
    desc: '三平滑石制成六块半砖，也可在切石机一切二。',
  },
];
