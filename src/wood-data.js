export const TREES = {
  oak: {
    name: '橡树',
    log: 'wood',
    stripped: 'strippedOakWood',
    leaves: 'leaves',
    planks: 'planks',
    sapling: 'sapling',
    height: 4,
  },
  birch: {
    name: '白桦',
    log: 'birchWood',
    stripped: 'strippedBirchWood',
    leaves: 'birchLeaves',
    planks: 'birchPlanks',
    sapling: 'birchSapling',
    height: 5,
  },
  spruce: {
    name: '云杉',
    log: 'spruceWood',
    stripped: 'strippedSpruceWood',
    leaves: 'spruceLeaves',
    planks: 'sprucePlanks',
    sapling: 'spruceSapling',
    height: 7,
  },
  jungle: {
    name: '丛林树',
    log: 'jungleWood',
    stripped: 'strippedJungleWood',
    leaves: 'jungleLeaves',
    planks: 'junglePlanks',
    sapling: 'jungleSapling',
    height: 9,
  },
  crimson: { name: '绯红树', log: 'crimsonwood', leaves: 'shroom', height: 4 },
};
export const LOG_VARIANTS = Object.fromEntries(
  Object.values(TREES)
    .filter((tree) => tree.stripped)
    .map((tree) => [tree.log, [tree.log, tree.stripped]]),
);
export const WOOD_GROUPS = {
  wood: Object.values(LOG_VARIANTS).flat(),
  planks: ['planks', 'birchPlanks', 'sprucePlanks', 'junglePlanks'],
};
export const woodKey = (id) =>
  Object.entries(WOOD_GROUPS).find(([, ids]) => ids.includes(id))?.[0] || id;
export const WOOD_BLOCKS = {},
  WOOD_ITEMS = {},
  WOOD_RECIPES = [],
  WOOD_PLANTS = {};
for (const [species, label, logColor, leafColor, plankColor] of [
  ['birch', '白桦', '#d3d2bd', '#8eb64f', '#d7c492'],
  ['spruce', '云杉', '#66503b', '#5d8067', '#8c6c48'],
  ['jungle', '丛林', '#746544', '#4d9035', '#bc8864'],
]) {
  const t = TREES[species];
  WOOD_BLOCKS[t.log] = {
    name: label + '原木',
    color: logColor,
    side: logColor,
    hardness: 0.65,
    log: true,
    pillar: true,
    stripped: t.stripped,
  };
  WOOD_BLOCKS[t.leaves] = {
    name: label + '树叶',
    color: leafColor,
    hardness: 0.2,
    foliage: true,
    sapling: t.sapling,
    leafTint: leafColor,
  };
  WOOD_BLOCKS[t.planks] = {
    name: label + '木板',
    color: plankColor,
    side: plankColor,
    hardness: 0.45,
  };
  WOOD_ITEMS[t.sapling] = { name: label + '树苗', color: leafColor, use: true };
  WOOD_PLANTS[t.sapling] = {
    name: label + '树苗',
    seed: t.sapling,
    species,
    seconds: species === 'spruce' ? 210 : 180,
    tree: true,
    soil:
      species === 'spruce'
        ? ['grass', 'dirt', 'farmland', 'snow']
        : ['grass', 'dirt', 'farmland'],
    yield: { [t.sapling]: 1 },
  };
  WOOD_RECIPES.push({
    id: t.planks,
    count: 4,
    title: label + '木作',
    exactWood: true,
    desc:
      '带皮或去皮' +
      label +
      '原木制成四块对应木板；通用木制配方可以混用不同树种。',
    pattern: [null, null, null, t.log, null, null, null],
    cost: { [t.log]: 1 },
  });
}
for (const [species, label, color, side] of [
  ['oak', '橡木', '#c7a56c', '#b59056'],
  ['birch', '白桦', '#e0cda0', '#d2bb83'],
  ['spruce', '云杉', '#98754d', '#87623b'],
  ['jungle', '丛林木', '#d49c75', '#b5825b'],
]) {
  WOOD_BLOCKS[TREES[species].stripped] = {
    name: '去皮' + label + '原木',
    color,
    side,
    hardness: 0.65,
    log: true,
    pillar: true,
  };
}
