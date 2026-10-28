import { DYES, DYE_RECIPES } from './dye-data.js';

export const woolItem = (color) =>
  color === 'white' ? 'wool' : color + 'Wool';
export const WOOL_BLOCKS = Object.fromEntries(
  Object.entries(DYES).map(([color, def]) => [
    woolItem(color),
    {
      name: def.name + '羊毛',
      color: def.color,
      side: def.color,
      hardness: 0.8,
    },
  ]),
);
export const WOOL_TYPES = Object.keys(WOOL_BLOCKS);
export const isWool = (id) => Object.hasOwn(WOOL_BLOCKS, id);
export const WOOL_RECIPES = [
  {
    id: 'wool',
    count: 1,
    title: '白色羊毛',
    desc: '四份纤维线织成一块白色羊毛。',
    pattern: ['string', null, null, 'string', 'string', 'string', null],
    cost: { string: 4 },
  },
  ...Object.entries(DYES).map(([color, def]) => ({
    id: woolItem(color),
    count: 1,
    title: def.name + '羊毛',
    desc: '一块任意颜色羊毛加一份染料，制成一块对应颜色羊毛。',
    pattern: [null, 'wool', null, color + 'Dye', null, null, null],
    cost: { wool: 1, [color + 'Dye']: 1 },
  })),
];

// Mojang's six natural-color weights, mapped to the world's actual biomes.
export function naturalSheepColor(biome, roll) {
  const colors =
    biome === '雪原'
      ? ['black', 'lightGray', 'gray', 'white', 'brown', 'pink']
      : biome === '沙漠'
        ? ['brown', 'gray', 'lightGray', 'white', 'black', 'pink']
        : ['white', 'black', 'lightGray', 'gray', 'brown', 'pink'];
  const weights = [81836, 5000, 5000, 5000, 3000];
  let value = roll * 100000;
  for (let i = 0; i < weights.length; i++) {
    value -= weights[i];
    if (value < 0) return colors[i];
  }
  return 'pink';
}
export function offspringColor(a, b, roll) {
  if (a === b) return a;
  const ingredients = [a + 'Dye', b + 'Dye'];
  const mix = DYE_RECIPES.find(
    (recipe) =>
      recipe.count === 2 && ingredients.every((id) => recipe.cost[id] === 1),
  );
  return mix ? mix.id.slice(0, -3) : roll < 0.5 ? a : b;
}
