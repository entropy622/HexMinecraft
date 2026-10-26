import { TREES } from './wood-data.js';

export const WOOD_BUILDINGS = {};
export const BUILDING_BLOCKS = {
  ladder: {
    name: '木梯',
    color: '#c4a575',
    hardness: 0.3,
    shape: 'ladder',
    nonSolid: true,
    wooden: true,
  },
};
for (const [species, label, color] of [
  ['oak', '橡木', '#bc945d'],
  ['birch', '白桦木', '#d7c492'],
  ['spruce', '云杉木', '#8c6c48'],
]) {
  const prefix = species === 'oak' ? '' : species;
  const ids = (WOOD_BUILDINGS[species] = {
    door: prefix ? prefix + 'Door' : 'door',
    fence: prefix ? prefix + 'Fence' : 'fence',
    gate: prefix ? prefix + 'Gate' : 'gate',
    trapdoor: prefix ? prefix + 'Trapdoor' : 'trapdoor',
  });
  const planks = TREES[species].planks;
  for (const shape of ['door', 'fence', 'gate', 'trapdoor']) {
    const id = ids[shape];
    BUILDING_BLOCKS[id] = {
      name:
        label +
        { door: '门', fence: '围栏', gate: '栅栏门', trapdoor: '活板门' }[
          shape
        ],
      color,
      hardness: 0.6,
      shape,
      planks,
      wooden: true,
      fuel: shape === 'door' ? 10 : 15,
    };
  }
  BUILDING_BLOCKS[ids.door].doorUpper = ids.door + 'Top';
  BUILDING_BLOCKS[ids.door + 'Top'] = {
    ...BUILDING_BLOCKS[ids.door],
    doorUpper: null,
    doorLower: ids.door,
    internal: true,
    drop: ids.door,
  };
}
export const isDoor = (type) => BUILDING_BLOCKS[type]?.shape === 'door';
export const isDoorTop = (type) => !!BUILDING_BLOCKS[type]?.doorLower;
export const doorLower = (type) => BUILDING_BLOCKS[type]?.doorLower || type;
export const doorUpper = (type) => BUILDING_BLOCKS[type]?.doorUpper || null;
export const isFence = (type) => BUILDING_BLOCKS[type]?.shape === 'fence';
export const isGate = (type) => BUILDING_BLOCKS[type]?.shape === 'gate';
export const isTrapdoor = (type) => BUILDING_BLOCKS[type]?.shape === 'trapdoor';
export const isOpenable = (type) =>
  isDoor(type) || isGate(type) || isTrapdoor(type);
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
    exactWood:
      ['door', 'fence', 'gate', 'trapdoor'].includes(
        BUILDING_BLOCKS[id].shape,
      ) ||
      ['planks', 'birchPlanks', 'sprucePlanks'].includes(
        BUILDING_BLOCKS[id].base,
      ),
  };
};
export const BUILDING_RECIPES = [
  make(
    'ladder',
    6,
    ['wood', null, 'wood', 'wood', 'wood', null, 'wood'],
    '贴在实心墙面，靠近后 W / 空格向上，Shift 停住，松开缓慢下滑。',
  ),
];
for (const [species, ids] of Object.entries(WOOD_BUILDINGS)) {
  const { log, planks } = TREES[species];
  BUILDING_RECIPES.push(
    make(
      ids.door,
      2,
      [planks, planks, null, planks, planks, planks, planks],
      '使用同种木板制作两格高木门；放置时面向决定朝向，右键开关。',
    ),
    make(
      ids.fence,
      4,
      [planks, log, planks, null, planks, log, planks],
      '使用同种木材，向六个方向连接各树种围栏、栅栏门和实心方块。',
    ),
    make(
      ids.gate,
      1,
      [log, planks, log, null, log, planks, log],
      '使用同种木材制作，右键开关，为围栏留一个出入口。',
    ),
    make(
      ids.trapdoor,
      2,
      [planks, planks, planks, null, planks, planks, planks],
      '六块同种木板围成一圈，中心留空，制作两扇活板门。侧面上 / 下半部决定高度，右键翻盖。',
    ),
  );
}

export const CUT_MATERIALS = [
  ['planks', '橡木', '#c6a16c', 0.45],
  ['birchPlanks', '白桦木', '#d7c492', 0.45],
  ['sprucePlanks', '云杉木', '#8c6c48', 0.45],
  ['stone', '岩石', '#a0aaa5', 1.25],
  ['cobble', '圆石', '#93958e', 2],
  ['cobbledDeepslate', '深板岩圆石', '#56595b', 3.5],
  ['brick', '石砖', '#bcc4b7', 0.8],
  ['sandstone', '砂岩', '#d6bf85', 0.9],
  ['netherbrick', '下界砖', '#593841', 1.4],
  ['purpur', '紫珀', '#b48eaf', 1.3],
  ['endstoneBricks', '末地石砖', '#c1c0a0', 3],
  ['mossybrick', '苔石砖', '#7f9475', 2],
  ['copperBlock', '切制铜', '#c38466', 3],
];
for (const [base, name, color, hardness] of CUT_MATERIALS) {
  for (const [suffix, shape, label] of [
    ['Slab', 'slab', '半砖'],
    ['Stairs', 'stairs', '楼梯'],
  ]) {
    const id = base + suffix;
    BUILDING_BLOCKS[id] = {
      name: name + label,
      base,
      color,
      hardness,
      shape,
      wooden: ['planks', 'birchPlanks', 'sprucePlanks'].includes(base),
      fuel: shape === 'slab' ? 7.5 : 15,
    };
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
