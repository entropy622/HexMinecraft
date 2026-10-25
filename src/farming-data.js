export const PLANTS = {
  wheat: {
    name: '小麦',
    seed: 'seed',
    seconds: 90,
    soil: ['farmland'],
    yield: { wheat: 2, seed: 2 },
  },
  carrot: {
    name: '胡萝卜',
    seed: 'carrot',
    seconds: 100,
    soil: ['farmland'],
    yield: { carrot: 3 },
  },
  potato: {
    name: '马铃薯',
    seed: 'potato',
    seconds: 110,
    soil: ['farmland'],
    yield: { potato: 3 },
  },
  sugarCane: {
    name: '甘蔗',
    seed: 'sugarCane',
    seconds: 120,
    soil: ['grass', 'dirt', 'sand'],
    yield: { sugarCane: 3 },
    perennial: true,
  },
  sapling: {
    name: '橡树苗',
    seed: 'sapling',
    seconds: 180,
    soil: ['grass', 'dirt', 'farmland'],
    yield: { sapling: 1 },
    tree: true,
  },
};
export const plantForItem = (id) =>
  Object.keys(PLANTS).find((kind) => PLANTS[kind].seed === id);
export const FARM_ITEMS = {
  sapling: { name: '橡树苗', color: '#719848', use: true },
  carrot: { name: '胡萝卜', color: '#eaa043', use: true },
  potato: { name: '马铃薯', color: '#d6bc7d', use: true },
  bakedPotato: { name: '烤马铃薯', color: '#ccaa6f', use: true },
  sugarCane: { name: '甘蔗', color: '#a2be64', use: true },
  sugar: { name: '糖', color: '#e8e6df' },
  paper: { name: '纸', color: '#e2dfc8' },
  book: { name: '书', color: '#a88659' },
};
export const FARM_BLOCKS = {
  bookshelf: { name: '书架', color: '#b69160', side: '#88623f', hardness: 0.6 },
};
const recipe = (id, count, pattern, title, desc, station = false) => {
  const cost = {};
  for (const item of pattern) if (item) cost[item] = (cost[item] || 0) + 1;
  return { id, count, pattern, cost, title, desc, station };
};
export const FARM_RECIPES = [
  recipe(
    'sugar',
    2,
    [null, null, null, 'sugarCane', null, null, null],
    '甘蔗制糖',
    '用于烘焙。',
  ),
  recipe(
    'paper',
    3,
    [null, 'sugarCane', null, 'sugarCane', null, 'sugarCane', null],
    '芦苇纸页',
    '三根甘蔗压成三张纸。',
  ),
  recipe(
    'book',
    1,
    ['paper', null, 'paper', 'leather', null, 'paper', null],
    '一本新书',
    '纸与皮革装订成书，用来制作书架。',
  ),
  recipe(
    'bookshelf',
    1,
    ['planks', 'planks', 'planks', 'book', 'book', 'book', 'planks'],
    '书香小屋',
    '带像素书脊的六棱书架，用来装饰家。',
    true,
  ),
];
export const validPlant = (p) =>
  p &&
  Object.hasOwn(PLANTS, p.kind) &&
  Number.isFinite(p.age) &&
  p.age >= 0 &&
  p.age <= PLANTS[p.kind].seconds;
