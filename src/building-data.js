export const BUILDING_BLOCKS = {
  door: { name: '橡木门', color: '#bc945d', hardness: 0.6, shape: 'door' },
  doorTop: {
    name: '橡木门',
    color: '#bc945d',
    hardness: 0.6,
    shape: 'door',
    internal: true,
    drop: 'door',
  },
  fence: { name: '橡木围栏', color: '#b78e55', hardness: 0.6, shape: 'fence' },
  gate: { name: '栅栏门', color: '#b78e55', hardness: 0.6, shape: 'gate' },
  ladder: {
    name: '木梯',
    color: '#c4a575',
    hardness: 0.3,
    shape: 'ladder',
    nonSolid: true,
  },
};
const make = (id, count, pattern, desc) => {
  const cost = {};
  for (const item of pattern) if (item) cost[item] = (cost[item] || 0) + 1;
  return {
    id,
    count,
    pattern,
    cost,
    desc,
    title: BUILDING_BLOCKS[id].name,
    station: true,
  };
};
export const BUILDING_RECIPES = [
  make(
    'door',
    2,
    ['planks', 'planks', null, 'planks', 'planks', 'planks', 'planks'],
    '两格高的木门。放置时面向决定朝向，E 开关。',
  ),
  make(
    'fence',
    4,
    ['planks', 'wood', 'planks', null, 'planks', 'wood', 'planks'],
    '自动向六个方向连接围栏、栅栏门和实心方块，适合牧场。',
  ),
  make(
    'gate',
    1,
    ['wood', 'planks', 'wood', null, 'wood', 'planks', 'wood'],
    'E 开关，为围栏留一个出入口。',
  ),
  make(
    'ladder',
    6,
    ['wood', null, 'wood', 'wood', 'wood', null, 'wood'],
    '贴在实心墙面，靠近后 W / 空格向上，Shift 向下，Ctrl 停住。',
  ),
];

export const CUT_MATERIALS = [
  ['planks', '橡木', '#c6a16c', 0.45],
  ['stone', '岩石', '#a0aaa5', 1.25],
  ['brick', '石砖', '#bcc4b7', 0.8],
  ['sandstone', '砂岩', '#d6bf85', 0.9],
  ['netherbrick', '下界砖', '#593841', 1.4],
  ['purpur', '紫珀', '#b48eaf', 1.3],
];
for (const [base, name, color, hardness] of CUT_MATERIALS) {
  for (const [suffix, shape, label] of [
    ['Slab', 'slab', '半砖'],
    ['Stairs', 'stairs', '楼梯'],
  ]) {
    const id = base + suffix;
    BUILDING_BLOCKS[id] = { name: name + label, base, color, hardness, shape };
    BUILDING_RECIPES.push(
      make(
        id,
        shape === 'slab' ? 6 : 4,
        shape === 'slab'
          ? [null, null, base, base, base, null, null]
          : [base, base, null, base, base, base, base],
        shape === 'slab'
          ? '瞄准下半面放下半砖，上半面或底面放上半砖；点击空着的半面可合并。'
          : '六个方向的半格楼梯，自动衔接转角；瞄准上半面或底面可倒置。',
      ),
    );
  }
}
