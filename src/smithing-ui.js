import { ITEMS } from './core.js';
import { enchantLabel, customName, repairPenalty } from './enchanting-data.js';
import { repairMaterial } from './smithing.js';
import { itemIcon as icon } from './icons.js';
import { escapeHTML as escape } from './ui-text.js';

const copyCard = (id, index, equipment) => {
  if (!id || index == null) return '<span class="smith-empty">选择装备</span>';
  return `${icon(id)}<strong>${escape(equipment.name(id, index))}</strong><small>${ITEMS[id].name} · ${equipment.remaining(id, index)} / ${ITEMS[id].durability}</small><small>${enchantLabel(equipment.entry(id, index)) || '未附魔'} · 加工惩罚 ${repairPenalty(equipment.entry(id, index))}</small>`;
};
export function smithingPreview(plan, experience, creative) {
  const enabled = plan.valid && (creative || experience.level >= plan.cost);
  return `${plan.entry ? `<div class="smith-result ${Object.keys(plan.entry.enchant).length ? 'enchanted' : ''}">${icon(plan.id)}<strong>${escape(customName(plan.entry) || ITEMS[plan.id].name)}</strong><span>耐久 ${plan.entry.value} / ${ITEMS[plan.id].durability}</span><small>${enchantLabel(plan.entry) || '未附魔'} · 加工惩罚 ${repairPenalty(plan.entry)}</small></div>` : ''}
    <p class="smith-cost ${enabled ? '' : 'unavailable'}" role="status">${!plan.valid ? plan.reason : creative ? '创造模式 · 免费加工' : plan.cost ? `费用 ${plan.cost} 级 · 当前 ${experience.level} 级${!enabled ? ' · 等级不足' : ''}` : `免费加工${plan.xp ? ' · 返还 ' + plan.xp + ' 点经验' : ''}`}</p>
    ${plan.valid && plan.units ? `<p class="panel-note">消耗 ${icon(plan.material)}${ITEMS[plan.material].name} ×${plan.units}${creative ? '（创造模式免材料）' : ''}</p>` : ''}
    <button class="primary smith-confirm" data-smith-confirm ${enabled ? '' : 'disabled'}>确认加工${plan.right != null ? ' · 消耗右侧副本' : ''}</button>`;
}
export function smithingPanel(
  kind,
  inventory,
  equipment,
  state,
  plan,
  experience,
  creative,
) {
  const grind = kind === 'grindstone';
  const material = repairMaterial(state.id);
  const copies = Object.entries(inventory)
    .filter(([id, n]) => n > 0 && ITEMS[id].durability)
    .flatMap(([id, n]) =>
      Array.from({ length: n }, (_, index) => ({ id, index })),
    )
    .filter(
      (c) =>
        state.slot !== 'right' ||
        (c.id === state.id && c.index !== state.index),
    );
  const pages = Math.max(1, Math.ceil(copies.length / 24));
  state.page = Math.max(0, Math.min(pages - 1, state.page || 0));
  return `<p>${grind ? '祛魔会移除所有现有附魔并返还部分经验；也能将两件同类装备合为一件。' : '修复与合并保留附魔。相同附魔同级可升一级，最高不超过附魔上限；反复加工会增加费用。'}</p>
    <div class="smith-modes" role="group" aria-label="加工方式">${(grind
      ? [
          ['single', '祛魔'],
          ['combine', '合并并祛魔'],
        ]
      : [
          ['material', '材料修复'],
          ['combine', '同类合并'],
          ['rename', '命名'],
        ]
    )
      .map(
        ([mode, name]) =>
          `<button data-smith-mode="${mode}" aria-pressed="${state.mode === mode}">${name}</button>`,
      )
      .join('')}</div>
    <div class="smith-inputs"><button class="smith-copy ${state.slot === 'left' ? 'selected' : ''}" data-smith-slot="left" aria-label="选择要加工的装备">${copyCard(state.id, state.index, equipment)}</button><span class="smith-plus">${state.mode === 'combine' ? '＋' : '◇'}</span>${state.mode === 'combine' ? `<button class="smith-copy ${state.slot === 'right' ? 'selected' : ''}" data-smith-slot="right" aria-label="选择会被消耗的同类装备">${copyCard(state.id, state.right, equipment)}</button>` : `<div class="smith-material">${!grind && state.mode === 'material' && material ? `${icon(material)}<span>${ITEMS[material].name} ×${inventory[material] || 0}</span>` : `<span>${grind ? '取回经验' : '保留装备'}</span>`}</div>`}</div>
    ${!grind ? `<label class="smith-name" for="smith-name">装备名称 <input id="smith-name" type="text" maxlength="48" value="${escape(state.name || '')}" placeholder="最多 24 字；留空恢复原名" autocomplete="off"></label>` : ''}
    ${!grind && state.mode === 'material' ? `<div class="smith-amount">每次最多使用 ${[1, 2, 4].map((n) => `<button data-smith-amount="${n}" aria-pressed="${state.amount === n}">${n}</button>`).join('')} 份材料，每份恢复 25% 耐久。</div>` : ''}
    <div id="smith-preview">${smithingPreview(plan, experience, creative)}</div>
    <div class="section-label">${state.slot === 'right' ? '选择将被消耗的同类副本' : '选择要保留的装备'}</div><div class="inventory-grid smith-inventory">${copies
      .slice(state.page * 24, (state.page + 1) * 24)
      .map(
        ({ id, index }) =>
          `<button class="inv-item ${enchantLabel(equipment.entry(id, index)) ? 'enchanted' : ''} ${id === state.id && index === (state.slot === 'right' ? state.right : state.index) ? 'selected' : ''}" data-smith-item="${id}" data-smith-copy="${index}" title="${escape(equipment.name(id, index))} · ${enchantLabel(equipment.entry(id, index)) || '未附魔'}">${icon(id)}<span>${escape(equipment.name(id, index))}</span><small>${equipment.remaining(id, index)}</small></button>`,
      )
      .join('')}</div>
    ${pages > 1 ? `<div class="enchant-pagination"><button data-smith-page="${state.page - 1}" ${state.page === 0 ? 'disabled' : ''}>上一页</button><span>${state.page + 1} / ${pages}</span><button data-smith-page="${state.page + 1}" ${state.page === pages - 1 ? 'disabled' : ''}>下一页</button></div>` : ''}
    ${!copies.length ? '<p class="panel-note">没有可选装备。先制作或取回一件；右侧需要另一件完全相同类型的装备。</p>' : ''}
    <p class="panel-note">确认前不会消耗物品。${grind ? '名称保留，加工惩罚重置；祛魔后的装备可重新附魔。' : '达到 40 级的加工在生存模式下无法进行，单独命名最多 39 级。每次使用有 12% 概率损耗铁砧，共三阶段。'}创造模式免除等级${grind ? '，不返还经验' : '与材料'}，同类合并仍消耗右侧副本。</p>`;
}
