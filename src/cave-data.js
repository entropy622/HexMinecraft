export const CAVE_BLOCKS = {
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
