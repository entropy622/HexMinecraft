import { ITEMS } from './core.js';
import { enchantLabel, customName, wearValue } from './enchanting-data.js';
import { enchantOffers } from './enchanting.js';
import { itemIcon as icon } from './icons.js';
import { escapeHTML as escape } from './ui-text.js';
import {
  inventorySlot,
  playerSlots,
  inventoryHelp,
  touchControls,
} from './inventory-ui.js';

export function enchantingPanel(
  pack,
  slots,
  experience,
  shelves,
  seed,
  creative,
) {
  const target = slots[0],
    lapis = slots[1]?.count || 0;
  const enchanted = !!enchantLabel(target?.wear);
  const offers = target ? enchantOffers(target.item, seed, shelves) : [];
  return `<div class="enchanting-workbench"><div class="enchant-heading"><span>等级 <b>${experience.level}</b></span><span>书架 <b>${shelves} / 18</b></span><span>${icon('lapis')} 槽内青金石 <b>${lapis}</b></span></div>
    <div class="enchant-machine"><label>附魔装备${inventorySlot(target, 'enchant:0', '◇')}<small>${target ? escape(customName(target.wear) || ITEMS[target.item].name) : '放入一件装备'}</small></label><span class="enchant-runes" aria-hidden="true">⟐<br>⬡<br>⟐</span><label>青金石${inventorySlot(slots[1], 'enchant:1', '✦')}<small>每次消耗 1–3 个</small></label></div>
    ${target ? `<div class="equipment-description">耐久 ${wearValue(target.wear)} / ${ITEMS[target.item].durability}${enchanted ? '<br>' + escape(enchantLabel(target.wear)) : ''}</div>` : ''}
    <div class="enchant-offers">${
      offers.length
        ? offers
            .map((offer, i) => {
              const enabled =
                !enchanted &&
                offer.available &&
                (creative ||
                  (experience.level >= offer.levels && lapis >= offer.cost));
              return `<button data-enchant-offer="${i}" ${enabled ? '' : 'disabled'}><span class="enchant-number">${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</span><strong>${enchantLabel({ enchant: offer.enchants })}</strong><span>需要 ${offer.levels} 级 · ${offer.shelves} 书架</span><small>${creative ? '创造模式 · 免费附魔' : `消耗 ${offer.cost} 级 ＋ 槽内 ${offer.cost} 青金石`}</small></button>`;
            })
            .join('')
        : '<p class="station-slot-note">将装备放进左槽，青金石放进右槽，再选择附魔。Shift 点击背包可快速放入。</p>'
    }</div>
    ${enchanted ? '<p class="station-slot-note">这件装备已有附魔，可取回后用铁砧合并或用砂轮祛魔。</p>' : ''}
    <button data-station-return="enchant" class="station-return">收回槽位物品</button>
    ${playerSlots(pack)}${touchControls}<details class="station-slot-help"><summary>物品操作与附魔说明</summary>${inventoryHelp}<p>附魔直接作用于槽内这件装备，完成后留在槽中。两格外的书架可提升档位，中间保留两格高的空气通道。创造模式免等级与青金石消耗，但仍需要书架。关闭时收回槽位物品，背包满则落地。</p></details></div>`;
}
