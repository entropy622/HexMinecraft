// One stable palette drives pigment names, glass materials and GPU indices.
export const DYES = Object.fromEntries(
  [
    ['white', '白色', '#f9fffe'],
    ['orange', '橙色', '#f9801d'],
    ['magenta', '品红色', '#c74ebd'],
    ['lightBlue', '淡蓝色', '#3ab3da'],
    ['yellow', '黄色', '#fed83d'],
    ['lime', '黄绿色', '#80c71f'],
    ['pink', '粉红色', '#f38baa'],
    ['gray', '灰色', '#474f52'],
    ['lightGray', '淡灰色', '#9d9d97'],
    ['cyan', '青色', '#169c9c'],
    ['purple', '紫色', '#8932b8'],
    ['blue', '蓝色', '#3c44aa'],
    ['brown', '棕色', '#835432'],
    ['green', '绿色', '#5e7c16'],
    ['red', '红色', '#b02e26'],
    ['black', '黑色', '#1d1d21'],
  ].map(([id, name, color]) => [id, { name, color }]),
);
export const GLASS_OPACITY = 0.38;
export const GLASS_BLOCKS = {
  glass: {
    name: '琥珀玻璃',
    color: '#edcc88',
    side: '#b89762',
    hardness: 0.3,
    opacity: GLASS_OPACITY,
  },
  ...Object.fromEntries(
    Object.entries(DYES).map(([id, { name, color }]) => [
      id + 'StainedGlass',
      {
        name: name + '染色玻璃',
        color,
        side: color,
        hardness: 0.3,
        opacity: GLASS_OPACITY,
      },
    ]),
  ),
};
export const GLASS_TYPES = Object.keys(GLASS_BLOCKS);
export const isGlass = (id) => Object.hasOwn(GLASS_BLOCKS, id);
export const PIGMENT_PLANTS = {
  poppy: {
    name: '虞美人',
    color: '#db3c35',
    hardness: 0,
    shape: 'flower',
    nonSolid: true,
  },
  dandelion: {
    name: '蒲公英',
    color: '#f4d334',
    hardness: 0,
    shape: 'flower',
    nonSolid: true,
  },
  cactusFlower: {
    name: '仙人掌花',
    color: '#e591c3',
    hardness: 0,
    shape: 'flower',
    nonSolid: true,
  },
  cactus: {
    name: '仙人掌',
    color: '#638a36',
    side: '#3e6529',
    hardness: 0.4,
    shape: 'cactus',
  },
};
export const isPigmentPlant = (id) => Object.hasOwn(PIGMENT_PLANTS, id);
export const DYE_ITEMS = {
  ...Object.fromEntries(
    Object.entries(DYES).map(([id, { name, color }]) => [
      id + 'Dye',
      { name: name + '染料', color, use: true },
    ]),
  ),
  inkSac: { name: '墨囊', color: '#30313b', use: true },
  cocoaBeans: { name: '可可豆', color: '#845333', use: true },
};
export const dyeColor = (id) => {
  const color = id?.endsWith('Dye') ? id.slice(0, -3) : null;
  return Object.hasOwn(DYES, color) ? color : null;
};
const recipe = (id, ingredients, count = 1) => {
  const pattern = Array(7).fill(null);
  ingredients.forEach((id, i) => (pattern[i] = id));
  const cost = {};
  for (const id of ingredients) cost[id] = (cost[id] || 0) + 1;
  return {
    id,
    count,
    pattern,
    cost,
    title: DYE_ITEMS[id].name,
    desc: '将原料制成染料，或按材料份数混合新颜色。',
  };
};
export const DYE_RECIPES = [
  ...[
    ['white', 'boneMeal'],
    ['blue', 'lapis'],
    ['red', 'poppy'],
    ['yellow', 'dandelion'],
    ['pink', 'cactusFlower'],
    ['black', 'inkSac'],
    ['brown', 'cocoaBeans'],
  ].map(([color, source]) => recipe(color + 'Dye', [source])),
  ...[
    ['orange', 'red', 'yellow'],
    ['pink', 'red', 'white'],
    ['purple', 'red', 'blue'],
    ['lightBlue', 'blue', 'white'],
    ['lime', 'green', 'white'],
    ['cyan', 'blue', 'green'],
    ['gray', 'black', 'white'],
    ['lightGray', 'gray', 'white'],
    ['magenta', 'purple', 'pink'],
  ].map(([out, a, b]) => recipe(out + 'Dye', [a + 'Dye', b + 'Dye'], 2)),
  ...Object.entries(DYES).map(([color, { name }]) => ({
    id: color + 'StainedGlass',
    count: 8,
    station: true,
    title: name + '染色玻璃',
    desc: '八块普通玻璃加一份染料，制成八块染色玻璃。',
    pattern: [
      'glass',
      'glass',
      'glass',
      color + 'Dye',
      'glass',
      'glass',
      'glass',
    ],
    patternCounts: [2, 1, 1, 1, 1, 1, 2],
    cost: { glass: 8, [color + 'Dye']: 1 },
  })),
];
