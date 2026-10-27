import { isOpenable, isDoorTop } from './building-data.js';

export const CIRCUIT_BLOCKS = {
  dispenser: {
    name: '发射器',
    color: '#929496',
    hardness: 3.5,
    tool: 1,
    shape: 'dropper',
    storage: 9,
  },
  dropper: {
    name: '投掷器',
    color: '#858b8e',
    hardness: 3.5,
    tool: 1,
    shape: 'dropper',
    storage: 9,
  },
  hopper: {
    name: '漏斗',
    color: '#5a6166',
    hardness: 3,
    tool: 1,
    shape: 'hopper',
    storage: 5,
  },
  comparator: {
    name: '红石比较器',
    color: '#c5b8ab',
    hardness: 0,
    shape: 'comparator',
    nonSolid: true,
  },
  redstoneWire: {
    name: '红石线',
    color: '#8b211c',
    hardness: 0,
    shape: 'wire',
    nonSolid: true,
    internal: true,
    drop: 'redstone',
  },
  lever: {
    name: '拉杆',
    color: '#a79880',
    hardness: 0.5,
    shape: 'lever',
    nonSolid: true,
  },
  stoneButton: {
    name: '石按钮',
    color: '#969996',
    hardness: 0.5,
    shape: 'button',
    nonSolid: true,
  },
  stonePressurePlate: {
    name: '石质压力板',
    color: '#969996',
    hardness: 0.5,
    shape: 'pressurePlate',
    nonSolid: true,
  },
  redstoneLamp: {
    name: '红石灯',
    color: '#66452e',
    side: '#66452e',
    hardness: 0.3,
    light: '#ffbe76',
  },
  redstoneTorch: {
    name: '红石火把',
    color: '#a52a20',
    hardness: 0,
    shape: 'redstoneTorch',
    nonSolid: true,
    light: '#f74c2c',
  },
  repeater: {
    name: '红石中继器',
    color: '#c5b8ab',
    hardness: 0,
    shape: 'repeater',
    nonSolid: true,
  },
};
export const isCircuit = (type) =>
  !!CIRCUIT_BLOCKS[type] || (isOpenable(type) && !isDoorTop(type));
export const isCircuitInput = (type) =>
  ['lever', 'stoneButton', 'stonePressurePlate'].includes(type);
export const circuitItem = (type) =>
  type === 'redstoneWire' ? 'redstone' : type;
// The hex crafting grid uses logs for the wooden handle, like existing ladders.
export const CIRCUIT_RECIPES = [
  [
    'dispenser',
    ['cobble', 'cobble', 'cobble', 'cobble', 'cobble', 'bow', 'redstone'],
    '七块圆石、一把弓和一份红石；每次重新通电后使用一件物品。可射箭、装倒桶、施骨粉、点火、放船、装备护甲或喷出普通物品。',
  ],
  [
    'dropper',
    ['cobble', 'cobble', 'cobble', 'cobble', 'cobble', 'cobble', 'redstone'],
    '七块圆石与一份红石制成；每次通电延迟 0.2 秒输出一件，面向容器时转入，否则喷出。出口朝向玩家，仰俯可朝上下。',
  ],
  [
    'hopper',
    ['ingot', 'ingot', 'ingot', 'chest', 'ingot', 'ingot'],
    '从上方吸入物品，沿出口自动运出；通电停止。Shift 右键容器放置，侧面点击决定出口。',
  ],
  [
    'lever',
    ['wood', 'cobble'],
    '右键保持或关闭信号，可装在地面、墙面和天花板。',
  ],
  ['stoneButton', ['stone'], '右键发出一秒信号；已按下时不会延长。'],
  [
    'stonePressurePlate',
    ['stone', 'stone'],
    '玩家和生物踩下触发，离开半秒后释放。',
  ],
  [
    'redstoneLamp',
    ['redstone', 'redstone', 'glowstone', 'redstone', 'redstone'],
    '连接红石线，通电后照亮周围；单条线路每格衰减一级。',
  ],
  [
    'redstoneTorch',
    ['wood', 'redstone'],
    '装在地面或墙面；支撑块通电后熄灭，提供反相信号。',
  ],
  [
    'comparator',
    [
      'redstoneTorch',
      'redstoneTorch',
      'redstoneTorch',
      'netherQuartz',
      'stone',
      'stone',
      'stone',
    ],
    '读取后方信号或容器，比较 / 减去侧面输入；右键切换模式。',
  ],
  [
    'repeater',
    ['redstoneTorch', 'redstoneTorch', 'redstone', 'stone', 'stone', 'stone'],
    '只从后方输入、前方输出；右键调整 1–4 红石刻延迟，侧面中继器可锁定。',
  ],
].map(([id, ingredients, desc]) => ({
  id,
  count: 1,
  title: CIRCUIT_BLOCKS[id].name,
  desc,
  station: [
    'redstoneLamp',
    'repeater',
    'comparator',
    'hopper',
    'dropper',
    'dispenser',
  ].includes(id),
  ...(['dropper', 'dispenser'].includes(id)
    ? {
        patternCounts:
          id === 'dispenser' ? [2, 2, 1, 1, 1, 1, 1] : [2, 1, 1, 1, 1, 1, 1],
        cobbleGroup: true,
      }
    : {}),
  pattern: ['dropper', 'dispenser'].includes(id)
    ? ingredients
    : id === 'hopper'
      ? ['ingot', null, 'ingot', 'ingot', 'chest', 'ingot', 'ingot']
      : id === 'comparator'
        ? ingredients
        : id === 'repeater'
          ? [
              'redstoneTorch',
              'redstone',
              'redstoneTorch',
              'stone',
              'stone',
              'stone',
              null,
            ]
          : id === 'redstoneLamp'
            ? [
                'redstone',
                null,
                'redstone',
                'glowstone',
                'redstone',
                null,
                'redstone',
              ]
            : [
                null,
                null,
                null,
                ...ingredients,
                ...Array(4 - ingredients.length).fill(null),
              ],
  cost:
    id === 'dispenser'
      ? { cobble: 7, redstone: 1, bow: 1 }
      : id === 'dropper'
        ? { cobble: 7, redstone: 1 }
        : ingredients.reduce(
            (cost, item) => ({ ...cost, [item]: (cost[item] || 0) + 1 }),
            {},
          ),
}));

export function attachmentCell(q, y, r, state, directions) {
  if (state.mount === 'ceiling') return [q, y + 1, r];
  if (state.mount === 'wall') {
    const [dq, dr] = directions[state.facing || 0];
    return [q + dq, y, r + dr];
  }
  return [q, y - 1, r];
}
