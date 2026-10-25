import { ITEMS } from './core.js';
import { itemIcon } from './icons.js';
import {
  inventorySlot,
  playerSlots,
  inventoryHelp,
  touchControls,
} from './inventory-ui.js';
import { stonecuttingRecipes, stonecuttingResult } from './stonecutting.js';
export function stonecutterPanel(pack, input, selection) {
  const recipes = stonecuttingRecipes(input?.item),
    result = stonecuttingResult(input, selection);
  return `<div class="stonecutting-workbench"><p>放入石材并选择形状，取出产物时才扣一份原料。不需要燃料。</p>
    <div class="stonecut-row"><label>石材${inventorySlot(input, 'stonecut:input')}</label><div class="stonecut-recipes" aria-label="切石产物">${recipes.length ? recipes.map((r) => `<button data-stonecut="${r.output}" class="stonecut-recipe ${selection === r.output ? 'selected' : ''}" aria-pressed="${selection === r.output}">${itemIcon(r.output)}<span>${ITEMS[r.output].name}<small>1 份原料 → ${r.count} 件</small></span></button>`).join('') : '<p>放入石头、圆石、砂岩、砖或其他可切石材。</p>'}</div><span class="smith-symbol">➜</span><label>产物${inventorySlot(result, 'stonecut:output', '?')}<small>${result ? ITEMS[result.item].name + ' ×' + result.count : input ? '选择一种形状' : '等待石材'}</small></label></div>
    <button data-station-return="stonecut" class="station-return">收回原料</button>${playerSlots(pack)}${touchControls}<details class="station-slot-help"><summary>物品操作与加工说明</summary>${inventoryHelp}<p>一份石材可切两块半砖或一段楼梯。Shift 取产物时持续加工，只有完整一批能放进背包才扣料。数字键与 F 仅向空的快捷栏 / 副手取产物。关闭时原料回到背包，空间不足则落地。</p></details></div>`;
}
