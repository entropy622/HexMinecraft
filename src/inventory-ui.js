import { ITEMS } from './core.js';
import { ARMOR_SLOTS } from './gear-data.js';
import { GEAR_SLOTS, stackSize } from './inventory.js';
import { enchantLabel, customName, wearValue } from './enchanting-data.js';
import { potionDescription } from './brewing-data.js';
import { FOODS } from './survival.js';
import { itemIcon as icon } from './icons.js';
import { THROWABLES } from './throwable-data.js';
import { escapeHTML as escape } from './ui-text.js';

export function stackTitle(s) {
  if (!s) return '';
  const item = ITEMS[s.item];
  return [
    customName(s.wear) || item.name,
    enchantLabel(s.wear),
    potionDescription(s.item),
    THROWABLES[s.item]?.hint,
    item.durability ? `耐久 ${wearValue(s.wear)} / ${item.durability}` : '',
    item.armor ? `护甲 +${item.armor}` : '',
    FOODS[s.item] && !item.potion
      ? `饱食 +${FOODS[s.item].food} · 饱和 +${FOODS[s.item].saturation}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
export function stackContent(s, ghost = '') {
  if (!s) return ghost ? `<span class="slot-ghost">${ghost}</span>` : '';
  const max = ITEMS[s.item].durability,
    value = wearValue(s.wear);
  const ratio = max ? value / max : 1;
  return `${icon(s.item)}${s.count > 1 ? `<b class="stack-count">${s.count}</b>` : ''}${ratio < 1 ? `<span class="stack-wear"><i style="width:${ratio * 100}%;background:hsl(${ratio * 110} 70% 48%)"></i></span>` : ''}`;
}
export function inventorySlot(stack, ref, ghost = '') {
  return `<button class="mc-slot ${stack ? '' : 'empty'} ${enchantLabel(stack?.wear) ? 'enchanted' : ''}" data-inv-slot="${ref}" aria-label="${escape(stack ? stackTitle(stack).replaceAll('\n', ' · ') + ' ×' + stack.count : ghost || '空格')}" type="button">${stackContent(stack, ghost)}</button>`;
}
export const inventoryHelp = `<p class="inventory-help">左键：整组拿放 · 右键：拿半组 / 放 1 件 · Shift：快速转移<br>按住左键拖过格子均分，右键拖动逐格放 1 件 · 双击归拢同类<br>悬停时 1–9 与快捷栏交换 · Q 丢 1 件 / Ctrl+Q 丢一组 · 拿着物品点击面板外丢出</p>`;
export const touchControls = `<div class="inventory-touch-modes" role="group" aria-label="触屏物品操作"><button data-inventory-mode="normal" aria-pressed="true">拿放</button><button data-inventory-mode="single" aria-pressed="false">分半 / 放 1 件</button><button data-inventory-mode="quick" aria-pressed="false">快速转移</button></div>`;
export function playerSlots(pack, gear = false) {
  return `${gear ? `<div class="equipment-row">${GEAR_SLOTS.map((id, i) => `<label>${ARMOR_SLOTS[id] || '副手'}${inventorySlot(pack.gear[i], 'gear:' + i, id === 'offhand' ? '⬡' : '◇')}</label>`).join('')}</div>` : ''}
    <div class="pack-label">物品栏</div><div class="mc-grid pack-main">${pack.slots
      .slice(9)
      .map((s, i) => inventorySlot(s, 'pack:' + (i + 9)))
      .join('')}</div>
    <div class="mc-grid pack-hotbar" aria-label="快捷栏">${pack.slots
      .slice(0, 9)
      .map((s, i) => inventorySlot(s, 'pack:' + i))
      .join('')}</div>`;
}
export function creativePalette() {
  return `<details class="creative-palette" open><summary>创造物品库</summary><input id="creative-search" placeholder="搜索物品…" aria-label="搜索创造物品"><div class="palette-grid">${Object.entries(
    ITEMS,
  )
    .filter(([id, item]) => id !== 'bedrock' && !item.internal)
    .map(
      ([id, item]) =>
        `<button class="mc-slot" data-creative-item="${id}" data-search="${escape(item.name + ' ' + id.toLowerCase())}" aria-label="${escape(item.name)}">${icon(id)}</button>`,
    )
    .join(
      '',
    )}</div><p class="inventory-help">点击拿取一组，放进背包或快捷栏；鼠标中键可复制一组。</p></details>`;
}
export function cursorMarkup(s) {
  return s
    ? `<div class="mc-slot ${enchantLabel(s.wear) ? 'enchanted' : ''}">${stackContent(s)}</div>`
    : '';
}
export const paletteStack = (id) => ({
  item: id,
  count: stackSize(id),
  ...(ITEMS[id]?.durability ? { wear: ITEMS[id].durability } : {}),
});
