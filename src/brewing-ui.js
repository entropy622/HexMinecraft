import { ITEMS } from './core.js';
import { itemIcon as icon } from './icons.js';
import {
  POTIONS,
  BREW_INGREDIENTS,
  BREW_TRANSFORMS,
  potionDescription,
} from './brewing-data.js';
import { BREW_SECONDS, brewingOutputs, brewingStatus } from './brewing.js';
export function brewingPanel(inventory, creative, state) {
  const list = (ids, kind) =>
    ids
      .filter((id) => creative || inventory[id] > 0)
      .map(
        (id) =>
          `<button class="inv-item" data-brew-add="${kind}" data-item="${id}" title="${potionDescription(id) || ITEMS[id].name}">${icon(id)}<span>${ITEMS[id].name}</span><b>${creative ? '∞' : inventory[id]}</b></button>`,
      )
      .join('') || '<p class="panel-note">背包中暂无可用物品。</p>';
  return `<p>每批 20 秒，一份原料最多转化三瓶。烈焰粉提供 20 批能量；多余原料会留在台内。</p>
    <div class="furnace-controls" role="group" aria-label="原料与燃料存取数量">每次存取 ${[1, 8, 64].map((n) => `<button data-brew-amount="${n}" aria-pressed="${state.amount === n}">${n === 64 ? '一组' : n}</button>`).join('')}</div>
    <div class="brewing-machine"><div class="brew-inputs"><div><span>酿造原料</span><button class="furnace-slot" data-brew-take="ingredient" aria-label="取出原料"></button></div><div class="brew-bubbles" aria-hidden="true">⬡<br>⬡<br>⬡</div><div><span>烈焰粉</span><button class="furnace-slot" data-brew-take="fuel" aria-label="取出未使用的烈焰粉"></button></div></div>
    <p id="brew-status" role="status"></p><progress id="brew-progress" max="${BREW_SECONDS}" value="0" aria-label="本批酿造进度"></progress><p id="brew-fuel"></p>
    <div class="brew-bottles">${[0, 1, 2].map((i) => `<div><button class="brew-bottle ${state.slot === i ? 'selected' : ''}" data-brew-slot="${i}" aria-label="药水位置 ${i + 1}"></button><small data-brew-result="${i}"></small></div>`).join('')}</div></div>
    <div class="section-label">背包中的瓶装药水 → 空瓶位</div><div class="inventory-grid">${list(Object.keys(POTIONS), 'bottle')}</div>
    <div class="section-label">原料 → 酿造台</div><div class="inventory-grid">${list(BREW_INGREDIENTS, 'ingredient')}</div>
    <div class="section-label">燃料 → 酿造台</div><div class="inventory-grid">${list(['ember'], 'fuel')}</div>
    <details class="brew-recipes"><summary>酿造配方册</summary><p>${icon('waterBottle')} 水瓶 ＋ ${icon('netherWart')} 下界疣 → 粗制药水</p>${Object.entries(
      BREW_TRANSFORMS.awkwardPotion,
    )
      .map(
        ([ingredient, result]) =>
          `<p>${icon('awkwardPotion')} ＋ ${icon(ingredient)} ${ITEMS[ingredient].name} → ${icon(result)} ${ITEMS[result].name}<small>${potionDescription(result)}</small></p>`,
      )
      .join(
        '',
      )}<p>有效药水加入红石粉可延时，加入萤石粉可增强支持 II 级的效果；延长和增强不能叠加。</p></details>
    <p class="panel-note">点击台内物品取出，点击空瓶位选择装瓶位置。更换或取出原料、瓶装药水会重置当前批次，已用能量不返还。酿造面板打开时继续工作；暂停菜单、后台和未加载区域暂停。拆除会散落全部库存。</p>`;
}
export function updateBrewingPanel(b, state) {
  const outputs = brewingOutputs(b);
  for (let i = 0; i < 3; i++) {
    const el = document.querySelector(`[data-brew-slot="${i}"]`),
      id = b.bottles[i];
    const signature = id || '';
    if (el.dataset.value !== signature) {
      el.dataset.value = signature;
      el.innerHTML = id
        ? `${icon(id)}<span>${ITEMS[id].name}</span>`
        : `${icon('glassBottle')}<span>空瓶位</span>`;
      el.title = id ? potionDescription(id) + ' · 点击取出' : '选择此位置装瓶';
    }
    el.classList.toggle('selected', state.slot === i);
    document.querySelector(`[data-brew-result="${i}"]`).textContent = outputs[i]
      ? '→ ' + ITEMS[outputs[i]].name
      : id
        ? '等待匹配原料'
        : '';
  }
  for (const slot of ['ingredient', 'fuel']) {
    const el = document.querySelector(`[data-brew-take="${slot}"]`);
    const id = slot === 'fuel' ? 'ember' : b.ingredient?.item,
      count = slot === 'fuel' ? b.fuelStock : b.ingredient?.count || 0;
    const signature = id + ':' + count;
    if (el.dataset.value !== signature) {
      el.dataset.value = signature;
      el.disabled = !count;
      el.innerHTML = count
        ? `${icon(id)}<b>${count}</b><small>${ITEMS[id].name}</small>`
        : '<span>空</span>';
    }
  }
  document.querySelector('#brew-status').textContent =
    brewingStatus(b) +
    (b.batch ? ' · ' + Math.ceil(BREW_SECONDS - b.progress) + ' 秒' : '');
  document.querySelector('#brew-progress').value = b.progress;
  document.querySelector('#brew-fuel').textContent =
    '储备 ' + b.fuelStock + ' 烈焰粉 · 剩余 ' + b.charges + ' 批能量';
  document
    .querySelector('.brewing-machine')
    .classList.toggle('active', !!b.batch);
}
