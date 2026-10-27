import { ITEMS } from './core.js';
import {
  inventorySlot,
  playerSlots,
  inventoryHelp,
  stackTitle,
  stackContent,
} from './inventory-ui.js';
import { enchantLabel } from './enchanting-data.js';

export function chestPanel(chest, pack, type = 'chest') {
  return `<div class="chest-heading"><span>${ITEMS[type].name}</span><span data-storage-usage>${chest.filter(Boolean).length} / ${chest.length} 格</span></div>
    <div class="mc-grid chest-storage ${type === 'hopper' ? 'hopper-storage' : ''}" role="group" aria-label="${ITEMS[type].name}物品">${chest.map((slot, i) => inventorySlot(slot, 'box:' + i)).join('')}</div>
    ${type === 'hopper' ? '<p class="inventory-help">每 0.4 秒沿出口送出 1 件，并从上方取入 1 件。通电停止自身运输与吸入；侧面放置可改变出口。</p>' : ''}
    ${ITEMS[type].portable ? '<p class="inventory-help">拆除后保留所有物品。潜影盒不能装进潜影盒。</p>' : ''}${playerSlots(pack)}${inventoryHelp}
    <div class="inventory-touch-modes" role="group" aria-label="触屏物品操作"><button data-inventory-mode="normal" aria-pressed="true">拿放</button><button data-inventory-mode="single" aria-pressed="false">分半 / 放 1 件</button><button data-inventory-mode="quick" aria-pressed="false">快速转移</button></div>`;
}

// Keep the button nodes stable so simulation does not interrupt drag gestures.
export function updateChestPanel(chest) {
  const usage = document.querySelector('[data-storage-usage]');
  if (usage)
    usage.textContent = `${chest.filter(Boolean).length} / ${chest.length} 格`;
  chest.forEach((stack, i) => {
    const button = document.querySelector(`[data-inv-slot="box:${i}"]`);
    if (!button) return;
    const signature = JSON.stringify(stack);
    if (button.dataset.stack === signature) return;
    button.dataset.stack = signature;
    button.setAttribute(
      'aria-label',
      stack
        ? stackTitle(stack).replaceAll('\n', ' · ') + ' ×' + stack.count
        : '空格',
    );
    button.classList.toggle('empty', !stack);
    button.classList.toggle('enchanted', !!enchantLabel(stack?.wear));
    button.innerHTML = stackContent(stack);
  });
}
