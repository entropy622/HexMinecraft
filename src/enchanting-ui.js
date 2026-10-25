import { ITEMS } from './core.js';
import { enchantLabel } from './enchanting-data.js';
import { enchantOffers } from './enchanting.js';
import { itemIcon as icon } from './icons.js';
import { escapeHTML as escape } from './ui-text.js';

export function enchantingPanel(
  inventory,
  equipment,
  experience,
  shelves,
  seed,
  state,
  creative,
) {
  const copies = Object.entries(inventory)
    .filter(([id, n]) => n > 0 && ITEMS[id].durability)
    .flatMap(([id, n]) =>
      Array.from({ length: n }, (_, index) => ({ id, index })),
    );
  if (!copies.some((c) => c.id === state.id && c.index === state.index)) {
    state.id = copies[0]?.id || null;
    state.index = 0;
  }
  const selected = state.id;
  const pages = Math.max(1, Math.ceil(copies.length / 24));
  state.page = Math.max(0, Math.min(pages - 1, state.page || 0));
  const visibleCopies = copies.slice(state.page * 24, (state.page + 1) * 24);
  const current = selected ? equipment.wear[selected]?.[state.index] : null;
  const enchanted =
    Object.keys(equipment.tags(selected, state.index)).length > 0;
  const offers = selected ? enchantOffers(selected, seed, shelves) : [];
  return `<div class="enchant-heading"><span>等级 <b>${experience.level}</b></span><span>${icon('lapis')} 青金石 <b>${inventory.lapis || 0}</b></span><span>书架 <b>${shelves} / 18</b></span></div>
    <p>选择背包中的一件装备。附魔需要达到等级门槛，只扣除所标示的等级与青金石。两格外放置书架，中间保留两格高的空气通道。</p>
    <div class="enchant-target">${selected ? `${icon(selected)}<strong>${escape(equipment.name(selected, state.index))}</strong><span>耐久 ${equipment.remaining(selected, state.index)} / ${ITEMS[selected].durability}</span><small>${enchantLabel(current) || '尚未附魔'}</small>` : '<span>先制作或取得一件工具、武器、护甲或盾牌。</span>'}</div>
    <div class="enchant-offers">${offers
      .map((offer, i) => {
        const enabled =
          !enchanted &&
          offer.available &&
          (creative ||
            (experience.level >= offer.levels &&
              (inventory.lapis || 0) >= offer.cost));
        return `<button data-enchant-offer="${i}" ${enabled ? '' : 'disabled'}><span class="enchant-number">${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</span><strong>${enchantLabel({ enchant: offer.enchants })}</strong><span>需要 ${offer.levels} 级 · ${offer.shelves} 书架</span><small>消耗 ${offer.cost} 级 ＋ ${offer.cost} 青金石</small></button>`;
      })
      .join('')}</div>
    ${enchanted ? '<p class="panel-note">这件装备已有附魔。当前附魔台只接受未附魔的装备，请选择其他副本。</p>' : ''}
    <div class="section-label">选择装备副本</div><div class="inventory-grid">${visibleCopies
      .map(({ id, index }) => {
        const label = enchantLabel(equipment.wear[id]?.[index]);
        return `<button class="inv-item ${label ? 'enchanted' : ''} ${id === selected && index === state.index ? 'selected' : ''}" data-enchant-item="${id}" data-enchant-copy="${index}" title="${label || '未附魔'}">${icon(id)}<span>${escape(equipment.name(id, index))}</span><small>${equipment.remaining(id, index)}${label ? ' · ✦' : ''}</small></button>`;
      })
      .join(
        '',
      )}</div>${pages > 1 ? `<div class="enchant-pagination"><button data-enchant-page="${state.page - 1}" ${state.page === 0 ? 'disabled' : ''}>上一页</button><span>${state.page + 1} / ${pages}</span><button data-enchant-page="${state.page + 1}" ${state.page === pages - 1 ? 'disabled' : ''}>下一页</button></div>` : ''}<p class="panel-note">效率提高匹配工具的采集速度；锋利提高近战伤害；力量提高弓箭伤害；保护减轻伤害；耐久减少磨损。附魔与这件装备一起存取、掉落和保存。创造模式免除等级和青金石消耗。</p>`;
}
