import { ITEMS, RECIPES } from './core.js';
import { availableBatches } from './crafting.js';
import { ingredientMatches, ingredientName } from './wood-ingredients.js';
import { inventorySlot, touchControls } from './inventory-ui.js';
import { itemIcon as icon } from './icons.js';
import { escapeHTML as escape } from './ui-text.js';

export const workshopPanel =
  () => `<section id="craft-overlay" class="overlay hidden"><div class="panel workshop-panel">
  <div class="panel-head"><h2 id="bag-title">物品栏</h2><div class="workshop-header-actions"><button id="recipe-book-toggle" aria-expanded="false" aria-controls="recipe-book">配方册</button><button class="close" data-close aria-label="关闭物品栏">×</button></div></div>
  <div class="workshop-layout book-closed"><aside class="recipe-sidebar" id="recipe-book" hidden><input id="recipe-search" placeholder="搜索配方" aria-label="搜索配方"><label class="recipe-filter"><input type="checkbox" id="recipe-available">仅显示可制作</label><nav id="recipes" class="recipe-list" aria-label="合成配方"></nav>
  <div class="recipe-detail"><b id="recipe-title"></b><p id="recipe-desc"></p><div class="recipe-cost" id="recipe-cost"></div><button id="fill-recipe">按配方填料</button><label><input id="craft-guide" type="checkbox" checked>显示摆法</label><small id="station-note"></small></div></aside>
  <div class="workshop-main"><div class="survival-upper"><div id="character"></div><div class="craft-main"><h3 id="craft-context"></h3><div class="craft-stage"><div class="craft-grid" id="pattern" role="group"></div><span class="craft-arrow" aria-hidden="true">➜</span><button class="mc-slot craft-output" id="craft-button" data-inv-slot="craft:output" aria-label="合成产物"></button></div><div class="craft-actions"><button id="craft-rotate" aria-label="旋转六十度">旋转 ↻</button><button id="craft-mirror">镜像 ↔</button><button id="craft-clear">收回</button></div><span id="craft-product-name" class="sr-craft"></span><span id="craft-match" class="sr-craft" role="status"></span></div></div><div class="inventory-section"><div class="section-label">背包 <small id="pack-capacity"></small></div><div id="inventory"></div>${touchControls}</div></div></div></div></section>`;

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
      (recipe.station && !station) ||
      (onlyAvailable && !available) ||
      !`${ITEMS[recipe.id].name} ${recipe.title} ${recipe.id}`
        .toLowerCase()
        .includes(query)
    )
      return [];
    return `<button class="recipe ${selected === index ? 'active' : ''} ${available ? 'can-fill' : 'unavailable'}" data-recipe="${index}" title="${available ? '点击填入一批；Shift 点击填满' : recipe.station && !station ? '右键打开工作台' : '材料不足，点击查看配方提示'}">${icon(recipe.id)}<span>${ITEMS[recipe.id].name}<small>${recipe.station ? '工作台' : '随身合成'} · ×${recipe.count}${available ? ' · 可填料' : ''}</small></span></button>`;
  });
  return visible.join('') || '<p class="recipe-empty">没有符合条件的配方。</p>';
}
