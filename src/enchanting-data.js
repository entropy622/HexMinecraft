export const ENCHANT_BLOCKS = {
  lapisOre: {
    name: '青金石矿',
    color: '#778398',
    side: '#526ca4',
    hardness: 1.6,
    tool: 2,
    drop: 'lapis',
  },
  enchantingTable: {
    name: '附魔台',
    color: '#bd4678',
    side: '#30263d',
    hardness: 2.5,
    tool: 2,
    light: '#9571e5',
  },
};
export const ENCHANT_ITEMS = { lapis: { name: '青金石', color: '#406bce' } };
export const ENCHANT_RECIPES = [
  {
    id: 'enchantingTable',
    count: 1,
    title: '六棱附魔台',
    station: true,
    desc: '书、钻石与黑曜石构成附魔台。E 打开，用等级和青金石强化装备；两格外的书架提升附魔档位。',
    pattern: [
      'obsidian',
      'diamond',
      'obsidian',
      'book',
      'obsidian',
      'diamond',
      'obsidian',
    ],
    cost: { obsidian: 4, diamond: 2, book: 1 },
  },
];
export const ENCHANTS = {
  efficiency: {
    name: '效率',
    max: 5,
    accepts: (item) => ['pick', 'axe', 'shovel', 'hoe'].includes(item.kind),
  },
  sharpness: {
    name: '锋利',
    max: 5,
    accepts: (item) => ['sword', 'axe'].includes(item.kind),
  },
  protection: {
    name: '保护',
    max: 4,
    accepts: (item) => !!item.armorSlot && !item.glider,
  },
  power: { name: '力量', max: 5, accepts: (item) => item.kind === 'bow' },
  unbreaking: { name: '耐久', max: 3, accepts: (item) => !!item.durability },
};
export const enchantmentsOf = (entry) =>
  typeof entry === 'object' && entry ? entry.enchant || {} : {};
export const wearValue = (entry) =>
  typeof entry === 'number' ? entry : entry?.value;
export const repairPenalty = (entry) => entry?.work || 0;
export const customName = (entry) => entry?.name || '';
export const cleanName = (name) =>
  Array.from(
    String(name || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim(),
  )
    .slice(0, 24)
    .join('');
export const enchantLabel = (entry) =>
  Object.entries(enchantmentsOf(entry))
    .map(
      ([key, level]) =>
        ENCHANTS[key].name + ' ' + ['', 'I', 'II', 'III', 'IV', 'V'][level],
    )
    .join(' · ');
export function validWearEntry(item, entry) {
  const value = wearValue(entry);
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= item.durability &&
    (typeof entry === 'number' ||
      (entry &&
        !Array.isArray(entry) &&
        (entry.work === undefined ||
          (Number.isInteger(entry.work) &&
            entry.work >= 0 &&
            entry.work <= 63)) &&
        (entry.name === undefined ||
          (typeof entry.name === 'string' &&
            entry.name.length > 0 &&
            cleanName(entry.name) === entry.name)) &&
        entry.enchant &&
        typeof entry.enchant === 'object' &&
        !Array.isArray(entry.enchant) &&
        Object.entries(entry.enchant).every(
          ([key, rank]) =>
            Object.hasOwn(ENCHANTS, key) &&
            ENCHANTS[key].accepts(item) &&
            Number.isInteger(rank) &&
            rank >= 1 &&
            rank <= ENCHANTS[key].max,
        )))
  );
}
