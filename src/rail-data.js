export const RAIL_BLOCKS = {
  rail: {
    name: '铁轨',
    color: '#a49b87',
    hardness: 0.4,
    tile: 'ironBlock',
    shape: 'rail',
    nonSolid: true,
  },
  poweredRail: {
    name: '动力铁轨',
    color: '#cdae59',
    hardness: 0.5,
    tile: 'ironBlock',
    shape: 'rail',
    nonSolid: true,
  },
  detectorRail: {
    name: '探测铁轨',
    color: '#af795c',
    hardness: 0.5,
    tile: 'ironBlock',
    shape: 'rail',
    nonSolid: true,
  },
};
export const CART_ITEMS = {
  minecart: { name: '矿车', color: '#999c9f', use: true, maxStack: 1 },
  chestCart: { name: '运输矿车', color: '#956839', use: true, maxStack: 1 },
};
export const isRail = (id) => Object.hasOwn(RAIL_BLOCKS, id);
export const RAIL_RECIPES = [
  ['rail', 12, ['ingot', null, 'ingot', 'stick', 'ingot', null, 'ingot']],
  [
    'poweredRail',
    6,
    [
      'goldIngot',
      null,
      'goldIngot',
      'stick',
      'goldIngot',
      'redstone',
      'goldIngot',
    ],
  ],
  [
    'detectorRail',
    6,
    [
      'ingot',
      null,
      'ingot',
      'stonePressurePlate',
      'ingot',
      'redstone',
      'ingot',
    ],
  ],
  ['minecart', 1, ['ingot', null, 'ingot', null, 'ingot', 'rail', 'ingot']],
  ['chestCart', 1, [null, 'chest', null, 'minecart', null, null, null]],
].map(([id, count, pattern]) => ({
  id,
  count,
  pattern,
  station: true,
  title: (RAIL_BLOCKS[id] || CART_ITEMS[id]).name,
  desc: {
    rail: '沿六个方向连接，可转弯和爬坡。',
    poweredRail: '通电加速，断电制动。',
    detectorRail: '车辆经过时输出红石信号。',
    minecart: '对准铁轨放置；右键乘坐，Shift 下车。',
    chestCart: '右键开箱，漏斗可以装卸货物。',
  }[id],
  cost: pattern
    .filter(Boolean)
    .reduce((s, i) => ((s[i] = (s[i] || 0) + 1), s), {}),
}));
