import {
  inventorySlot,
  playerSlots,
  inventoryHelp,
  stackContent,
  stackTitle,
  touchControls,
} from './inventory-ui.js';
import { ITEMS } from './core.js';
import { smeltingRecipe, furnaceStatus } from './furnaces.js';

export function furnacePanel(pack) {
  return `<p>放入原料与燃料，自动连续烧炼。Shift 点击背包物品快速放入。</p>
    <div class="furnace-machine"><div class="furnace-column"><span>原料</span>${inventorySlot(null, 'furnace:input')}<div class="furnace-heat" aria-label="剩余燃料"><i id="furnace-heat"></i></div>${inventorySlot(null, 'furnace:fuel')}<span>燃料</span></div>
    <div class="furnace-process"><span id="furnace-status" role="status"></span><div class="furnace-progress"><i id="furnace-progress"></i></div><small id="furnace-time"></small><small id="furnace-burn"></small></div>
    <div class="furnace-column"><span>产物</span>${inventorySlot(null, 'furnace:output')}</div></div>
    ${playerSlots(pack)}${inventoryHelp}${touchControls}
    <p class="panel-note">面板打开时炉火继续工作。产物满时停止烧炼，但余火仍消耗；岩浆桶烧完留下空桶。</p>`;
}
export function updateFurnacePanel(f) {
  for (const slot of ['input', 'fuel', 'output']) {
    const el = document.querySelector(`[data-inv-slot="furnace:${slot}"]`),
      s = f[slot];
    const signature = s ? `${s.item}:${s.count}` : '';
    if (el.dataset.value !== signature) {
      el.dataset.value = signature;
      el.innerHTML = stackContent(s);
      el.setAttribute(
        'aria-label',
        s
          ? stackTitle(s).replaceAll('\n', ' · ') + ' ×' + s.count
          : '空的' +
              { input: '原料槽', fuel: '燃料槽', output: '产物槽' }[slot],
      );
    }
  }
  const recipe = smeltingRecipe(f.input?.item);
  document.querySelector('#furnace-status').textContent = furnaceStatus(f);
  document.querySelector('#furnace-progress').style.width =
    `${recipe ? Math.min(100, (f.progress / recipe.seconds) * 100) : 0}%`;
  document.querySelector('#furnace-heat').style.height =
    `${f.burnTotal ? (f.burn / f.burnTotal) * 100 : 0}%`;
  document.querySelector('#furnace-time').textContent = recipe
    ? `${ITEMS[recipe.output].name} · ${Math.ceil(recipe.seconds - f.progress)} 秒 / 件`
    : '等待下一炉';
  document.querySelector('#furnace-burn').textContent =
    f.burn > 0 ? `余火 ${Math.ceil(f.burn)} 秒` : '炉火已熄灭';
}
