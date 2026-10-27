export const CAULDRON_FLOOR = 5 / 16;
export const CAULDRON_INNER = 0.72;
export const CAULDRON_BLOCKS = {
  cauldron: {
    name: '炼药锅',
    color: '#515a61',
    side: '#424b52',
    hardness: 2,
    tool: 1,
    shape: 'cauldron',
    drop: 'cauldron',
    cauldronLevel: 0,
  },
};
for (const liquid of ['water', 'lava'])
  for (const level of liquid === 'water' ? [1, 2, 3] : [3]) {
    const id = liquid === 'water' ? `waterCauldron${level}` : 'lavaCauldron';
    CAULDRON_BLOCKS[id] = {
      ...CAULDRON_BLOCKS.cauldron,
      name: liquid === 'water' ? `水炼药锅 · ${level}/3` : '岩浆炼药锅',
      color: liquid === 'water' ? '#3976ae' : '#fa7625',
      side: liquid === 'water' ? '#3976ae' : '#fa7625',
      internal: true,
      cauldronLiquid: liquid,
      cauldronLevel: level,
      ...(liquid === 'lava' ? { light: '#ff9d47' } : {}),
    };
  }
export const isCauldron = (type) => !!CAULDRON_BLOCKS[type];
export const waterCauldron = (level) =>
  level ? `waterCauldron${level}` : 'cauldron';
export const cauldronHeight = (type) =>
  CAULDRON_BLOCKS[type].cauldronLevel
    ? (6 + CAULDRON_BLOCKS[type].cauldronLevel * 3) / 16
    : CAULDRON_FLOOR;

// Used both to choose a usable hand and to apply the same container exchange.
export function cauldronAction(type, item) {
  const def = CAULDRON_BLOCKS[type];
  if (!def) return null;
  if (item === 'waterBucket') return { type: 'waterCauldron3', item: 'bucket' };
  if (item === 'lavaBucket') return { type: 'lavaCauldron', item: 'bucket' };
  const level = def.cauldronLevel;
  if (item === 'bucket' && level === 3)
    return {
      type: 'cauldron',
      item: def.cauldronLiquid === 'water' ? 'waterBucket' : 'lavaBucket',
    };
  if (def.cauldronLiquid === 'lava') return null;
  if (item === 'glassBottle' && level > 0)
    return { type: waterCauldron(level - 1), item: 'waterBottle' };
  if (item === 'waterBottle' && level < 3)
    return { type: waterCauldron(level + 1), item: 'glassBottle' };
  return null;
}
export const CAULDRON_RECIPES = [
  {
    id: 'cauldron',
    count: 1,
    station: true,
    pattern: Array(7).fill('ingot'),
    cost: { ingot: 7 },
    desc: '七铁锭制成六棱炼药锅；用桶装取水或岩浆，水瓶每次取放一档水。放在钟乳石下收集滴液，也能露天接雨。',
  },
];
