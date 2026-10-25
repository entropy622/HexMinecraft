import { ITEMS } from './core.js';
import { ARMOR_SLOTS } from './gear-data.js';
import { GEAR_SLOTS, stackSize } from './inventory.js';
import { enchantLabel, customName, wearValue } from './enchanting-data.js';
import { potionDescription } from './brewing-data.js';
import { FOODS } from './survival.js';
import { itemIcon as icon } from './icons.js';
import { THROWABLES } from './throwable-data.js';
import { PORTABLE_SLOTS } from './shulker-data.js';
import { escapeHTML as escape } from './ui-text.js';

export function stackTitle(s) {
  if (!s) return '';
  const item = ITEMS[s.item];
  return [
    customName(s.wear) || item.name,
    enchantLabel(s.wear),
    potionDescription(s.item),
    item.glider ? '放入胸甲格 · 空中再次按空格展开 · 俯冲加速、抬头爬升' : '',
    s.item === 'fireworkRocket' ? '滑翔中右键 / E 助推 · 地面使用可放烟花' : '',
    s.item === 'phantomMembrane' ? '铁砧修复鞘翅 · 每片恢复最多 108 耐久' : '',
    s.item === 'chorusFruit'
      ? '可饱腹食用 · 随机折跃到附近地面 · 熔炉可烧成爆裂紫颂果'
      : '',
    s.item === 'chorusFlower'
      ? '种在末地石或紫颂枝干上 · 自然分枝，无需水与光照'
      : '',
    s.item === 'poppedChorusFruit' ? '用于制作紫珀与末地烛' : '',
    item.portable
      ? `已用 ${s.contents?.filter(Boolean).length || 0}/${PORTABLE_SLOTS} 格 · 拆除保留物品`
      : '',
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
export function containerPreview(stack) {
  if (!ITEMS[stack?.item]?.portable) return '';
  const slots = stack.contents || Array(PORTABLE_SLOTS).fill(null);
  return `<div class="container-preview" aria-label="潜影盒内容">${slots
    .map(
      (s) =>
        `<span class="container-preview-slot" title="${escape(s ? stackTitle(s).replaceAll('\n', ' · ') : '空格')}">${stackContent(s)}</span>`,
    )
    .join('')}</div>`;
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
export const inventoryHelp = `<p class="inventory-help">左键：整组拿放 · 右键：拿半组 / 放 1 件 · Shift：快速转移<br>按住左键拖过格子均分，右键拖动逐格放 1 件 · 双击空下来的格子归拢同类<br>Shift 双击：批量转移同类物品 · 空游标悬停时 1–9 换快捷栏 / F 换副手<br>空游标悬停时 Q 丢 1 件 / Ctrl+Q 丢一组 · 拿着物品点击面板外：左键丢一组 / 右键丢 1 件<br>副手可放任意物品，按物品上限堆叠；盾牌按 R 使用，其他物品换到主手后使用</p>`;
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
