export const END_FLOOR = 22;
export const END_PILLARS = [
  [10, 0],
  [0, 10],
  [-10, 10],
  [-10, 0],
  [0, -10],
  [10, -10],
].map(([q, r], i) => ({ q, r, height: [8, 11, 14, 9, 12, 15][i] }));
export const END_BLOCKS = {
  dragonEgg: { name: '龙蛋', color: '#392c4c', hardness: 2.5, shape: 'egg' },
};
export const END_ITEMS = {
  endCrystal: { name: '末地水晶', color: '#e5a4f5', use: true },
};
export const END_RECIPES = [
  {
    id: 'endCrystal',
    count: 1,
    title: '再一次，振翅',
    station: true,
    desc: '击败末影龙后，带六颗水晶回到中央基岩祭坛，右键重启挑战。',
    pattern: [
      'glass',
      'glass',
      'glass',
      'ghastTear',
      'glass',
      'pearl',
      'glass',
    ],
    cost: { glass: 5, ghastTear: 1, pearl: 1 },
  },
];
export const newDragonFight = () => ({
  hp: 200,
  broken: Array(6).fill(false),
  victories: 0,
  mode: 'fight',
  timer: 0,
});
export function validDragonFight(s) {
  return !!(
    s &&
    Number.isFinite(s.hp) &&
    s.hp >= 0 &&
    s.hp <= 200 &&
    Array.isArray(s.broken) &&
    s.broken.length === 6 &&
    s.broken.every((b) => typeof b === 'boolean') &&
    Number.isSafeInteger(s.victories) &&
    s.victories >= 0 &&
    s.victories < 1e6 &&
    ['fight', 'dying', 'dead', 'summon'].includes(s.mode) &&
    Number.isFinite(s.timer) &&
    s.timer >= 0 &&
    s.timer <= 20 &&
    (['dying', 'dead'].includes(s.mode) ? s.hp === 0 : s.hp > 0)
  );
}
