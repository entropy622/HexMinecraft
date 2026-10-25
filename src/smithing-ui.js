import { ITEMS } from './core.js';
import { enchantLabel, customName, repairPenalty } from './enchanting-data.js';
import { repairMaterial } from './smithing.js';
import { ingredientName } from './wood-ingredients.js';
import { itemIcon as icon } from './icons.js';
import { escapeHTML as escape } from './ui-text.js';
import {
  inventorySlot,
  playerSlots,
  inventoryHelp,
  touchControls,
} from './inventory-ui.js';

export function smithingPreview(plan, experience, creative) {
  const enabled = plan.valid && (creative || experience.level >= plan.cost);
  const result = plan.entry
    ? { item: plan.id, count: 1, wear: plan.entry }
    : null;
  const slot = inventorySlot(result, 'smith:output', '?').replace(
    'type="button"',
    `${enabled ? '' : 'disabled'} type="button"`,
  );
  return `<div class="smith-output-slot"><span>加工产物</span>${slot}<strong>${result ? escape(customName(plan.entry) || ITEMS[plan.id].name) : '等待加工'}</strong>${result ? `<small>耐久 ${plan.entry.value} / ${ITEMS[plan.id].durability}</small><small>${escape(enchantLabel(plan.entry) || '未附魔')} · 加工惩罚 ${repairPenalty(plan.entry)}</small>` : ''}</div>
    <p class="smith-cost ${enabled ? '' : 'unavailable'}" role="status">${!plan.valid ? plan.reason : creative ? '创造模式 · 免费等级' : plan.cost ? `费用 ${plan.cost} 级 · 当前 ${experience.level} 级${!enabled ? ' · 等级不足' : ''}` : `免费加工${plan.xp ? ' · 返还 ' + plan.xp + ' 点经验' : ''}`}</p>
    ${plan.valid && plan.consumeRight ? `<p class="smith-consumes">消耗右槽 ${plan.units ? `${icon(plan.material)} ${ITEMS[plan.material].name} ×${plan.units}` : '同类装备 ×1'}</p>` : ''}`;
}
export function smithingPanel(
  kind,
  pack,
  slots,
  name,
  plan,
  experience,
  creative,
) {
  const grind = kind === 'grindstone',
    left = slots[0],
    right = slots[1];
  const material = repairMaterial(left?.item);
  const materialLabel = material
    ? ingredientName({}, material, ITEMS[material].name)
    : '';
  return `<div class="smithing-workbench"><p class="station-slot-note">${grind ? '左槽放装备祛魔；再放入一件同类装备可合并修复。' : '左槽放装备，右槽放修复材料或同类装备。只命名时右槽留空。'}取出产物时才会消耗物品${grind ? '' : '与等级'}。</p>
    ${!grind ? `<label class="smith-name" for="smith-name">装备名称 <input id="smith-name" type="text" maxlength="48" value="${escape(name)}" placeholder="留空恢复原名 · 最多 24 字" autocomplete="off"></label>` : ''}
    <div class="smith-work-row"><label>保留的装备${inventorySlot(left, 'smith:0', '◇')}<small>${left ? escape(customName(left.wear) || ITEMS[left.item].name) : '放入装备'}</small></label><span class="smith-symbol">＋</span><label>${grind ? '同类装备' : '材料 / 同类装备'}${inventorySlot(right, 'smith:1', '◇')}<small>${right ? escape(customName(right.wear) || ITEMS[right.item].name) : !grind && material ? materialLabel + ' / 同类装备' : '可留空'}</small></label><span class="smith-symbol">➜</span><div id="smith-preview">${smithingPreview(plan, experience, creative)}</div></div>
    <button data-station-return="smith" class="station-return">收回槽位物品</button>
    ${playerSlots(pack)}${touchControls}<details class="station-slot-help"><summary>物品操作与加工说明</summary>${inventoryHelp}<p>${grind ? '祛魔保留名称，重置加工惩罚；取出后返还经验。' : '每份材料修复最大耐久的约 25%，只消耗实际需要的份数。相同附魔同级合并可升级；反复加工会增加费用，生存达到 40 级无法加工。铁砧每次使用有 12% 概率损耗，共三阶段。'}创造免等级费用${grind ? '且不返还经验' : ''}，实际放入的装备与修复材料仍会消耗。关闭时归还输入物品，背包满则落地。</p></details></div>`;
}
