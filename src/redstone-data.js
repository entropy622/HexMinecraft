import { isOpenable, isDoorTop } from './building-data.js';

export const CIRCUIT_BLOCKS = {
  observer: {
    name: '侦测器',
    color: '#8c9294',
    hardness: 3,
    tool: 1,
    shape: 'observer',
  },
  piston: {
    name: '活塞',
    color: '#9f957e',
    hardness: 1.5,
    tool: 1,
    shape: 'piston',
  },
  stickyPiston: {
    name: '黏性活塞',
    color: '#91ab63',
    hardness: 1.5,
    tool: 1,
    shape: 'piston',
  },
  pistonHead: {
    name: '活塞头',
    color: '#bc9d68',
    hardness: 0.5,
    shape: 'pistonHead',
    internal: true,
  },
  stickyPistonHead: {
    name: '黏性活塞头',
    color: '#91ab63',
    hardness: 0.5,
    shape: 'pistonHead',
    internal: true,
  },
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
export const isPiston = (type) => type === 'piston' || type === 'stickyPiston';
export const isPistonHead = (type) =>
  type === 'pistonHead' || type === 'stickyPistonHead';
export const pistonHead = (type) =>
  type === 'stickyPiston' ? 'stickyPistonHead' : 'pistonHead';
export function pistonPartner(world, q, y, r, directions) {
  const type = world.get(q, y, r);
  if (!isPiston(type) && !isPistonHead(type)) return null;
  const state = world.state(q, y, r);
  if (isPiston(type) && !state.open) return null;
  const facing = state.facing || 0,
    [dq, dy, dr] =
      facing >= 6
        ? [0, facing === 6 ? -1 : 1, 0]
        : [directions[facing][0], 0, directions[facing][1]],
    sign = isPiston(type) ? 1 : -1,
    p = [q + sign * dq, y + sign * dy, r + sign * dr],
    other = world.get(...p) || world.edits?.get(p.join(',')),
    otherState = world.state(...p);
  return (isPiston(type)
    ? other === pistonHead(type)
    : isPiston(other) && otherState.open && type === pistonHead(other)) &&
    otherState.facing === facing
    ? p
    : null;
}
export const circuitItem = (type) =>
  type === 'redstoneWire'
    ? 'redstone'
    : isPistonHead(type)
      ? type.slice(0, -4)
      : type;
// The hex crafting grid uses logs for the wooden handle, like existing ladders.
export const CIRCUIT_RECIPES = [
  [
    'observer',
    [
      'cobble',
      'cobble',
      'cobble',
      'redstone',
      'cobble',
      'netherQuartz',
      'redstone',
    ],
    '六圆石、二红石、一石英。双眼背向玩家检测一格，红点向相反面输出；变化后延迟 0.1 秒输出 15，持续 0.1 秒。仰俯可朝上下。',
  ],
  [
    'piston',
    ['planks', 'planks', 'cobble', 'cobble', 'ingot', 'redstone', 'cobble'],
    '三块木板、四块圆石、一块铁锭和一份红石。朝向玩家，仰俯可朝上下；通电推动最多十二格，断电收回活塞头。',
  ],
  [
    'stickyPiston',
    ['slimeBall', 'piston'],
    '黏液球与普通活塞制成；断电时回拉头前一个可移动方块。',
  ],
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
    'piston',
    'observer',
  ].includes(id),
  ...(['dropper', 'dispenser', 'piston', 'observer'].includes(id)
    ? {
        patternCounts:
          id === 'observer'
            ? [2, 1, 2, 1, 1, 1, 1]
            : id === 'piston'
              ? [2, 1, 1, 1, 1, 1, 2]
              : id === 'dispenser'
                ? [2, 2, 1, 1, 1, 1, 1]
                : [2, 1, 1, 1, 1, 1, 1],
        cobbleGroup: true,
      }
    : {}),
  pattern: ['dropper', 'dispenser', 'piston', 'observer'].includes(id)
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
    id === 'observer'
      ? { cobble: 6, redstone: 2, netherQuartz: 1 }
      : id === 'piston'
        ? { planks: 3, cobble: 4, ingot: 1, redstone: 1 }
        : id === 'dispenser'
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
