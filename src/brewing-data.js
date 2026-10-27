export const EFFECTS = {
  poison: { name: '中毒', maxRank: 2, color: '#85a348', icon: null },
  levitation: {
    name: '漂浮',
    maxRank: 1,
    color: '#ddd0b4',
    icon: 'levitation',
  },
  speed: { name: '迅捷', maxRank: 2, color: '#7cbae5', icon: 'swiftness' },
  strength: { name: '力量', maxRank: 2, color: '#e87069', icon: 'strength' },
  regeneration: {
    name: '生命恢复',
    maxRank: 2,
    color: '#ed95be',
    icon: 'regeneration',
  },
  fireResistance: {
    name: '抗火',
    maxRank: 1,
    color: '#f0aa57',
    icon: 'fire_resistance',
  },
  waterBreathing: {
    name: '水下呼吸',
    maxRank: 1,
    color: '#76bde2',
    icon: 'water_breathing',
  },
  nightVision: {
    name: '夜视',
    maxRank: 1,
    color: '#a794dc',
    icon: 'night_vision',
  },
};
export const POTIONS = {
  waterBottle: { name: '水瓶', color: '#5c95e7' },
  awkwardPotion: { name: '粗制药水', color: '#9577a5' },
};
const families = [
  ['healing', '治疗', '#ec575f', 'glisteringMelon', 0, 0, true],
  ['regeneration', '再生', '#e88bb4', 'ghastTear', 45, 120, true],
  ['speed', '迅捷', '#80bfdf', 'sugar', 180, 480, true],
  ['strength', '力量', '#c96658', 'ember', 180, 480, true],
  ['fireResistance', '抗火', '#e7a35a', 'magmaCream', 180, 480, false],
  ['waterBreathing', '水肺', '#63b8d6', 'pufferFish', 180, 480, false],
  ['nightVision', '夜视', '#a795dc', 'goldenCarrot', 180, 480, false],
];
export const BREW_TRANSFORMS = { waterBottle: { netherWart: 'awkwardPotion' } };
BREW_TRANSFORMS.awkwardPotion = {};
for (const [
  effect,
  name,
  color,
  ingredient,
  duration,
  extended,
  strong,
] of families) {
  const id = effect + 'Potion';
  POTIONS[id] = {
    name: name + '药水',
    color,
    effect: effect === 'healing' ? null : effect,
    duration,
    rank: 1,
    heal: effect === 'healing' ? 4 : 0,
  };
  BREW_TRANSFORMS.awkwardPotion[ingredient] = id;
  BREW_TRANSFORMS[id] = {};
  if (extended) {
    POTIONS[id + 'Long'] = {
      ...POTIONS[id],
      name: name + '药水（延长）',
      duration: extended,
    };
    BREW_TRANSFORMS[id].redstone = id + 'Long';
  }
  if (strong) {
    POTIONS[id + 'Strong'] = {
      ...POTIONS[id],
      name: name + '药水 II',
      duration: duration / 2,
      rank: 2,
      heal: effect === 'healing' ? 8 : 0,
    };
    BREW_TRANSFORMS[id].glowDust = id + 'Strong';
  }
}
// Keep the hex-world crystal recipe alongside the familiar ghast-tear route.
BREW_TRANSFORMS.awkwardPotion.crystal = 'regenerationPotion';
export const brewResult = (bottle, ingredient) =>
  BREW_TRANSFORMS[bottle]?.[ingredient] || null;
