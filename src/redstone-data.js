import { isOpenable, isDoorTop } from './building-data.js';

export const CIRCUIT_BLOCKS = {
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
].map(([id, ingredients, desc]) => ({
  id,
  count: 1,
  title: CIRCUIT_BLOCKS[id].name,
  desc,
  station: id === 'redstoneLamp',
  pattern:
    id === 'redstoneLamp'
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
  cost: ingredients.reduce(
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
