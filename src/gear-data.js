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
    exactWood: id === 'boat',
  });
};
GEAR.boat = { name: '橡木船', color: '#bd9259', use: true, vehicle: true };
GEAR.shield = {
  name: '六棱盾牌',
  color: '#bba779',
  use: true,
  offhand: true,
  durability: 336,
};
recipe(
  'shield',
  ['planks', 'ingot', 'planks', 'planks', 'planks', 'planks', 'planks'],
  1,
  true,
  '盾牌可拿在主手或副手，右键或 R 举起，阻挡正面近战与箭矢，减轻正面爆炸；举盾时移动变慢。Shift 点击可放入空副手。',
);
recipe(
  'boat',
  ['planks', null, 'planks', 'planks', 'planks', null, 'planks'],
  1,
  true,
  '放入水面后 E 上船，W/S 划行、A/D 转向、空格刹船、Shift 下船。Ctrl+E 收回空船。',
);
for (const [tier, label, material, color, durability] of [
  [1, '木', 'planks', '#cba16a', 60],
  [2, '石', 'cobble', '#a9b8b3', 132],
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
  '对成年绵羊右键剪下对应颜色羊毛；草地上约两分钟吃草长回，保留颜色。',
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
GEAR.fishingRod = {
  name: '鱼竿',
  color: '#c6a06a',
  durability: 64,
  kind: 'rod',
  damage: 1,
  cooldown: 0.7,
};
recipe(
  'fishingRod',
  [null, 'wood', 'string', 'wood', 'string', 'wood', null],
  1,
  true,
  '主手或副手对水面右键抛线，浮漂下沉时再次按下收杆。鱼线与耐久绑定实际钓竿；雨天更易咬钩，开阔深水偶尔藏有宝物。',
);
recipe(
  'bow',
  ['wood', 'string', null, 'wood', 'string', 'wood', 'string'],
  1,
  true,
  '主手或副手均可使用。按住右键约一秒满弓，松开发射；箭矢优先从副手取用。支持力量、冲击与无限附魔。',
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
      `在背包点击穿戴。护甲 +${points[i]}，抵御战斗与灼烧伤害，受击消耗耐久。${material === 'leather' ? '皮革防止冻结；皮靴可站在细雪上，蹲伏下沉，内部按空格攀出。' : ''}`,
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
  '手持骨粉对麦苗右键，立即催熟。',
);
recipe(
  'arrow',
  ['flint', null, 'stick', null, 'feather', null, null],
  4,
  false,
  '燧石箭头、木棍与羽毛制成四支箭矢，落地的箭可走近回收。',
);
recipe(
  'cake',
  ['wheat', 'egg', 'wheat', 'milkBucket', 'wheat', 'egg', 'sugar'],
  1,
  true,
  '鸡蛋、牛奶、小麦与糖做成蛋糕，食用恢复 14 点饱食。合成返还铁桶。',
);
GEAR_RECIPES.at(-1).returns = { bucket: 1 };
for (const entry of GEAR_RECIPES)
  if (entry.cost.cobble) entry.cobbleGroup = true;
