// Item data stays independent of rendering and the inventory implementation.
export const GEAR = {};
export const GEAR_RECIPES = [];
const recipe = (id, pattern, count = 1, station = true, desc = '') => {
  const cost = {};
  for (const item of pattern) if (item) cost[item] = (cost[item] || 0) + 1;
  GEAR_RECIPES.push({
    id,
    count,
    title: GEAR[id]?.name || '荒野工艺',
    desc,
    pattern,
    cost,
    station,
  });
};
for (const [tier, label, material, color, durability] of [
  [1, '木', 'planks', '#cba16a', 60],
  [2, '石', 'stone', '#a9b8b3', 132],
  [3, '铁', 'ingot', '#e5d8c5', 250],
  [4, '钻石', 'diamond', '#83dce7', 1561],
]) {
  GEAR[`pick${tier}`] = {
    name: `${label}镐`,
    color,
    durability,
    kind: 'pick',
    tier,
    damage: 2 + tier,
    cooldown: 0.65,
  };
  for (const [kind, name, damage, pattern] of [
    [
      'axe',
      '斧',
      3 + tier * 1.5,
      [material, material, null, material, 'wood', null, 'wood'],
    ],
    [
      'shovel',
      '铲',
      1 + tier,
      [null, material, null, 'wood', null, 'wood', null],
    ],
    [
      'sword',
      '剑',
      3 + tier,
      [null, material, null, material, null, 'wood', null],
    ],
  ]) {
    const id = kind === 'sword' && tier === 3 ? 'sword' : kind + tier;
    GEAR[id] = {
      name: label + name,
      color,
      durability,
      kind,
      tier,
      damage,
      cooldown: kind === 'axe' ? 0.95 : kind === 'sword' ? 0.45 : 0.65,
    };
    if (id !== 'sword')
      recipe(
        id,
        pattern,
        1,
        tier > 1,
        kind === 'axe'
          ? '手持砍伐木材更快；攻击有力，挥动较慢。'
          : kind === 'shovel'
            ? '手持挖掘泥土、沙与雪更快。'
            : '装入快捷栏并手持，左键攻击。',
      );
  }
}
GEAR.shears = {
  name: '剪刀',
  color: '#d3dce0',
  durability: 238,
  kind: 'shears',
  damage: 2,
  cooldown: 0.6,
};
recipe(
  'shears',
  ['ingot', null, null, null, 'ingot', null, null],
  1,
  false,
  '对成年绵羊按 E 剪羊毛；草地上约两分钟长回。',
);
GEAR.hoe = {
  name: '石锄',
  color: '#bdbda4',
  durability: 132,
  kind: 'hoe',
  tier: 2,
  damage: 2,
  cooldown: 0.6,
};
GEAR.bow = {
  name: '弓',
  color: '#be965c',
  durability: 384,
  kind: 'bow',
  damage: 1,
  cooldown: 0.7,
};
recipe(
  'bow',
  ['wood', 'string', null, 'wood', 'string', 'wood', 'string'],
  1,
  true,
  '手持后按住左键蓄力，松开发射。消耗箭矢，满弓射程更远。',
);
for (const [material, label, color, multiplier, points] of [
  ['leather', '皮革', '#a47c50', 5, [1, 3, 2, 1]],
  ['ingot', '铁', '#cbd6db', 15, [2, 6, 5, 2]],
  ['diamond', '钻石', '#78dce7', 33, [3, 8, 6, 3]],
]) {
  for (const [i, slot, name, count, base] of [
    [0, 'head', '头盔', 5, 11],
    [1, 'chest', '胸甲', 6, 16],
    [2, 'legs', '护腿', 6, 15],
    [3, 'feet', '靴子', 4, 13],
  ]) {
    const id =
      (material === 'ingot'
        ? 'iron'
        : material === 'leather'
          ? 'leather'
          : 'diamond') +
      slot[0].toUpperCase() +
      slot.slice(1);
    GEAR[id] = {
      name: label + name,
      color,
      armorSlot: slot,
      armor: points[i],
      durability: base * multiplier,
    };
    const pattern = Array(7).fill(material);
    pattern[3] = null;
    for (let j = 6; pattern.filter(Boolean).length > count; j--)
      if (j !== 3) pattern[j] = null;
    recipe(
      id,
      pattern,
      1,
      true,
      `在背包点击穿戴。护甲 +${points[i]}，抵御战斗与灼烧伤害，受击消耗耐久。`,
    );
  }
}
recipe(
  'string',
  ['wool', null, null, null, null, null, null],
  4,
  false,
  '把羊毛捻成纤维线，用于弓弦与箭羽。',
);
recipe(
  'arrow',
  ['stone', null, 'wood', null, 'string', null, null],
  8,
  false,
  '石制箭头、木杆与纤维尾羽。射在地面的箭可以走近回收。',
);

export const ARMOR_SLOTS = {
  head: '头盔',
  chest: '胸甲',
  legs: '护腿',
  feet: '靴子',
};

recipe(
  'boneMeal',
  ['bone', null, null, null, null, null, null],
  3,
  false,
  '手持骨粉对麦苗按 E，立即催熟。',
);
recipe(
  'arrow',
  ['stone', null, 'wood', null, 'feather', null, null],
  12,
  false,
  '羽毛尾羽能做出更多箭矢。',
);
recipe(
  'cake',
  ['wheat', 'egg', 'wheat', 'milkBucket', 'wheat', 'egg', 'sugar'],
  1,
  true,
  '鸡蛋、牛奶、小麦与糖做成蛋糕，食用恢复 12 点饱食。合成返还铁桶。',
);
GEAR_RECIPES.at(-1).returns = { bucket: 1 };
