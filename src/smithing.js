import { ITEMS } from './core.js';
import { ingredientMatches, ingredientName } from './wood-ingredients.js';
import {
  ENCHANTS,
  enchantmentsOf,
  repairPenalty,
  customName,
  cleanName,
  wearValue,
} from './enchanting-data.js';

export function repairMaterial(id) {
  const def = ITEMS[id];
  if (!def?.durability) return null;
  if (def.repair) return def.repair;
  if (def.armorSlot)
    return id.startsWith('leather')
      ? 'leather'
      : id.startsWith('iron')
        ? 'ingot'
        : 'diamond';
  if (id === 'shield') return 'planks';
  if (id === 'shears') return 'ingot';
  if (['pick', 'axe', 'sword', 'shovel', 'hoe'].includes(def.kind))
    return [null, 'planks', 'stone', 'ingot', 'diamond'][def.tier] || null;
  return null;
}
const enchantWeights = {
  efficiency: 1,
  sharpness: 1,
  protection: 1,
  power: 1,
  unbreaking: 2,
};
const grindXP = (entry) =>
  Object.entries(enchantmentsOf(entry)).reduce(
    (sum, [key, rank]) =>
      sum +
      (key === 'unbreaking'
        ? 5 + 8 * (rank - 1)
        : 1 +
          (['sharpness', 'protection'].includes(key) ? 11 : 10) * (rank - 1)),
    0,
  );

// Plans never mutate inventory. The click handler recomputes the same plan before spending.
export function smithingPlan(
  kind,
  leftStack,
  rightStack,
  name = '',
  creative = false,
) {
  const id = leftStack?.item;
  const invalid = (reason) => ({ valid: false, reason });
  const def = ITEMS[id];
  if (!def?.durability) return invalid('将要加工的装备放入左侧槽位。');
  const expectedMaterial = repairMaterial(id);
  const material =
    rightStack && ingredientMatches({}, expectedMaterial, rightStack.item)
      ? rightStack.item
      : expectedMaterial;
  const mode = !rightStack
    ? 'single'
    : rightStack.item === id
      ? 'combine'
      : 'material';
  if (
    rightStack &&
    mode === 'material' &&
    (kind === 'grindstone' || rightStack.item !== material)
  )
    return invalid(
      kind === 'grindstone'
        ? '砂轮右侧需要同类装备。'
        : `右侧放同类装备${material ? '或' + ingredientName({}, material, ITEMS[material].name) : ''}；仅命名时留空。`,
    );
  const left = leftStack.wear;
  const entry =
    typeof left === 'number'
      ? { value: left, enchant: {} }
      : structuredClone(left);
  const oldTags = enchantmentsOf(left);
  let donor = null,
    changed = false,
    levels = 0,
    xp = 0,
    units = 0;
  if (mode === 'combine') {
    donor = rightStack.wear;
    entry.value = Math.min(
      def.durability,
      wearValue(left) +
        wearValue(donor) +
        Math.floor(def.durability * (kind === 'grindstone' ? 0.05 : 0.12)),
    );
    changed = entry.value > wearValue(left);
    if (changed) levels += 2;
  } else if (kind !== 'grindstone' && mode === 'material') {
    if (!material)
      return invalid('这种装备不能用材料修复，请选择同类合并或命名。');
    units = Math.min(
      4,
      rightStack.count,
      Math.ceil((def.durability - entry.value) / Math.ceil(def.durability / 4)),
    );
    entry.value = Math.min(
      def.durability,
      entry.value + units * Math.ceil(def.durability / 4),
    );
    levels += units;
    changed = units > 0;
  }
  if (kind === 'grindstone') {
    xp = Math.ceil((grindXP(left) + grindXP(donor)) / 2);
    changed ||=
      Object.keys(oldTags).length > 0 ||
      repairPenalty(left) > 0 ||
      Object.keys(enchantmentsOf(donor)).length > 0;
    if (!changed)
      return invalid(
        '这件装备没有可祛除的附魔或加工惩罚；可选另一件同类装备修复。',
      );
    entry.enchant = {};
    delete entry.work;
  } else {
    if (donor) {
      entry.enchant = { ...oldTags };
      for (const [key, rank] of Object.entries(enchantmentsOf(donor))) {
        const before = entry.enchant[key] || 0;
        const next = Math.min(
          ENCHANTS[key].max,
          before === rank ? rank + 1 : Math.max(before, rank),
        );
        if (next > before) {
          entry.enchant[key] = next;
          levels += enchantWeights[key] * next;
          changed = true;
        }
      }
    }
    if (donor && !changed)
      return invalid('右侧装备不能改善耐久或附魔，请换一件同类装备。');
    const renamed = cleanName(name) !== customName(left);
    if (!changed && !renamed)
      return invalid('当前操作不会改善装备或改变名称。');
    const renameOnly = !changed;
    if (renamed) levels++;
    levels += repairPenalty(left) + repairPenalty(donor);
    if (renameOnly) levels = Math.min(39, levels);
    else
      entry.work = Math.min(
        63,
        Math.max(repairPenalty(left), repairPenalty(donor)) * 2 + 1,
      );
    if (cleanName(name)) entry.name = cleanName(name);
    else delete entry.name;
    if (levels >= 40 && !creative)
      return {
        ...invalid(
          '费用过于昂贵：达到 40 级上限。可以用砂轮祛魔并重置加工惩罚。',
        ),
        id,
        cost: levels,
        entry,
      };
  }
  return {
    valid: true,
    id,
    consumeRight: donor === null ? units : 1,
    entry,
    cost: kind === 'grindstone' ? 0 : levels,
    xp,
    material,
    units,
  };
}
