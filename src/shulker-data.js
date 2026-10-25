export const SHULKER_ITEMS = {
  shulkerShell: { name: '潜影壳', color: '#a878b5' },
};
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
