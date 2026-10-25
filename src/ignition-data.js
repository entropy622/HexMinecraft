export const IGNITION_BLOCKS = {
  gravel: { name: '砂砾', color: '#aba29d', side: '#8d8782', hardness: 0.6 },
};
export const IGNITION_ITEMS = {
  flint: { name: '燧石', color: '#666a72' },
  flintAndSteel: {
    name: '打火石',
    color: '#b4b8c1',
    kind: 'igniter',
    durability: 64,
    damage: 1,
    cooldown: 0.5,
  },
};
export const IGNITION_RECIPES = [
  {
    id: 'flintAndSteel',
    count: 1,
    title: '点亮异界',
    pattern: ['ingot', null, null, 'flint', null, null, null],
    cost: { ingot: 1, flint: 1 },
    desc: '一份铁锭与燧石制成打火石。点燃黑曜石门框，或重新点燃熄灭的营火。',
  },
];
export const granular = (type) => type === 'sand' || type === 'gravel';
