export const CAMPFIRE_SECONDS = 30;
export const CAMPFIRE_FOODS = {
  meat: 'cooked',
  rawCod: 'cookedCod',
  rawSalmon: 'cookedSalmon',
  potato: 'bakedPotato',
};
export const isCampfire = (type) =>
  type === 'campfire' || type === 'soulCampfire';
export const newCampfire = () => ({ lit: true, slots: Array(6).fill(null) });
export const validCampfire = (fire) =>
  !!fire &&
  typeof fire.lit === 'boolean' &&
  Array.isArray(fire.slots) &&
  fire.slots.length === 6 &&
  fire.slots.every(
    (slot) =>
      slot === null ||
      (slot &&
        Object.hasOwn(CAMPFIRE_FOODS, slot.item) &&
        Number.isFinite(slot.elapsed) &&
        slot.elapsed >= 0 &&
        slot.elapsed < CAMPFIRE_SECONDS),
  );
export const CAMPFIRE_BLOCKS = {
  campfire: {
    name: '营火',
    color: '#b98c5c',
    side: '#765039',
    hardness: 1,
    shape: 'campfire',
    light: '#ffac55',
    wooden: true,
  },
  soulCampfire: {
    name: '灵魂营火',
    color: '#68e1e7',
    side: '#765039',
    hardness: 1,
    shape: 'campfire',
    light: '#69dae9',
    wooden: true,
  },
  hayBale: {
    name: '干草块',
    color: '#c9ae4c',
    side: '#bd9f48',
    hardness: 0.5,
    pillar: true,
  },
};
const fireRecipe = (id, fuel) => ({
  id,
  count: 1,
  station: true,
  pattern: ['stick', 'stick', 'stick', fuel, 'wood', 'wood', 'wood'],
  cost: { stick: 3, [fuel]: 1, wood: 3 },
  desc: '三根木棍、中央火种与三根任意原木，搭起六向炉边。',
});
export const CAMPFIRE_RECIPES = [
  fireRecipe('campfire', 'coal'),
  { ...fireRecipe('campfire', 'charcoal'), desc: '也可以用木炭作为营火火种。' },
  fireRecipe('soulCampfire', 'soulSand'),
  {
    id: 'hayBale',
    count: 1,
    station: true,
    pattern: Array(7).fill('wheat'),
    cost: { wheat: 7 },
    desc: '七份小麦压成干草块；垫在营火下升起更高的信号烟。',
  },
  {
    id: 'wheat',
    count: 7,
    pattern: [null, null, null, 'hayBale', null, null, null],
    cost: { hayBale: 1 },
    desc: '拆开干草块，取回七份小麦。',
  },
];
