import { ITEMS } from './core.js';
import {
  ENCHANTS,
  enchantmentsOf,
  repairPenalty,
  customName,
  cleanName,
} from './enchanting-data.js';

export function repairMaterial(id) {
  const def = ITEMS[id];
  if (!def?.durability) return null;
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
export function smithingPlan(kind, state, inventory, equipment, creative) {
  const { id, index, mode, right } = state;
  const invalid = (reason) => ({ valid: false, reason });
  if (
    !(
      kind === 'grindstone'
        ? ['single', 'combine']
        : ['material', 'combine', 'rename']
    ).includes(mode)
  )
    return invalid('请选择加工方式。');
  const def = ITEMS[id];
  if (
    !def?.durability ||
    !Number.isInteger(index) ||
    index < 0 ||
    !(inventory[id] > index)
  )
    return invalid('先选择一件背包中的装备。');
  const left = equipment.entry(id, index);
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
  const material = repairMaterial(id);
  if (mode === 'combine') {
    if (
      !Number.isInteger(right) ||
      right === index ||
      right < 0 ||
      !(inventory[id] > right)
    )
      return invalid('在右侧选择另一件同类装备，合并会消耗它。');
    donor = equipment.entry(id, right);
    entry.value = Math.min(
      def.durability,
      equipment.remaining(id, index) +
        equipment.remaining(id, right) +
        Math.floor(def.durability * (kind === 'grindstone' ? 0.05 : 0.12)),
    );
    changed = entry.value > equipment.remaining(id, index);
    if (changed) levels += 2;
  } else if (kind !== 'grindstone' && mode === 'material') {
    if (!material)
      return invalid('这种装备不能用材料修复，请选择同类合并或命名。');
    if (entry.value >= def.durability) return invalid('这件装备的耐久已满。');
    units = Math.min(
      Math.max(1, Math.min(4, state.amount || 1)),
      creative ? 4 : inventory[material] || 0,
      Math.ceil((def.durability - entry.value) / Math.ceil(def.durability / 4)),
    );
    if (!units) return invalid('缺少修复材料：' + ITEMS[material].name + '。');
    entry.value = Math.min(
      def.durability,
      entry.value + units * Math.ceil(def.durability / 4),
    );
    levels += units;
    changed = true;
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
    const renamed = cleanName(state.name) !== customName(left);
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
    if (cleanName(state.name)) entry.name = cleanName(state.name);
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
    index,
    right: donor === null ? null : right,
    entry,
    cost: kind === 'grindstone' ? 0 : levels,
    xp,
    material,
    units,
  };
}
