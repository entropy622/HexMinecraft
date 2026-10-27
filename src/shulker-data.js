export const SHULKER_ITEMS = {
  shulkerShell: { name: '潜影壳', color: '#a878b5' },
};
export const PORTABLE_SLOTS = 27;
export const SHULKER_BLOCKS = {
  shulkerBox: {
    name: '潜影盒',
    color: '#a878b5',
    side: '#825a93',
    hardness: 1.2,
    storage: PORTABLE_SLOTS,
    portable: true,
  },
};
export const SHULKER_RECIPES = [
  {
    id: 'shulkerBox',
    count: 1,
    station: true,
    title: '把仓库带上天空',
    desc: '上下各一枚潜影壳夹住储物箱；拆除后保留内部 27 格物资，不能把潜影盒放入另一个潜影盒。',
    pattern: [null, 'shulkerShell', null, 'chest', null, 'shulkerShell', null],
    cost: { shulkerShell: 2, chest: 1 },
  },
];
// Six horizontal face normals plus floor and ceiling in the hexagonal world.
export const SHULKER_NORMALS = [
  [0, 1, 0],
  [0, -1, 0],
  ...Array.from({ length: 6 }, (_, i) => [
    Math.cos((i * Math.PI) / 3),
    0,
    Math.sin((i * Math.PI) / 3),
  ]),
];
