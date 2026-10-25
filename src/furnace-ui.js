import { ITEMS } from './core.js';
import { itemIcon as icon } from './icons.js';
import { FUELS, smeltingRecipe, furnaceStatus } from './furnaces.js';
import { SMELTING } from './exploration-data.js';

export function furnacePanel(inventory, creative, amount) {
  const list = (slot, ids) =>
    ids
      .filter((id) => creative || inventory[id] > 0)
      .map(
        (id) =>
          `<button class="inv-item" data-furnace-deposit="${slot}" data-item="${id}">${icon(id)}${ITEMS[id].name}<b>${creative ? '∞' : inventory[id]}</b>${slot === 'fuel' ? `<small>${FUELS[id]} 秒</small>` : ''}</button>`,
      )
      .join('') || '<p class="panel-note">背包里没有可用物品。</p>';
  return `<p>放入原料与燃料，自动连续烧炼。点击炉内物品取出。</p>
    <div class="furnace-controls" role="group" aria-label="存取数量">每次存取 ${[1, 8, 64].map((n) => `<button data-furnace-amount="${n}" aria-pressed="${n === amount}">${n === 64 ? '一组' : n}</button>`).join('')}</div>
    <div class="furnace-machine"><div class="furnace-column"><span>原料</span><button class="furnace-slot" data-furnace-take="input" aria-label="取出原料"></button><div class="furnace-heat" aria-label="剩余燃料"><i id="furnace-heat"></i></div><button class="furnace-slot" data-furnace-take="fuel" aria-label="取出燃料"></button><span>燃料</span></div>
    <div class="furnace-process"><span id="furnace-status" role="status"></span><div class="furnace-progress"><i id="furnace-progress"></i></div><small id="furnace-time"></small><small id="furnace-burn"></small></div>
    <div class="furnace-column"><span>产物</span><button class="furnace-slot furnace-output" data-furnace-take="output" aria-label="取出产物"></button></div></div>
    <div class="section-label">原料 → 熔炉</div><div class="inventory-grid">${list('input', [...new Set(Object.values(SMELTING).map((r) => r.input))])}</div>
    <div class="section-label">燃料 → 熔炉</div><div class="inventory-grid">${list('fuel', Object.keys(FUELS))}</div>
    <p class="panel-note">面板打开时炉火继续工作。产物满时停止烧炼，但余火仍消耗；未加载区域与暂停菜单会暂停熔炉。岩浆桶烧完留下空桶。</p>`;
}
export function updateFurnacePanel(f) {
  for (const slot of ['input', 'fuel', 'output']) {
    const el = document.querySelector(`[data-furnace-take="${slot}"]`),
      s = f[slot];
    const signature = s ? `${s.item}:${s.count}` : '';
    if (el.dataset.value !== signature) {
      el.dataset.value = signature;
      el.innerHTML = s
        ? `${icon(s.item)}<b>${s.count}</b><small>${ITEMS[s.item].name}</small>`
        : '<span>空</span>';
      el.disabled = !s;
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
