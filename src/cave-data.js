export const CAVE_BLOCKS = {
  dripstoneBlock: {
    name: '滴水石块',
    color: '#a78670',
    side: '#92725d',
    hardness: 1.5,
    tool: 1,
  },
  pointedDripstone: {
    name: '滴水石锥',
    color: '#c49c80',
    side: '#a17a60',
    hardness: 1.5,
    shape: 'pointedDripstone',
  },
  caveVines: {
    name: '洞穴藤蔓',
    color: '#578b35',
    hardness: 0,
    shape: 'caveVines',
    nonSolid: true,
    internal: true,
  },
  caveVinesBerries: {
    name: '洞穴藤蔓 · 发光浆果',
    color: '#5e943d',
    hardness: 0,
    shape: 'caveVines',
    nonSolid: true,
    internal: true,
    light: '#ffc56b',
  },
  sporeBlossom: {
    name: '孢子花',
    color: '#d77a9c',
    side: '#a94f7a',
    hardness: 0,
    shape: 'sporeBlossom',
    nonSolid: true,
  },
  mossBlock: {
    name: '苔藓块',
    color: '#638c3d',
    side: '#587b36',
    hardness: 0.1,
  },
  calcite: {
    name: '方解石',
    color: '#dfdfd1',
    side: '#c5c8bc',
    hardness: 0.75,
    tool: 1,
  },
  tuff: {
    name: '凝灰岩',
    color: '#73786b',
    side: '#646b60',
    hardness: 1.5,
    tool: 1,
  },
};
export const CAVE_ITEMS = {
  glowBerries: { name: '发光浆果', color: '#f6af44', use: true },
};
export const isCaveVine = (type) =>
  type === 'caveVines' || type === 'caveVinesBerries';
export const isHangingPlant = (type) =>
  isCaveVine(type) || type === 'sporeBlossom';
export const CAVE_RECIPES = [
  {
    id: 'dripstoneBlock',
    count: 1,
    title: '沉积之石',
    pattern: [
      'pointedDripstone',
      'pointedDripstone',
      null,
      null,
      null,
      'pointedDripstone',
      'pointedDripstone',
    ],
    cost: { pointedDripstone: 4 },
    desc: '四根滴水石锥合成一块滴水石，可作为上方钟乳石缓慢生长的基座。',
  },
];
