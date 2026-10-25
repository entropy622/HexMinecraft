import {
  inventorySlot,
  playerSlots,
  inventoryHelp,
  stackContent,
  stackTitle,
  touchControls,
} from './inventory-ui.js';
import { ITEMS } from './core.js';
import { itemIcon as icon } from './icons.js';
import { BREW_TRANSFORMS, potionDescription } from './brewing-data.js';
import { BREW_SECONDS, brewingOutputs, brewingStatus } from './brewing.js';
export function brewingPanel(pack) {
  return `<p>每批 20 秒，一份原料最多转化三瓶。Shift 点击背包物品快速放入。</p>
    <div class="brewing-machine"><div class="brew-inputs"><div><span>酿造原料</span>${inventorySlot(null, 'brew:ingredient')}</div><div class="brew-bubbles" aria-hidden="true">⬡<br>⬡<br>⬡</div><div><span>烈焰粉</span>${inventorySlot(null, 'brew:fuel')}</div></div>
    <p id="brew-status" role="status"></p><progress id="brew-progress" max="${BREW_SECONDS}" value="0" aria-label="本批酿造进度"></progress><p id="brew-fuel"></p>
    <div class="brew-bottles">${[0, 1, 2].map((i) => `<div>${inventorySlot(null, 'brew:' + i)}<small data-brew-result="${i}"></small></div>`).join('')}</div></div>
    ${playerSlots(pack)}${inventoryHelp}${touchControls}
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
    <p class="panel-note">使用游标将瓶子放进空瓶位。更换或取出原料、瓶装药水会重置当前批次，已用能量不返还。酿造面板打开时继续工作；暂停菜单、后台和未加载区域暂停。拆除会散落全部库存。</p>`;
}
export function updateBrewingPanel(b) {
  const outputs = brewingOutputs(b);
  for (let i = 0; i < 3; i++) {
    const el = document.querySelector(`[data-inv-slot="brew:${i}"]`),
      id = b.bottles[i];
    const signature = id || '';
    if (el.dataset.value !== signature) {
      el.dataset.value = signature;
      el.innerHTML = stackContent(id ? { item: id, count: 1 } : null, '♧');
      el.setAttribute(
        'aria-label',
        id
          ? stackTitle({ item: id, count: 1 }).replaceAll('\n', ' · ')
          : '空瓶位',
      );
    }
    document.querySelector(`[data-brew-result="${i}"]`).textContent = outputs[i]
      ? '→ ' + ITEMS[outputs[i]].name
      : id
        ? '等待匹配原料'
        : '';
  }
  for (const slot of ['ingredient', 'fuel']) {
    const el = document.querySelector(`[data-inv-slot="brew:${slot}"]`);
    const id = slot === 'fuel' ? 'ember' : b.ingredient?.item,
      count = slot === 'fuel' ? b.fuelStock : b.ingredient?.count || 0;
    const signature = id + ':' + count;
    if (el.dataset.value !== signature) {
      el.dataset.value = signature;
      el.innerHTML = stackContent(count ? { item: id, count } : null);
      el.setAttribute(
        'aria-label',
        count
          ? ITEMS[id].name + ' ×' + count
          : slot === 'fuel'
            ? '烈焰粉燃料槽'
            : '酿造原料槽',
      );
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
