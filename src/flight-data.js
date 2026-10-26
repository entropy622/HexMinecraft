import { END_FLOOR } from './end-data.js';

export const FIRST_END_SHIP = { q: 48, r: -16, h: 28 };
export const END_GATEWAYS = [
  { q: 0, r: 5, y: END_FLOOR },
  { q: 40, r: -16, y: 28 },
];
export const FLIGHT_BLOCKS = {
  endGateway: {
    name: '末地折跃门',
    color: '#ab82dc',
    hardness: Infinity,
    shape: 'gateway',
    nonSolid: true,
    internal: true,
    light: '#bc9aef',
  },
};
export const FLIGHT_ITEMS = {
  elytra: {
    name: '鞘翅',
    color: '#b6a7c3',
    kind: 'elytra',
    armorSlot: 'chest',
    armor: 0,
    glider: true,
    durability: 432,
    durabilityFloor: 1,
    repair: 'phantomMembrane',
  },
  fireworkRocket: { name: '烟花火箭', color: '#e8c6bb', use: true },
  phantomMembrane: { name: '幻翼膜', color: '#d6d0b0' },
};
export const FLIGHT_RECIPES = [
  {
    id: 'fireworkRocket',
    count: 3,
    title: '乘着火光',
    desc: '空中展开鞘翅后，右键 使用，提供约 1.5 秒助推；站在地面也可以放烟花。',
    pattern: [null, null, null, 'paper', 'gunpowder', null, null],
    cost: { paper: 1, gunpowder: 1 },
  },
];