export const BREW_INGREDIENTS = [
  ...new Set(
    Object.values(BREW_TRANSFORMS).flatMap((recipes) => Object.keys(recipes)),
  ),
];
export const potionDescription = (id) => {
  const p = POTIONS[id];
  if (!p) return '';
  if (p.heal) return '立即恢复 ' + p.heal + ' 生命';
  if (p.effect)
    return (
      EFFECTS[p.effect].name +
      (p.rank === 2 ? ' II' : ' I') +
      ' · ' +
      (p.duration < 60
        ? p.duration + ' 秒'
        : Math.floor(p.duration / 60) + ' 分 ' + (p.duration % 60) + ' 秒')
    );
  return id === 'waterBottle'
    ? '酿造原料；加入下界疣制成粗制药水'
    : '酿造原料；再加入一种材料制成有效药水';
};
export const BREW_BLOCKS = {
  brewingStand: {
    name: '酿造台',
    color: '#b69659',
    side: '#7a7267',
    hardness: 1.5,
    tool: 1,
    light: '#b78243',
  },
  soulSand: {
    name: '灵魂沙',
    color: '#796358',
    side: '#5b473e',
    hardness: 0.5,
  },
  redstoneOre: {
    name: '红石矿',
    color: '#8b6d6a',
    side: '#9f5555',
    hardness: 1.6,
    tool: 3,
    drop: 'redstone',
  },
};
export const BREW_ITEMS = {
  ...Object.fromEntries(
    Object.entries(POTIONS).map(([id, p]) => [
      id,
      { name: p.name, color: p.color, use: true, potion: true },
    ]),
  ),
  glassBottle: { name: '玻璃瓶', color: '#cfdfda', use: true },
  netherWart: { name: '下界疣', color: '#b4474e', use: true },
  blazeRod: { name: '烈焰棒', color: '#efb34a' },
  ghastTear: { name: '恶魂之泪', color: '#e6ded1' },
  redstone: { name: '红石粉', color: '#cb514a', use: true },
  glowDust: { name: '萤石粉', color: '#e4cd76' },
  slimeBall: { name: '黏液球', color: '#91b95e' },
  magmaCream: { name: '岩浆膏', color: '#df9a47' },
  pufferFish: { name: '河豚', color: '#d8b65b' },
  goldNugget: { name: '金粒', color: '#e5bd53' },
  goldenCarrot: { name: '金胡萝卜', color: '#e0ab43' },
  glisteringMelon: { name: '闪烁的西瓜片', color: '#d1a24a' },
  melonSeed: { name: '西瓜种子', color: '#9e9256', use: true },
  melonSlice: { name: '西瓜片', color: '#dc6d63' },
};
const recipe = (
  id,
  count,
  pattern,
  desc,
  station = false,
  cost = null,
  patternCounts = null,
) => ({
  id,
  count,
  pattern,
  desc,
  station,
  title:
    BREW_ITEMS[id]?.name ||
    BREW_BLOCKS[id]?.name ||
    { ember: '烈焰粉', goldIngot: '金锭', glowstone: '萤石' }[id],
  cost:
    cost ||
    pattern
      .filter(Boolean)
      .reduce((all, item) => ((all[item] = (all[item] || 0) + 1), all), {}),
  ...(patternCounts ? { patternCounts } : {}),
});
export const BREW_RECIPES = [
  recipe(
    'glassBottle',
    3,
    ['glass', null, 'glass', null, null, 'glass', null],
    '装水不消耗水源。手持玻璃瓶对准水源右键。',
    true,
  ),
  recipe(
    'brewingStand',
    1,
    [null, 'blazeRod', null, 'stone', null, 'stone', 'stone'],
    '放入三瓶药水、一种原料与烈焰粉，自动酿造。烈焰棒来自烈焰人，也能在余烬堡垒宝箱找到。',
    true,
  ),
  recipe(
    'ember',
    2,
    [null, null, null, 'blazeRod', null, null, null],
    '把烈焰棒磨成两份烈焰粉，可酿造或为酿造台补充能量。',
  ),
  recipe(
    'goldNugget',
    9,
    [null, null, null, 'goldIngot', null, null, null],
    '金锭拆成九金粒。',
  ),
  recipe(
    'goldIngot',
    1,
    [
      'goldNugget',
      'goldNugget',
      'goldNugget',
      'goldNugget',
      'goldNugget',
      'goldNugget',
      'goldNugget',
    ],
    '九金粒合成金锭。',
    false,
    { goldNugget: 9 },
    [1, 1, 1, 3, 1, 1, 1],
  ),
  recipe(
    'goldenCarrot',
    1,
    [
      'goldNugget',
      'goldNugget',
      'goldNugget',
      'carrot',
      'goldNugget',
      'goldNugget',
      'goldNugget',
    ],
    '胡萝卜裹八金粒，酿造夜视药水。',
    true,
    { goldNugget: 8, carrot: 1 },
    [2, 1, 1, 1, 1, 1, 2],
  ),
  recipe(
    'glisteringMelon',
    1,
    [
      'goldNugget',
      'goldNugget',
      'goldNugget',
      'melonSlice',
      'goldNugget',
      'goldNugget',
      'goldNugget',
    ],
    '西瓜片裹八金粒，酿造治疗药水。',
    true,
    { goldNugget: 8, melonSlice: 1 },
    [2, 1, 1, 1, 1, 1, 2],
  ),
  recipe(
    'magmaCream',
    1,
    [null, 'slimeBall', null, 'ember', null, null, null],
    '黏液球与烈焰粉混成岩浆膏，用来酿造抗火药水。',
  ),
  recipe(
    'glowDust',
    4,
    [null, null, null, 'glowstone', null, null, null],
    '把萤石打磨为四份粉末，用来增强部分药水。',
  ),
  recipe(
    'glowstone',
    1,
    ['glowDust', null, 'glowDust', null, 'glowDust', null, 'glowDust'],
    '四份萤石粉重新压成萤石。',
  ),
  recipe(
    'melonSeed',
    2,
    [null, null, null, 'melonSlice', null, null, null],
    '西瓜片取出种子，在耕地种植。',
  ),
];
