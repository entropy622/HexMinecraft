import { ITEMS } from './core.js';
import { CHEST_SLOTS, inventoryPage } from './chests.js';
import { INVENTORY_SLOTS, usedSlots } from './inventory.js';
import { itemIcon as icon } from './icons.js';

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const slotButton = (slot, side, index) => {
  if (!slot) return '<div class="chest-slot empty" aria-hidden="true"></div>';
  const def = ITEMS[slot.item];
  const title = `${def.name} ×${slot.count}${def.durability ? ` · 耐久 ${slot.wear}/${def.durability}` : ''}`;
  return `<button class="chest-slot" data-chest-side="${side}" data-item="${slot.item}" data-index="${index}" data-offset="${slot.offset || 0}" data-count="${slot.count}" title="${escape(title)}" aria-label="${side === 'box' ? '取出' : '存入'} ${escape(title)}">
    ${icon(slot.item)}<b>${slot.count}</b>${def.durability ? `<span class="chest-wear"><i style="width:${(slot.wear / def.durability) * 100}%"></i></span>` : ''}
    <span class="chest-slot-name">${escape(def.name)}</span></button>`;
};

export function chestPanel(chest, inventory, wear, state, creative) {
  const pack = inventoryPage(inventory, wear, state.page, state.query);
  state.page = pack.page;
  const occupied = chest.filter(Boolean).length;
  return `<div class="chest-heading"><span>独立储物 · ${occupied} / ${CHEST_SLOTS} 格</span><span>每格最多一组</span></div>
    <div class="chest-controls" role="group" aria-label="存取数量">${[
      ['one', '单件'],
      ['half', '半组'],
      ['stack', '整组'],
    ]
      .map(
        ([id, name]) =>
          `<button data-chest-amount="${id}" aria-pressed="${state.amount === id}">${name}</button>`,
      )
      .join('')}</div>
    <div class="chest-grid" role="group" aria-label="箱子物品">${chest.map((slot, i) => slotButton(slot, 'box', i)).join('')}</div>
    <div class="chest-actions"><button data-chest-action="take-all">取出全部</button><button data-chest-action="matching">补存同类</button><button data-chest-action="sort">整理箱子</button></div>
    <div class="chest-heading"><span>背包 → 箱子</span><span>${usedSlots(inventory)} / ${creative ? '∞' : INVENTORY_SLOTS} 格</span></div>
    <div class="chest-search"><input id="chest-search" placeholder="筛选背包物品…" aria-label="筛选背包物品" value="${escape(state.query)}"><span>${pack.total} 组</span></div>
    <div class="chest-grid" role="group" aria-label="背包物品">${pack.slots.map((slot, i) => slotButton(slot, 'pack', i)).join('')}</div>
    <div class="chest-pagination"><button data-chest-page="-1" ${pack.page === 0 ? 'disabled' : ''}>上一页</button><span>${pack.page + 1} / ${pack.pages}</span><button data-chest-page="1" ${pack.page + 1 >= pack.pages ? 'disabled' : ''}>下一页</button></div>
    <p class="panel-note">点击物品按所选数量存取 · 右键取/存 1 件 · Shift 点击整组。补存同类会保留当前手持物、护甲与副手装备各 1 件。空间不足的物品留在原处；装备耐久逐件保留。</p>`;
}
