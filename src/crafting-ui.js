import { ITEMS, RECIPES } from './core.js';
import { availableBatches } from './crafting.js';
import { ingredientMatches, ingredientName } from './wood-ingredients.js';
import { inventorySlot, inventoryHelp, touchControls } from './inventory-ui.js';
import { itemIcon as icon } from './icons.js';
import { escapeHTML as escape } from './ui-text.js';

export const workshopPanel =
  () => `<section id="craft-overlay" class="overlay hidden"><div class="panel workshop-panel">
  <div class="panel-head"><div><div class="eyebrow">SEVEN CELLS. SIX DIRECTIONS.</div><h2>蜂巢合成</h2></div><div class="workshop-header-actions"><button id="recipe-book-toggle" aria-expanded="true" aria-controls="recipe-book">配方册</button><button class="close" data-close aria-label="关闭合成">×</button></div></div>
  <div class="workshop-layout"><aside class="recipe-sidebar" id="recipe-book"><input id="recipe-search" placeholder="搜索配方…" aria-label="搜索配方"><label class="recipe-filter"><input type="checkbox" id="recipe-available">仅显示可填料配方</label><nav class="recipe-list" id="recipes" aria-label="合成配方"></nav></aside>
  <div class="workshop-main"><div class="craft-main"><div class="craft-title"><h3 id="recipe-title"></h3><span id="craft-context"></span></div><p id="recipe-desc"></p>
    <div class="craft-stage"><div class="craft-grid" id="pattern" role="group" aria-label="七格蜂巢合成网格"></div><span class="craft-arrow" aria-hidden="true">➜</span><div class="craft-product"><span>合成产物</span><button class="mc-slot craft-output" id="craft-button" data-inv-slot="craft:output" aria-label="合成产物"></button><strong id="craft-product-name"></strong><small>点击拿取<br>Shift 合成到背包</small></div></div>
    <div id="craft-match" role="status"></div><div class="recipe-cost" id="recipe-cost"></div>
    <div class="craft-actions"><button id="fill-recipe" title="点击填入一批，再次点击补一批；Shift 填满可制作的数量">按配方填料</button><button id="craft-rotate" title="绕中心旋转 60°">旋转 ↻</button><button id="craft-mirror" title="左右镜像材料">镜像 ↔</button><button id="craft-clear" title="将材料收回背包，空间不足时留在网格">收回材料</button></div>
    <div class="craft-guide-row"><label><input id="craft-guide" type="checkbox" checked>显示配方提示</label><span id="station-note"></span></div></div>
    <div class="inventory-section"><div class="section-label">你的背包 <b id="pack-capacity"></b></div><div id="inventory"></div>${touchControls}<details class="workshop-help"><summary>物品操作与合成说明</summary>${inventoryHelp}<p class="inventory-help">在七个蜂巢格放入真实材料；支持平移、六向旋转与镜像配方。右键逐个放置，或拖动均分。取出产物后才扣料；Shift 只合成网格中的材料。点击配方册自动填一批，Shift 点击填入尽可能多的批次。关闭界面收回材料，背包满则落在脚边。</p></details></div>
  </div></div></div></section>`;

export function craftingGridHTML(grid, guide, recipe) {
  return grid
    .map((stack, i) => {
      const need = guide?.[i];
      let button = inventorySlot(stack, 'craft:' + i).replace(
        'mc-slot ',
        'mc-slot craft-cell ',
      );
      if (!stack && need) {
        button = button.replace(
          '</button>',
          `<span class="craft-ghost" aria-hidden="true">${icon(need.item)}${need.count > 1 ? `<b>×${need.count}</b>` : ''}</span></button>`,
        );
        button = button.replace(
          'type="button"',
          `type="button" data-inv-hint="${escape('配方提示：' + ingredientName(recipe, need.item, ITEMS[need.item].name) + ' ×' + need.count + '（尚未放入）')}"`,
        );
      }
      if (
        stack &&
        need &&
        ingredientMatches(recipe, need.item, stack.item) &&
        stack.count < need.count
      )
        button = button.replace('craft-cell ', 'craft-cell insufficient ');
      return button;
    })
    .join('');
}
export function recipeBookHTML(
  stock,
  selected,
  station,
  query = '',
  onlyAvailable = false,
  creative = false,
) {
  query = query.trim().toLowerCase();
  const visible = RECIPES.flatMap((recipe, index) => {
    const available =
      (!recipe.station || station) &&
      (creative || availableBatches(recipe, stock) > 0);
    if (
      (onlyAvailable && !available) ||
      !`${ITEMS[recipe.id].name} ${recipe.title} ${recipe.id}`
        .toLowerCase()
        .includes(query)
    )
      return [];
    return `<button class="recipe ${selected === index ? 'active' : ''} ${available ? 'can-fill' : 'unavailable'}" data-recipe="${index}" title="${available ? '点击填入一批；Shift 点击填满' : recipe.station && !station ? '需要附近的工作台' : '材料不足，点击查看配方提示'}">${icon(recipe.id)}<span>${ITEMS[recipe.id].name}<small>${recipe.station ? '工作台' : '随身合成'} · ×${recipe.count}${available ? ' · 可填料' : ''}</small></span></button>`;
  });
  return visible.join('') || '<p class="recipe-empty">没有符合条件的配方。</p>';
}
