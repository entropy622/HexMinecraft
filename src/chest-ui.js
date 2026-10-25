import { CHEST_SLOTS } from './chests.js';
import { inventorySlot, playerSlots, inventoryHelp } from './inventory-ui.js';

export function chestPanel(chest, pack) {
  return `<div class="chest-heading"><span>储物箱</span><span>${chest.filter(Boolean).length} / ${CHEST_SLOTS} 格</span></div>
    <div class="mc-grid chest-storage" role="group" aria-label="箱子物品">${chest.map((slot, i) => inventorySlot(slot, 'box:' + i)).join('')}</div>
    ${playerSlots(pack)}${inventoryHelp}
    <div class="inventory-touch-modes" role="group" aria-label="触屏物品操作"><button data-inventory-mode="normal" aria-pressed="true">拿放</button><button data-inventory-mode="single" aria-pressed="false">分半 / 放 1 件</button><button data-inventory-mode="quick" aria-pressed="false">快速转移</button></div>`;
}
