import { powderContact, powderSupport } from './powder-snow.js';
import { touchesWeb } from './cobwebs.js';
import {
  STRUCTURE_NAMES,
  structureLoot,
  structurePlants,
  structureGuards,
} from './structures.js';
import {
  EFFECTS,
  POTIONS,
  BREW_INGREDIENTS,
  potionDescription,
} from './brewing-data.js';
import { newBrewing, tickBrewing } from './brewing.js';
import {
  findNetherFrame,
  lightNetherFrame,
  maintainNetherPortals,
  buildArrivalPortal,
} from './nether-portals.js';
import {
  CAMPFIRE_FOODS,
  CAMPFIRE_SECONDS,
  isCampfire,
} from './campfire-data.js';
import {
  tickCampfires,
  setCampfireLit,
  campfireWet,
  campfireHeat,
} from './campfires.js';
import { brewingPanel, updateBrewingPanel } from './brewing-ui.js';
import { FUELS, newFurnace, smeltingRecipe, tickFurnace } from './furnaces.js';
import { furnacePanel, updateFurnacePanel } from './furnace-ui.js';
import { FURNACES, isFurnace } from './processing-data.js';
import {
  CIRCUIT_BLOCKS,
  isCircuitInput,
  circuitItem,
  attachmentCell,
} from './redstone-data.js';
import { canStonecut, stonecuttingResult } from './stonecutting.js';
import { stonecutterPanel } from './stonecutter-ui.js';
import { newChest, isStorage, storageLidClear } from './chests.js';
import { chestPanel, updateChestPanel } from './chest-ui.js';
import {
  fireDropper,
  dispensingSource,
  ejectStack,
  replaceDispensed,
} from './droppers.js';
import { blockSlots } from './block-inventory.js';
import { isCauldron, cauldronAction, waterCauldron } from './cauldron-data.js';
import { tickCauldrons, cauldronContact } from './cauldrons.js';
import { features as villageFeatures, ROLES, trade } from './villages.js';
import { Villagers } from './villagers.js';
import { LIQUIDS, fluidHeight } from './fluids.js';
import './style.css';
import * as THREE from 'three';
import { ARROW_ITEMS } from './arrow-data.js';
import {
  BLOCKS,
  DIRECTIONS,
  canEquip,
  ITEMS,
  HOTBAR,
  RECIPES,
  axialToWorld,
  worldToAxial,
  hexDistance,
  key,
  hash,
} from './core.js';
import { Fauna } from './fauna.js';
import { ItemDrops } from './item-drops.js';
import { Weather, WeatherColumns, WEATHER } from './weather.js';
import { PLANTS, plantForItem } from './farming-data.js';
import { plantingIssue, growthConditions, treePlan } from './farming.js';
import { TREES } from './wood-data.js';
import { pillarAxis, pillarAxisLabel } from './pillar-faces.js';
import { leafDrops } from './leaves.js';
import { isCaveVine, isHangingPlant } from './cave-data.js';
import { canHang, harvestCavePlant, tickCavePlants } from './cave-plants.js';
import {
  pointedSupport,
  tickDripstone,
  spikeAtFeet,
  spikeLandingDamage,
} from './dripstone.js';
import { ingredientCount, ingredientName } from './wood-ingredients.js';
import { facingFromDirection, facingAngle } from './building-shapes.js';
import {
  isDoorTop,
  doorLower,
  doorUpper,
  isFence,
  isGate,
  isTrapdoor,
  isOpenable,
} from './building-data.js';
import {
  INVENTORY_SLOTS,
  usedSlots,
  roomFor,
  stackSize,
  PlayerInventory,
  GEAR_SLOTS,
  acceptsGear,
  sameStack,
} from './inventory.js';
import { ContainerSession, moveSlot, takeSlot } from './container-actions.js';
import { InventoryControls } from './inventory-controls.js';
import {
  newCraftingGrid,
  recipeCells,
  craftingMatches,
  craftingResult,
  craftingStock,
  fillCraftingRecipe,
  consumeCrafting,
  returnCraftingGrid,
  transformCraftingGrid,
  quickCraft,
} from './crafting.js';
import {
  workshopPanel,
  craftingGridHTML,
  recipeBookHTML,
} from './crafting-ui.js';
import {
  playerSlots,
  creativePalette,
  stackContent,
  stackTitle,
} from './inventory-ui.js';
import { MOBS } from './mob-data.js';
import { Graphics } from './graphics.js';
import { HELD_LIGHTS } from './voxel-light.js';
import { Survival, FOODS } from './survival.js';
import { Combat } from './combat.js';
import { bowPull } from './archery.js';
import { findFloor, bodyClear } from './grounding.js';
import { Experience, xpForLevel } from './experience.js';
import {
  enchantLabel,
  customName,
  wearValue,
  enchantmentsOf,
} from './enchanting-data.js';
import { ANVILS, isSmithingStation } from './smithing-data.js';
import { smithingPlan, repairMaterial } from './smithing.js';
import { newWorkstationItems, smithIngredient } from './workstation-items.js';
import { smithingPanel, smithingPreview } from './smithing-ui.js';
import { escapeHTML } from './ui-text.js';
import { bookshelfPower, enchantOffers } from './enchanting.js';
import { enchantingPanel } from './enchanting-ui.js';
import { World, DIMENSIONS, WORLD_HEIGHT } from './world.js';
import { SAVE_KEY, validateSave } from './save.js';
import { loadTexturePack, textureURL } from './texture-pack.js';
import { Equipment, miningStats, wearStack } from './equipment.js';
import { miningRate } from './mining.js';
import { miningLoot } from './mining-loot.js';
import { moonPhase } from './sky-environment.js';
import { Projectiles } from './projectiles.js';
import { Throwables, pearlDestination } from './throwables.js';
import { THROWABLES } from './throwable-data.js';
import { Fireballs } from './fireballs.js';
import { ShulkerBullets } from './shulker-bullets.js';
import { shulkerAttachment } from './shulkers.js';
import { DragonFight } from './dragon.js';
import { END_FLOOR, END_PILLARS } from './end-data.js';
import { stampEndArena } from './end-arena.js';
import { Fishing } from './fishing.js';
import { Boats, BOAT_EYE } from './boats.js';
import { Movement } from './movement.js';
import { Glider } from './glider.js';
import { FlightEffects } from './flight-effects.js';
import { END_GATEWAYS } from './flight-data.js';
import { GameAudio } from './audio.js';
import { growChorus, harvestChorus } from './chorus.js';
import { isChorus, isChorusFlower } from './chorus-data.js';
import { itemIcon as icon } from './icons.js';
const soundFX = new GameAudio();

const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer:coarse)').matches;
$('#app').innerHTML = `
 <canvas id="world" aria-label="六野三维世界"></canvas>
 <div id="loading"><span class="brand-icon"></span><span>正在生成你的六边形世界</span></div>
 <section id="landing">
  <header class="topline"><div class="brand"><span class="brand-icon"></span> HEXWILD</div><div class="pill"><i class="dot"></i> A HEXAGONAL SANDBOX</div></header>
  <div class="intro"><div class="eyebrow">SIX SIDES. ENDLESS POSSIBILITIES.</div><h1>HEXWILD</h1><h2 class="cn">六 野</h2><p class="desc">世界，换一个角度。<br>在六边形的旷野里，采集、创造、安一个家。<br>穿过森林、余烬与虚空。你的世界，没有终点。</p>
   <div class="menu-actions"><button class="primary" id="start">单人游戏 · 生存 <span aria-hidden="true">↗</span></button><button class="secondary" id="creative">自由建造 <span aria-hidden="true">◇</span></button><button class="tertiary hidden" id="continue">↳ 继续上次的旅程</button><button class="tertiary" id="menu-help">操作指南 / 世界设置</button></div>
  </div>
  <div class="vista-label"><strong>INFINITE WORLDS</strong><div class="line"></div><small>主世界 / 下界 / 末地</small></div>
  <footer class="landing-footer"><div class="tags"><span><b>⬡</b> 六棱世界</span><span><b>✧</b> 生存与创造</span><span><b>◈</b> 每一面，都有可能</span></div><div class="edition">AN EXPERIMENT IN SIX DIRECTIONS<br>v0.78 — LIGHT THROUGH THE LEAVES</div></footer>
 </section>
 <div id="hud" class="hidden">
  <div class="hud-top"><div><div class="wordmark">HEXWILD <small>六野</small></div><div class="world-info" id="world-info"></div></div><div class="world-badge"><span id="dimension-name">主世界</span><strong id="biome-name">青翠平原</strong><span id="weather-hud"></span><div id="compass">N · NE · SE · S · SW · NW</div></div></div>
  <div id="crosshair"></div><div id="mine-progress"><i></i></div><div id="target" class="hidden"></div>
  <div class="bottom-hud"><div id="boat-status" class="hidden"></div><div id="combat-status"></div><div id="attack-meter" role="progressbar" aria-label="挥击恢复" aria-valuemin="0" aria-valuemax="1"></div><div id="shield-status" class="hidden"><span id="shield-label"></span><progress id="shield-ready" max="0.25" value="0" aria-label="举盾准备"></progress></div><progress id="fishing-window" class="hidden" max="1" value="0" aria-label="咬钩收杆剩余时间"></progress><div id="selected-name"></div><div id="survival-status"><div id="air-bar" class="hidden" role="progressbar" aria-label="氧气" aria-valuemin="0" aria-valuemax="15"></div><div id="freeze-bar" class="hidden" role="progressbar" aria-label="冻结程度" aria-valuemin="0" aria-valuemax="7"><i></i><span>冻结</span></div><div id="effect-list"></div></div><div id="use-food" class="hidden"><span id="use-food-name"></span><progress id="use-progress" max="1" value="0" aria-label="食用进度"></progress></div><div class="vitals"><span class="health" id="health"></span><span id="absorption-hud" aria-label="额外吸收生命"></span><span class="tool" id="tool"></span><span class="hunger" id="hunger"></span><span id="armor-hud"></span></div><div id="experience-hud"><b id="experience-level">0</b><progress id="experience-progress" max="1" value="0" aria-label="当前等级经验"></progress></div><div id="hotbar"></div><div class="controls-hint"><span><kbd>WASD</kbd>移动</span><span><kbd>空格</kbd>跳跃</span><span><kbd>左 / 右键</kbd>采集 / 放置</span><span><kbd>E</kbd>背包</span><span><kbd>Shift</kbd>蹲伏</span><span><kbd>M</kbd>地图</span><span><kbd>ESC</kbd>菜单</span></div></div>
  <div class="hud-left" id="location"></div><canvas id="minimap" width="200" height="220"></canvas>
  <div id="mobile-controls"><div class="mobile-top"><button data-action="craft" aria-label="合成">E</button><button data-action="map" aria-label="地图">M</button><button data-action="pause" aria-label="暂停">Ⅱ</button><button data-action="swap" aria-label="交换主副手">F</button><button data-action="eat" aria-label="按住食用或饮用">吃</button></div><div class="dpad"><button data-key="KeyW" aria-label="前进">↑</button><button data-key="KeyA" aria-label="左移">←</button><button data-key="KeyS" aria-label="后退">↓</button><button data-key="KeyD" aria-label="右移">→</button></div><div class="mobile-actions"><button data-action="mine" aria-label="采集">挖</button><button data-action="place" aria-label="使用物品或放置方块">用</button><button data-key="Space" aria-label="跳跃">↟</button><button data-key="KeyR" id="mobile-shield" aria-label="按住举盾">盾</button><button data-action="interact" aria-label="交互">交</button><button data-key="ShiftLeft" aria-label="下降或蹲伏">⇣</button><button data-key="ControlLeft" aria-label="冲刺">跑</button></div></div>
 </div>
 <div id="pickups" aria-live="polite"></div><div id="travel" aria-live="polite"><span>穿越维度</span></div><div id="underwater"></div><div id="powder-overlay" aria-hidden="true"></div><div id="frost-overlay" aria-hidden="true"></div><div id="fire-overlay" aria-hidden="true"></div><div id="portal-overlay" aria-hidden="true"></div><div id="damage"></div><div id="toast" role="status" aria-live="polite"></div>
 ${workshopPanel()}
 <section id="pause-overlay" class="overlay hidden"><div class="panel pause-panel"><div class="eyebrow">TAKE A BREATH</div><h2 id="pause-title">旷野会等你。</h2><p id="pause-description">旅途已暂歇。世界会记住你留下的每一块砖。</p><div class="pause-actions"><button class="primary" id="resume">回到旷野</button><div class="two-col"><button id="export">导出存档</button><button id="import">导入存档</button></div><div class="two-col"><button id="mode-toggle">切换自由建造</button><button id="respawn">返回出生点</button></div><button id="home">保存并返回首页</button></div><div class="settings-row"><label for="sensitivity">视角灵敏度</label><input id="sensitivity" type="range" min="0.5" max="2" step="0.1" value="1"></div><div class="settings-row"><label for="fov">基础视野</label><input id="fov" type="range" min="60" max="110" step="1" value="72"><output id="fov-value" for="fov">72°</output></div><div class="settings-row"><span>游戏音效</span><button id="sound-toggle">开启</button></div><div class="settings-row"><label for="volume">音效音量</label><input id="volume" type="range" min="0" max="1" step="0.05" value="0.45"></div><div class="settings-row"><label for="lightning-toggle">雷电闪光</label><input id="lightning-toggle" type="checkbox" checked></div><div class="settings-row"><label for="quality">画质</label><select id="quality"><option value="1">均衡</option><option value="0.65">流畅</option><option value="1.7">光影 · 体积云与晨雾</option></select></div><div class="settings-row"><label for="clouds-toggle">云层与云影</label><input id="clouds-toggle" type="checkbox" checked></div><fieldset id="post-settings" class="post-settings"><legend>光影细节</legend><div class="settings-row"><label for="occlusion-strength">接触阴影</label><input id="occlusion-strength" type="range" min="0" max="1" step="0.1" value="0.6" title="加强墙角与物体接缝的阴影；设为 0 关闭"><output id="occlusion-value" for="occlusion-strength">60%</output></div><div class="settings-row"><label for="exposure-toggle">明暗适应</label><input id="exposure-toggle" type="checkbox" checked title="进入洞穴后缓慢适应，走入日光时更快收敛；关闭使用固定曝光"></div><div class="settings-row"><label for="antialias-toggle">时域抗锯齿</label><input id="antialias-toggle" type="checkbox" checked title="积累多帧细节，减轻远处轮廓闪烁；移动物体和手持物优先使用当前画面"></div><div class="settings-row"><label for="bloom-strength">柔光强度</label><input id="bloom-strength" type="range" min="0" max="0.5" step="0.01" value="0.24"><output id="bloom-value" for="bloom-strength">24%</output></div></fieldset><p class="panel-note">光影档增加体积云、近景柔影、体积光束、雨后水洼与建筑倒影、明暗适应与抗锯齿，显卡开销较高；细节可单独调整。光影云层可透光并遮蔽日月；均衡保留几何云与移动云影，流畅保留简化云层与高度雾。云层可单独关闭，画质和细节会保存在本浏览器。</p><div class="dimension-controls" id="dimension-controls"><span>创造模式 · 维度旅行</span><div><button data-dimension="overworld">主世界</button><button data-dimension="nether">下界</button><button data-dimension="end">末地</button></div><p class="panel-note">生存模式中，搭黑曜石门框并用打火石点燃；站入四秒或右键穿越。末地门可合成，返回门自动生成。</p></div><div class="help-grid"><span><kbd>W A S D</kbd>移动 / Ctrl 或双击 W 冲刺 / Shift 蹲伏防坠</span><span><kbd>空格</kbd>跳跃 / 水中上浮</span><span><kbd>左键长按</kbd>采集 / 攻击</span><span><kbd>右键</kbd>使用物品 / 放置 / 拉弓</span><span><kbd>右键</kbd>交互 / 耕种 / 收获</span><span><kbd>E / B / Tab</kbd>背包与蜂巢合成</span><span><kbd>F / M</kbd>主副手换位 / 查看地图</span><span><kbd>Q / Ctrl+Q</kbd>丢出一件 / 一组</span><span><kbd>梯子</kbd>W / 空格上爬 · Shift 停住</span><span><kbd>门 / 栅栏门</kbd>右键开关 · Shift 旁建</span><span><kbd>右键 / R</kbd>主手或副手举盾</span><span><kbd>随身照明</kbd>主手或副手持火把、萤灯或发光液体桶</span><span><kbd>细雪</kbd>皮靴站立 / Shift 下沉 / 空格攀出 · 皮甲保温</span><span><kbd>创造模式</kbd>双击空格切换飞行 · 空格上升 / Shift 下降</span></div><div id="weather-controls" class="hidden"><span>创造模式 · 天气</span><div class="weather-buttons"><button data-weather="clear">晴朗</button><button data-weather="rain">雨 / 雪</button><button data-weather="storm">雷暴</button></div><p class="panel-note">天气会逐渐过渡，之后继续自动轮换。雪原降雪，沙漠只有阴云；雷电闪光可单独关闭。</p></div><div class="world-form"><label for="seed">新世界种子</label><input id="seed" type="number" min="0" max="999999" value="624"><button id="new-world">创建新世界</button></div><p class="panel-note">自动保存在本浏览器。创建新世界会替换当前存档，可先导出备份。手机：左侧方向键移动，拖动右半屏转动视角。</p><input class="hidden" type="file" id="save-file" accept=".json,application/json"></div></section>
 <section id="map-overlay" class="overlay hidden"><div class="panel map-panel"><div class="panel-head"><div><div class="eyebrow">FIELD NOTES / 无限旷野</div><h2>六野图志</h2></div><button class="close" data-close aria-label="关闭地图">×</button></div><canvas id="world-map" width="700" height="700"></canvas><p class="panel-note">▲ 你的位置　 ◈ 传送门　 ⌂ 村庄　 ◌ 洞穴入口　 ◆ 已发现遗迹　 × 上次死亡地点<br>死亡物资在附近加载期间保留 10 分钟；普通掉落 5 分钟，岩浆和虚空会销毁。地图跟随玩家，显示周围已加载区域。不同维度分别保存地形与建筑。</p></div></section>
 <section id="station-overlay" class="overlay hidden"><div class="panel station-panel"><div class="eyebrow">A LITTLE PLACE OF YOUR OWN</div><button class="close" data-close style="float:right" aria-label="关闭交互">×</button><h2 id="station-title"></h2><div id="station-content"></div></div></section>
`;

let graphics,
  villagers,
  villagerTarget = null,
  tradingWith = null;
await loadTexturePack();
try {
  graphics = new Graphics($('#world'));
  villagers = new Villagers(graphics.scene);
} catch (error) {
  $('#loading').innerHTML =
    '<h2>世界还没能打开</h2><p>请使用支持 WebGL 的现代浏览器，并启用硬件加速。</p>';
  throw error;
}
const camera = graphics.camera;
const motion = new Movement();
const glider = new Glider();
const flightEffects = new FlightEffects(graphics.scene, (event) =>
  soundFX.play(event),
);
let rocketCooldown = 0;
let chorusCooldown = 0,
  pendingChorusUse = null;
const projectiles = new Projectiles(graphics.scene);
const fireballs = new Fireballs(graphics.scene, {
  sound: (kind) => soundFX.play(kind),
  playerHit: (amount, source) => {
    if (creative || survival.rank('fireResistance')) return 'immune';
    const owner = survival,
      result = hurt(amount, 'fireball', source);
    const fluid = playerFluidAt(camera.position.y - 0.65);
    if (
      owner === survival &&
      result !== 'blocked' &&
      (!fluid || !LIQUIDS[fluid.type].coolant)
    )
      survival.burning = Math.max(survival.burning, 5);
    return result;
  },
  hit: (mob, amount, direction, owned) => {
    const a = worldToAxial(mob.mesh.position.x, mob.mesh.position.z);
    graphics.burst(a.q, mob.mesh.position.y + 1, a.r, MOBS[mob.kind].color);
    fauna.hit(mob, amount, direction, owned, owned);
  },
  explode: (point, owned, excludeId) =>
    explode(point, {
      radius: 1.65,
      damageRadius: 3.5,
      damage: 8,
      mobRadius: 3,
      mobDamage: 8,
      soft: true,
      playerOwned: owned,
      excludeMob: excludeId,
      fire: true,
      notice: false,
    }),
  spark: (point) => {
    const a = worldToAxial(point.x, point.z);
    graphics.burst(a.q, point.y, a.r, '#efb34c');
  },
  returned: () => toast('以牙还牙！恶魂被击回的火球击败了。'),
});
const throwables = new Throwables(graphics.scene, {
  impact: resolveThrow,
  dodge: (mob, owner) => fauna.dodge(mob, owner !== 'dispenser'),
  miss: () => toast('珍珠离开了已加载区域，未能传送。'),
});
const shulkerBullets = new ShulkerBullets(graphics.scene, {
  sound: (kind) => soundFX.play(kind),
  spark: (point, count) => throwables.burst(point, 'snowball', count),
  playerHit: (amount, source) => {
    const owner = survival,
      result = hurt(amount, 'projectile', source);
    if (!creative && owner === survival && result !== 'blocked') {
      survival.applyEffect('levitation', 10);
      stopGliding();
      updateHUD();
    }
  },
  mobHit: (mob, amount, direction) =>
    fauna.hit(mob, amount, direction, false, false),
});
const drops = new ItemDrops(graphics.scene, graphics.textures);
const experience = new Experience(graphics.scene, (levelUp) =>
  soundFX.play(levelUp ? 'levelUp' : 'xp'),
);
const dragonFight = new DragonFight(graphics.scene, {
  sound: (kind) => soundFX.play(kind),
  notice: toast,
  save: saveGame,
  mote: (point, count) => throwables.burst(point, 'pearl', count),
  hurt: (amount, source, cause) => hurt(amount, cause, source),
  blast: (point) =>
    explode(point, {
      radius: 2.1,
      damageRadius: 5,
      damage: 12,
      mobRadius: 4,
      mobDamage: 10,
      soft: true,
      playerOwned: true,
      notice: false,
    }),
  rebuild: rebuildEndArena,
  victory: dragonVictory,
});
const bossPanel = document.createElement('div');
bossPanel.id = 'boss-hud';
bossPanel.className = 'hidden';
bossPanel.innerHTML = `<b id="boss-name"></b><progress id="boss-health" max="200" value="200" aria-label="末影龙生命"></progress><div id="boss-crystals">${Array.from({ length: 6 }, (_, i) => `<span data-boss-crystal="${i}" title="末地水晶 ${i + 1}">${icon('endCrystal')}</span>`).join('')}</div>`;
$('#hud').append(bossPanel);
const flightStatus = document.createElement('div');
flightStatus.id = 'flight-status';
flightStatus.className = 'hidden';
flightStatus.innerHTML = `${icon('elytra')}<span id="flight-label"></span><progress id="flight-boost" max="1.5" value="0" aria-label="烟花助推剩余时间"></progress>`;
$('#combat-status').before(flightStatus);
let workstationItems = newWorkstationItems(),
  pendingStationEffects = [];
const smithState = { name: '' };
const stonecutState = { selection: null, cuts: 0 };
const boats = new Boats(graphics.scene, graphics.textures, {
  drop: (position) =>
    drops.spawn('boat', 1, [position[0], position[1] + 0.6, position[2]]),
  row: () => soundFX.noise(0.22, 0.07, 650),
  unseat: () => {
    vy = 0;
    motion.reset();
    fishing.clear();
    toast('小船损坏了。');
  },
});
let boatTarget = null;
const fishingTip = new THREE.Vector3();
let fishingUse = null;
const fishing = new Fishing(
  graphics.scene,
  {
    notice: toast,
    wear: (n) => {
      if (validHandUse(fishingUse, 'fishingRod'))
        withUseHand(fishingUse.hand, () => wearUseItem('fishingRod', n));
    },
    catch: (loot) => {
      const taken = addItem(loot.item);
      awardXP(1 + Math.floor(Math.random() * 6), [
        camera.position.x,
        playerFeet() + 0.5,
        camera.position.z,
      ]);
      toast(
        loot.category +
          ' · ' +
          ITEMS[loot.item].name +
          (taken ? '' : ' · 背包已满，留在脚边'),
      );
    },
    sound: (kind) => {
      if (kind === 'cast') soundFX.noise(0.12, 0.08, 2200);
      else if (kind === 'splash') soundFX.noise(0.18, 0.14, 950);
      else if (kind === 'bite') {
        soundFX.noise(0.25, 0.18, 1700);
        soundFX.tone(780, 0.15, 'sine', 0.13);
        soundFX.tone(1050, 0.12, 'sine', 0.1, 0.1);
      } else soundFX.tone(950, 0.14, 'triangle', 0.1);
    },
  },
  isTouch,
);
let weather = new Weather();
const weatherColumns = new WeatherColumns();
let weatherGrowthTimer = 0;
let portalExposure = 0,
  portalCooldown = 0;
let lastDeath = null;
const fauna = new Fauna(graphics.scene, graphics.textures, {
  damage: (amount, source, poison) => {
    const result = hurt(amount, 'combat', source);
    if (result === 'hit' && poison > 0) survival.applyEffect('poison', poison);
    return result;
  },
  drop: (id, n, position) => drops.spawn(id, n, position),
  experience: (value, position) => awardXP(value, position),
  notice: toast,
  explode,
  fuse: () => beep(75, 0.3, 'sawtooth', 0.04),
  fireball: (kind, from, to, id) => fireballs.shoot(kind, from, to, id),
  shulkerShot: (from, normal, id) => shulkerBullets.shoot(from, normal, id),
  mobSound: (kind, position) => {
    if (position.distanceTo(camera.position) < 30) soundFX.play(kind);
  },
  moveBlock: endermanBlockChange,
  endermanMote: (point) => throwables.burst(point, 'pearl', 1),
  endermanTeleport: (from, to) => {
    throwables.burst(
      from.clone().add(new THREE.Vector3(0, 1.3, 0)),
      'pearl',
      18,
    );
    throwables.burst(to.clone().add(new THREE.Vector3(0, 1.3, 0)), 'pearl', 18);
    if (
      Math.min(
        from.distanceTo(camera.position),
        to.distanceTo(camera.position),
      ) < 30
    )
      soundFX.play('endermanTeleport');
  },
  shoot: (from, to, item) => {
    const aim = to
      .clone()
      .add(new THREE.Vector3(0, -0.65, 0))
      .sub(from);
    const flight = aim.length() / 25;
    aim.y += 6.5 * flight * flight;
    projectiles.shoot(from, aim.normalize(), 0.65, false, 'hostile', 1, {
      item,
    });
  },
});
let equipment = new Equipment();
let bowCharge = 0,
  bowUse = null;
let survival = new Survival(),
  foodUse = null,
  survivalSubmerged = false;
const foodInputs = new Set();
const combat = new Combat();
let attackPeriod = 0.45;
let throwHeldItem = null;
// Only synchronous item actions enter this context. Mining, HUD and timed food
// use read their own hand explicitly, even when an action refreshes the UI.
let actionHand = null;
let blockUse = null;

let world = new World(624),
  pack = new PlayerInventory(),
  inventory = pack.counts,
  tool = 0,
  creative = false,
  creativeFlying = false,
  crouching = false,
  hotbar = pack.hotbar,
  selected = 0,
  health = 20,
  hunger = 20,
  time = 105;
let crops = new Map(),
  chests = world.chests,
  creatures = fauna.active,
  hasGame = false,
  playing = false,
  overlay = null,
  fromMenu = false;
let yaw = 0,
  pitch = 0,
  vy = 0,
  grounded = false,
  target = null,
  mining = 0,
  miningKey = '',
  creativeMineDelay = 0,
  leftDown = false,
  keys = new Set(),
  selectedRecipe = 0,
  attackCooldown = 0,
  damageCooldown = 0;
let saveTimer = 0,
  hudTimer = 0,
  mapTimer = 0,
  toastTimer = 0,
  sensitivity = 1,
  fieldOfView = 72,
  sound = true,
  stationKey = null,
  moved = 0,
  simulationAccumulator = 0;
let craftingGrid = newCraftingGrid(),
  craftingReturns = [];
let showCraftGuide = true,
  recipeBookOpen = innerWidth >= 700,
  craftingPreviewOnly = false;
const spawn = new THREE.Vector3();
equipment.bind(pack);
const inventorySession = new ContainerSession(resolveInventorySlot);
const inventoryControls = new InventoryControls(inventorySession, {
  active: () =>
    !!hasGame &&
    (overlay === '#craft-overlay' ||
      (overlay === '#station-overlay' &&
        !!document.querySelector('#station-content [data-inv-slot]'))),
  creative: () => creative,
  visible: () => [
    ...new Set(
      [
        ...document.querySelectorAll('.overlay:not(.hidden) [data-inv-slot]'),
      ].map((b) => b.dataset.invSlot),
    ),
  ],
  quickMove: quickMoveInventory,
  quickMoveAll: quickMoveMatching,
  swapHotbar,
  swapOffhand: (ref) => inventorySession.swap(ref, 'gear:4'),
  drop: dropInventoryStack,
  settle: settleInventoryCursor,
  changed: (refs) => {
    if (refs?.some((ref) => ref?.startsWith('craft:')))
      craftingPreviewOnly = false;
    flushStationEffects();
    updateHUD();
    refreshInventoryPanel();
    saveGame();
  },
});
let respawnPoint = null;
let dimension = 'overworld',
  dimensionStates = {},
  hudSignature = '',
  footstepDistance = 0,
  ambienceTimer = 0,
  creatureTarget = null;
graphics.build(world);
graphics.setQuality(1);

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
}

function resolveInventorySlot(ref) {
  if (typeof ref !== 'string') return null;
  const [kind, name] = ref.split(':'),
    index = Number(name);
  if (kind === 'stonecut' && currentStonecutter()) {
    if (name === 'input')
      return {
        get: () => workstationItems.stonecut[0],
        set: (stack) => {
          if (stack?.item !== workstationItems.stonecut[0]?.item)
            stonecutState.selection = null;
          workstationItems.stonecut[0] = stack;
        },
        accepts: (stack) => canStonecut(stack.item),
      };
    if (name === 'output')
      return {
        get: () =>
          stonecuttingResult(
            workstationItems.stonecut[0],
            stonecutState.selection,
          ),
        set: () => {},
        accepts: () => false,
        output: true,
        whole: true,
        collect: false,
        taken: () => {
          const stack = workstationItems.stonecut[0];
          if (!stack || !stonecuttingResult(stack, stonecutState.selection))
            return;
          if (--stack.count <= 0) workstationItems.stonecut[0] = null;
          stonecutState.cuts++;
        },
      };
  }
  if (kind === 'smith' && name === 'output')
    return {
      get: () => {
        const plan = currentSmithingPlan();
        return plan.valid && (creative || experience.level >= plan.cost)
          ? { item: plan.id, count: 1, wear: structuredClone(plan.entry) }
          : null;
      },
      set: () => {},
      accepts: () => false,
      output: true,
      whole: true,
      collect: false,
      taken: () => {
        const plan = currentSmithingPlan(),
          type = currentSmithing();
        if (
          !plan.valid ||
          !type ||
          (!creative && plan.cost > 0 && !experience.spend(plan.cost))
        )
          return;
        workstationItems.smith[0] = null;
        const right = workstationItems.smith[1];
        if (right && plan.consumeRight) {
          right.count -= plan.consumeRight;
          if (!right.count) workstationItems.smith[1] = null;
        }
        smithState.name = '';
        pendingStationEffects.push({ plan, type, key: stationKey, creative });
      },
    };
  if (
    (kind === 'enchant' && currentEnchanting()) ||
    (kind === 'smith' && currentSmithing())
  ) {
    if (!['0', '1'].includes(name)) return null;
    const list = workstationItems[kind];
    return {
      get: () => list[index],
      set: (stack) => {
        list[index] = stack;
        if (kind === 'smith' && index === 0)
          smithState.name = customName(stack?.wear);
      },
      accepts: (stack) =>
        index === 0
          ? !!ITEMS[stack.item]?.durability
          : kind === 'enchant'
            ? stack.item === 'lapis'
            : currentSmithing() === 'grindstone'
              ? !!ITEMS[stack.item]?.durability
              : smithIngredient(stack),
      ...(index === 0 ? { limit: 1 } : {}),
    };
  }
  if (kind === 'craft' && name === 'output')
    return {
      get: () => craftingResult(currentCraftingMatch()),
      set: () => {},
      accepts: () => false,
      output: true,
      whole: true,
      collect: false,
      taken: () => {
        const match = currentCraftingMatch();
        if (!match) return;
        craftingReturns.push(...consumeCrafting(craftingGrid, match));
        soundFX.play('craft');
      },
    };
  if (['pack', 'gear', 'craft'].includes(kind)) {
    const list =
      kind === 'pack' ? pack.slots : kind === 'gear' ? pack.gear : craftingGrid;
    if (!list || !Number.isInteger(index) || index < 0 || index >= list.length)
      return null;
    return {
      get: () => list[index],
      set: (s) => {
        list[index] = s;
      },
      ...(kind === 'gear'
        ? {
            accepts: (s) => acceptsGear(GEAR_SLOTS[index], s),
            ...(GEAR_SLOTS[index] !== 'offhand' ? { limit: 1 } : {}),
          }
        : {}),
    };
  }
  if (kind === 'furnace' || kind === 'brew' || kind === 'box') {
    if (!stationKey) return null;
    const slot = blockSlots(world, ...stationKey.split(',').map(Number))?.[
      name
    ];
    if (!slot) return null;
    if (kind === 'furnace' && name === 'output')
      slot.taken = (s, n) => {
        const f = currentFurnace(),
          share = (f.xp * n) / s.count;
        f.xp = Math.max(0, f.xp - share);
        awardXP(share, [
          camera.position.x,
          playerFeet() + 0.5,
          camera.position.z,
        ]);
      };
    return slot;
  }
  return null;
}
const packRefs = (start = 0, end = INVENTORY_SLOTS) =>
  Array.from({ length: end - start }, (_, i) => 'pack:' + (i + start));
function quickMoveMatching(ref, stack) {
  if (!stack) return;
  const kind = ref.split(':')[0];
  const destinations = new Set(quickMoveDestinations(ref, stack));
  const refs = inventoryControls.options.visible().filter((candidate) => {
    if (candidate.split(':')[0] !== kind) return false;
    // When quick-move goes between the player's rows, keep the destination
    // rows out of this batch so items cannot be moved straight back again.
    if (destinations.has(candidate)) return false;
    const slot = resolveInventorySlot(candidate);
    return !slot?.output && sameStack(slot?.get(), stack);
  });
  for (const candidate of refs) quickMoveInventory(candidate);
}
function quickMoveInventory(ref) {
  if (ref === 'craft:output') {
    doCraft({ shiftKey: true });
    return;
  }
  if (ref === 'stonecut:output') {
    const destinations = [...packRefs(9), ...packRefs(0, 9)]
      .reverse()
      .map(resolveInventorySlot);
    for (let i = 0; i < 64; i++)
      if (!moveSlot(resolveInventorySlot(ref), destinations)) break;
    return;
  }
  const source = resolveInventorySlot(ref),
    stack = source?.get();
  if (!stack) return;
  moveSlot(
    source,
    quickMoveDestinations(ref, stack).map(resolveInventorySlot).filter(Boolean),
  );
}
function quickMoveDestinations(ref, stack) {
  let refs;
  if (!ref.startsWith('pack:')) {
    refs = [...packRefs(9), ...packRefs(0, 9)];
    if (ref.startsWith('box:') || resolveInventorySlot(ref)?.output)
      refs.reverse();
  } else if (overlay === '#station-overlay' && currentChest())
    refs = currentChest().map((_, i) => 'box:' + i);
  else if (overlay === '#station-overlay' && currentFurnace()) {
    refs = smeltingRecipe(stack.item, currentFurnace().kind)
      ? ['furnace:input']
      : FUELS[stack.item]
        ? ['furnace:fuel']
        : [];
  } else if (overlay === '#station-overlay' && currentStonecutter()) {
    refs = canStonecut(stack.item) ? ['stonecut:input'] : [];
  } else if (overlay === '#station-overlay' && currentBrewing()) {
    refs =
      stack.item === 'ember'
        ? ['brew:fuel']
        : POTIONS[stack.item]
          ? ['brew:0', 'brew:1', 'brew:2']
          : BREW_INGREDIENTS.includes(stack.item)
            ? ['brew:ingredient']
            : [];
  } else if (overlay === '#station-overlay' && currentEnchanting()) {
    refs =
      stack.item === 'lapis'
        ? ['enchant:1']
        : ITEMS[stack.item].durability
          ? ['enchant:0']
          : [];
  } else if (overlay === '#station-overlay' && currentSmithing()) {
    const left = workstationItems.smith[0];
    refs =
      !left && ITEMS[stack.item].durability
        ? ['smith:0']
        : left &&
            (stack.item === left.item ||
              (currentSmithing() !== 'grindstone' &&
                stack.item === repairMaterial(left.item)))
          ? ['smith:1']
          : [];
  } else {
    const gear = GEAR_SLOTS.indexOf(
      ITEMS[stack.item].offhand ? 'offhand' : ITEMS[stack.item].armorSlot,
    );
    if (gear >= 0 && !pack.gear[gear]) refs = ['gear:' + gear];
  }
  if (!refs?.length)
    refs = Number(ref.split(':')[1]) < 9 ? packRefs(9) : packRefs(0, 9);
  return refs;
}
function swapHotbar(ref, index) {
  inventorySession.swap(ref, 'pack:' + index);
}
function refreshInventoryPanel() {
  const panel = overlay && $(overlay + ' .panel'),
    scroll = panel?.scrollTop;
  const focus = document.activeElement?.dataset.invSlot;
  if (overlay === '#craft-overlay') renderCraft();
  else if (overlay === '#station-overlay') {
    if (currentChest()) renderChest();
    else if (currentFurnace()) renderFurnace();
    else if (currentBrewing()) renderBrewing();
    else if (currentEnchanting()) renderEnchanting();
    else if (currentSmithing()) renderSmithing();
    else if (currentStonecutter()) renderStonecutter();
  }
  if (panel) panel.scrollTop = scroll;
  if (focus)
    document
      .querySelector(`.overlay:not(.hidden) [data-inv-slot="${focus}"]`)
      ?.focus({ preventScroll: true });
}
function dropInventoryStack(stack, thrown = true) {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  drops.spawnStack(
    stack,
    [
      camera.position.x,
      thrown ? camera.position.y - 0.2 : playerFeet() + 0.5,
      camera.position.z,
    ],
    thrown ? [direction.x * 5, direction.y * 3 + 2, direction.z * 5] : null,
  );
}
function settleInventoryCursor() {
  inventoryControls?.cancel();
  const remainder = inventorySession.returnCursor(
    [...packRefs(9), ...packRefs(0, 9)].map(resolveInventorySlot),
  );
  if (remainder) dropInventoryStack(remainder);
  inventoryControls?.refresh();
}
function beep(freq = 300, duration = 0.06, type = 'sine', volume = 0.035) {
  soundFX.tone(freq, duration, type, volume);
}
function setSpawn() {
  const p = axialToWorld(0, 0);
  spawn.set(p.x, Math.max(4, world.surface(0, 0)) + 0.03, p.z);
}
function playerFeet() {
  return camera.position.y - playerEyeHeight();
}
function playerEyeHeight() {
  return glider.lowProfile ? 0.4 : crouching ? 1.27 : 1.65;
}
function playerHeight() {
  return glider.lowProfile ? 0.6 : crouching ? 1.5 : 1.8;
}
function collides(x, feet, z, height = playerHeight()) {
  if (boats.bodyBlocked(x, feet, z)) return true;
  return (
    !bodyClear(world, x, z, feet + 0.005, feet + height - 0.03) ||
    (!creativeFlying &&
      equipment.armor.feet === 'leatherFeet' &&
      !keys.has('ShiftLeft') &&
      !keys.has('ShiftRight') &&
      powderSupport(world, x, feet, z, playerFeet()))
  );
}
function safeSpawn() {
  crouching = creativeFlying = false;
  chorusCooldown = 0;
  pendingChorusUse = null;
  shulkerBullets.clear();
  glider.reset();
  flightEffects.clear();
  rocketCooldown = 0;
  dragonFight.clearAttacks();
  graphics.stepOffset = 0;
  throwables.clear();
  throwHeldItem = null;
  boats.riding = null;
  fishing.clear();
  if (respawnPoint) {
    const a = worldToAxial(respawnPoint[0], respawnPoint[2]);
    world.ensureAround(a.q, a.r);
    spawn.fromArray(respawnPoint);
  } else {
    world.ensureAround(0, 0);
    setSpawn();
  }
  graphics.sync(
    worldToAxial(spawn.x, spawn.z).q,
    worldToAxial(spawn.x, spawn.z).r,
    true,
  );
  camera.position.copy(spawn);
  camera.position.y += 1.65;
  vy = 0;
  motion.reset();
  grounded = false;
  for (
    let n = 0;
    n < WORLD_HEIGHT &&
    collides(camera.position.x, playerFeet(), camera.position.z);
    n++
  )
    camera.position.y++;
}
function startGame(mode = false, save = null) {
  fishing.clear();
  boats.load();
  boatTarget = null;
  const seed = save?.seed ?? Number($('#seed').value || 624);
  dimension = save?.dimension || 'overworld';
  dimensionStates = save?.dimensions ? structuredClone(save.dimensions) : {};
  const data = dimensionStates[dimension] || {
    edits: [],
    crops: [],
    chests: [],
  };
  world = new World(seed, dimension, {
    edits: data.edits,
    chests: data.chests,
    blockStates: data.blockStates,
    persistentLeaves: data.persistentLeaves,
    leafDecay: data.leafDecay,
    furnaces: data.furnaces,
    brewing: data.brewing,
    campfires: data.campfires,
    redstoneTimers: data.redstoneTimers,
    torchBurnouts: data.torchBurnouts,
    hopperCooldowns: data.hopperCooldowns,
    falling: data.falling,
    chorus: data.chorus,
    fluids: data.fluids,
    villageExclusions: data.villageExclusions,
    villageFeatures: data.villageFeatures,
    villageTrades: data.villageTrades,
    structureFeatures: data.structureFeatures,
    discoveredStructures: data.discoveredStructures,
    load: false,
  });
  pack = new PlayerInventory(save?.inventory);
  inventory = pack.counts;
  equipment = new Equipment().bind(pack);
  hotbar = pack.hotbar;
  inventorySession.cursor = structuredClone(save?.inventory.cursor ?? null);
  inventorySession.origin = null;
  craftingGrid = structuredClone(save?.crafting || newCraftingGrid());
  craftingReturns = [];
  workstationItems = structuredClone(
    save?.workstations || newWorkstationItems(),
  );
  pendingStationEffects = [];
  smithState.name = '';
  if (!save) {
    if (mode)
      HOTBAR.forEach((id, i) => {
        pack.slots[i] = {
          item: id,
          count: stackSize(id),
          ...(ITEMS[id].durability ? { wear: ITEMS[id].durability } : {}),
        };
      });
    else {
      pack.insert('dirt', 12);
      pack.insert('apple', 3);
      pack.insert('seed', 3);
    }
  }
  survival = new Survival(save?.survival);
  glider.load(save?.flight);
  flightEffects.clear();
  rocketCooldown = 0;
  chorusCooldown = 0;
  experience.loadPlayer(save?.experience || { seed });
  combat.reset();
  stopEating(true);
  weather = new Weather(save?.weather);
  weatherGrowthTimer = 0;
  creativeMineDelay = 0;
  portalExposure = portalCooldown = 0;
  $('#portal-overlay').style.opacity = 0;
  graphics.weatherEffects.flash = 0;
  graphics.weatherEffects.nextStrike = 18;
  graphics.weatherEffects.thunderDelay = -1;
  cancelBow();
  projectiles.clear();
  fireballs.clear();
  shulkerBullets.clear();
  throwables.clear();
  throwHeldItem = null;
  selected = save?.selected ?? 0;
  selectedRecipe = 0;
  health = save?.health ?? 20;
  hunger = save?.hunger ?? 20;
  time = save?.time ?? 105;
  creative = save?.creative ?? mode;
  creativeFlying = creative && save?.creativeFlying === true;
  crouching = data.crouching === true;
  if (creative) glider.stop();
  else if (!wornElytra() || wearValue(wornElytra().wear) <= 1) glider.stop();
  crops = new Map(data.crops);
  chests = world.chests;
  respawnPoint = data.respawn || null;
  const pos = save?.position;
  if (pos) {
    const a = worldToAxial(pos[0], pos[2]);
    world.ensureAround(a.q, a.r);
    camera.position.fromArray(pos);
    graphics.build(world, a.q, a.r);
  } else {
    world.ensureAround(0, 0);
    graphics.build(world);
    safeSpawn();
  }
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
  yaw = Number.isFinite(save?.yaw) ? save.yaw : -Math.PI / 2;
  pitch = Math.max(
    -1.5,
    Math.min(1.5, Number.isFinite(save?.pitch) ? save.pitch : -0.08),
  );
  camera.rotation.set(pitch, yaw, 0);
  fauna.load(world, data.fauna);
  dragonFight.load(world, data.dragon);
  weatherColumns.update(1, world);
  drops.load(data.drops);
  experience.load(data.experienceOrbs);
  boats.load(data.boats, data.mountedBoat);
  if (boats.riding) {
    const p = boats.riding.position;
    camera.position.set(p[0], p[1] + BOAT_EYE, p[2]);
  }
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
  lastDeath = data.lastDeath || null;
  fauna.sync(camera);
  creatureTarget = null;
  syncDecor();
  hasGame = true;
  document.body.classList.remove('hide-hud');
  hudSignature = '';
  $('#landing').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#seed').value = seed;
  updateHUD();
  closeOverlay();
  toast(
    creative
      ? '自由建造 · E 材料库 · 菜单可自由穿越维度'
      : '欢迎来到你的世界。长按左键采集，E 打开背包。',
  );
  saveGame();
}
function captureDimension() {
  dimensionStates[dimension] = {
    ...world.serialize(),
    dragon: dragonFight.serialize(),
    crawling: glider.lowProfile,
    crouching,
    fauna: fauna.serialize(),
    drops: drops.serialize(),
    experienceOrbs: experience.serialize(),
    boats: boats.serialize(),
    mountedBoat: boats.riding?.id ?? null,
    lastDeath,
    crops: [...crops],
    respawn: respawnPoint,
    position: camera.position.toArray(),
  };
}
function syncDecor() {
  maintainBuildings();
  const a = worldToAxial(camera.position.x, camera.position.z);
  villagers.sync(world, a.q, a.r);
  for (const v of world.villages(a.q, a.r, 32)) {
    const f = villageFeatures(v);
    for (const p of f.crops) {
      const k = key(p.q, p.y, p.r),
        id = 'crop:' + k;
      if (!world.loaded(p.q, p.r) || world.villageFeatures.has(id)) continue;
      world.villageFeatures.add(id);
      if (
        world.get(p.q, p.y, p.r) === 'farmland' &&
        !world.get(p.q, p.y + 1, p.r) &&
        !crops.has(k)
      )
        crops.set(k, { kind: p.kind, age: PLANTS[p.kind].seconds });
    }
    for (const p of f.chests) {
      const k = key(p.q, p.y, p.r),
        id = 'chest:' + k;
      if (!world.loaded(p.q, p.r) || world.villageFeatures.has(id)) continue;
      world.villageFeatures.add(id);
      if (world.get(p.q, p.y, p.r) === 'chest' && !chests.has(k))
        chests.set(k, newChest(p.loot));
    }
  }
  for (const s of world.structures(a.q, a.r, 32)) {
    if (
      !world.discoveredStructures.has(s.id) &&
      hexDistance(a.q - s.q, a.r - s.r) < (s.kind === 'endcity' ? 20 : 11) &&
      (s.kind === 'endcity'
        ? playerFeet() >= s.y - 4 && playerFeet() <= s.y + 30
        : Math.abs(playerFeet() - s.y) < 7)
    ) {
      world.discoveredStructures.add(s.id);
      toast('发现 ' + STRUCTURE_NAMES[s.kind] + ' · 已标记地图');
    }
    for (const guard of structureGuards(s)) {
      const id = 'guard:' + key(guard.q, guard.y, guard.r);
      if (
        !world.loaded(guard.q, guard.r) ||
        world.structureFeatures.has(id) ||
        fauna.active.length >= 80 ||
        fauna.records.size >= 2048
      )
        continue;
      const cell = axialToWorld(guard.q, guard.r),
        point = new THREE.Vector3(cell.x, guard.y + 0.005, cell.z);
      world.structureFeatures.add(id);
      if (shulkerAttachment(world, point, 0, true))
        fauna.spawn(guard.kind, point.toArray());
    }
    for (const p of structureLoot(world, s)) {
      const k = key(p.q, p.y, p.r),
        id = 'chest:' + k;
      if (!world.loaded(p.q, p.r) || world.structureFeatures.has(id)) continue;
      world.structureFeatures.add(id);
      if (world.get(p.q, p.y, p.r) === 'chest' && !chests.has(k))
        chests.set(k, newChest(p.loot, p.stacks));
    }
    for (const p of structurePlants(s)) {
      const k = key(p.q, p.y, p.r),
        id = 'crop:' + k;
      if (!world.loaded(p.q, p.r) || world.structureFeatures.has(id)) continue;
      world.structureFeatures.add(id);
      if (
        world.get(p.q, p.y, p.r) === 'soulSand' &&
        !world.get(p.q, p.y + 1, p.r) &&
        !crops.has(k)
      )
        crops.set(k, { kind: p.kind, age: PLANTS[p.kind].seconds });
    }
  }
  for (const [k, plant] of crops) {
    const [q, , r] = k.split(',').map(Number);
    if (world.loaded(q, r)) graphics.crop(k, plant);
  }
}
function travel(to) {
  if (!hasGame || !DIMENSIONS[to] || to === dimension) return false;
  stopEating(true);
  boats.riding = null;
  boatTarget = null;
  fishing.clear();
  projectiles.clear();
  fireballs.clear();
  shulkerBullets.clear();
  throwables.clear();
  throwHeldItem = null;
  cancelBow();
  captureDimension();
  glider.reset();
  flightEffects.clear();
  rocketCooldown = 0;
  boats.load();
  const seed = world.seed;
  world.clearLoaded();
  dimension = to;
  const data = dimensionStates[to] || { edits: [], crops: [], chests: [] };
  glider.lowProfile = data.crawling === true;
  crouching = data.crouching === true;
  world = new World(seed, to, {
    edits: data.edits,
    chests: data.chests,
    blockStates: data.blockStates,
    persistentLeaves: data.persistentLeaves,
    leafDecay: data.leafDecay,
    furnaces: data.furnaces,
    brewing: data.brewing,
    campfires: data.campfires,
    redstoneTimers: data.redstoneTimers,
    torchBurnouts: data.torchBurnouts,
    hopperCooldowns: data.hopperCooldowns,
    falling: data.falling,
    chorus: data.chorus,
    fluids: data.fluids,
    villageExclusions: data.villageExclusions,
    villageFeatures: data.villageFeatures,
    villageTrades: data.villageTrades,
    structureFeatures: data.structureFeatures,
    discoveredStructures: data.discoveredStructures,
    load: false,
  });
  crops = new Map(data.crops);
  chests = world.chests;
  respawnPoint = data.respawn || null;
  const endArrival = axialToWorld(-5, 0);
  let destination =
      data.position ||
      (to === 'end' ? [endArrival.x, 0, endArrival.z] : [0, 0, 0]),
    a = worldToAxial(destination[0], destination[2]);
  world.ensureAround(a.q, a.r);
  if (!data.position) {
    const h = Math.min(58, Math.max(9, world.terrainHeight(a.q, a.r)));
    for (let dq = -2; dq <= 2; dq++)
      for (let dr = -2; dr <= 2; dr++)
        if (hexDistance(dq, dr) <= 2) {
          world.set(
            a.q + dq,
            h - 1,
            a.r + dr,
            to === 'end' ? 'endstone' : to === 'nether' ? 'basalt' : 'stone',
          );
          for (let y = h; y < h + 4; y++)
            world.set(a.q + dq, y, a.r + dr, null);
        }
    if (to === 'end') world.set(a.q + 1, h, a.r, 'endportal');
    else buildArrivalPortal(world, a.q - 1, h, a.r + 1);
    const p = axialToWorld(a.q, a.r);
    destination = [p.x, h + 1.68, p.z];
  }
  camera.position.fromArray(destination);
  vy = 0;
  target = null;
  villagerTarget = null;
  tradingWith = null;
  leftDown = false;
  keys.clear();
  cancelBow();
  motion.reset();
  mining = 0;
  graphics.build(world, a.q, a.r);
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
  fauna.load(world, data.fauna);
  weatherColumns.update(1, world);
  drops.load(data.drops);
  experience.load(data.experienceOrbs);
  boats.load(data.boats);
  dragonFight.load(world, data.dragon);
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
  lastDeath = data.lastDeath || null;
  fauna.sync(camera);
  creatureTarget = null;
  syncDecor();
  damageCooldown = 3;
  $('#travel span').textContent = DIMENSIONS[to].name;
  $('#travel').classList.add('active');
  setTimeout(() => $('#travel').classList.remove('active'), 900);
  soundFX.play('portal');
  portalExposure = 0;
  portalCooldown = 15;
  $('#portal-overlay').style.opacity = 0;
  hudSignature = '';
  updateHUD();
  saveGame();
  return true;
}

function saveData() {
  containInventory();
  const savedInventory = pack.serialize(inventorySession.cursor);
  captureDimension();
  return {
    version: 16,
    dimension,
    dimensions: dimensionStates,
    seed: world.seed,
    inventory: savedInventory,
    crafting: structuredClone(craftingGrid),
    workstations: structuredClone(workstationItems),
    selected,
    survival: survival.serialize(),
    flight: glider.serialize(),
    experience: experience.serializePlayer(),
    weather: weather.serialize(),
    creative,
    creativeFlying,
    position: camera.position.toArray(),
    yaw,
    pitch,
    health,
    hunger,
    time,
    crops: [...crops],
    respawn: respawnPoint,
  };
}
function saveGame() {
  if (!hasGame) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData()));
    $('#continue').classList.remove('hidden');
  } catch {
    toast('本地存储不可用或已满，请在菜单导出存档。');
  }
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? validateSave(JSON.parse(raw)) : null;
  } catch {
    toast('存档无法读取。可以导入备份，或创建新世界。');
    return null;
  }
}
function lock() {
  if (isTouch) {
    playing = true;
    return;
  }
  try {
    const result = $('#world').requestPointerLock();
    result?.catch(() => {
      playing = false;
      toast('点击画面以进入鼠标控制。');
    });
  } catch {
    toast('点击画面以进入鼠标控制。');
  }
}
function openOverlay(id) {
  settleInventoryCursor();
  settleWorkstationItems();
  if (overlay === '#craft-overlay' && id !== '#craft-overlay')
    settleCraftingGrid();
  combat.reset();
  stopEating(true);
  closeChestLid();
  soundFX.weather(0, false, false, false);
  leftDown = false;
  keys.clear();
  cancelBow();
  motion.reset();
  mining = 0;
  playing = false;
  overlay = id;
  document.exitPointerLock?.();
  document
    .querySelectorAll('.overlay')
    .forEach((e) => e.classList.add('hidden'));
  $(id).classList.remove('hidden');
  if (id === '#craft-overlay') renderCraft();
  if (id === '#map-overlay') drawMap($('#world-map'), true);
  if (id === '#pause-overlay') {
    fromMenu = !hasGame;
    $('#resume').textContent = hasGame ? '回到旷野' : '回到首页';
    $('#mode-toggle').textContent = creative ? '切换生存探索' : '切换自由建造';
    document
      .querySelectorAll('[data-dimension]')
      .forEach(
        (b) =>
          (b.disabled =
            !hasGame || !creative || b.dataset.dimension === dimension),
      );
    $('#pause-title').textContent = hasGame ? '旷野会等你。' : '出发之前';
    $('#pause-description').textContent = hasGame
      ? '旅途已暂歇。世界会记住你留下的每一块砖。'
      : '无限六棱世界，三个维度。采集、建造、种植，按自己的节奏生活。';
    for (const id of ['export', 'mode-toggle', 'respawn', 'home'])
      $('#' + id).disabled = !hasGame;
  }
}
function closeOverlay() {
  settleInventoryCursor();
  settleCraftingGrid();
  settleWorkstationItems();
  closeChestLid();
  document
    .querySelectorAll('.overlay')
    .forEach((e) => e.classList.add('hidden'));
  overlay = null;
  inventoryControls.refresh();
  if (hasGame) {
    fromMenu = false;
    updateHUD();
    saveGame();
    lock();
  }
}
function nearbyType(type, radius = 5) {
  const a = worldToAxial(camera.position.x, camera.position.z),
    y = Math.floor(playerFeet());
  for (let q = a.q - 3; q <= a.q + 3; q++)
    for (let r = a.r - 3; r <= a.r + 3; r++) {
      const p = axialToWorld(q, r);
      if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > radius)
        continue;
      for (let h = y - 2; h <= y + 2; h++)
        if (world.get(q, h, r) === type) return true;
    }
  return false;
}
function currentCraftingMatch() {
  const matches = craftingMatches(
    craftingGrid,
    creative || nearbyType('workbench'),
  );
  return matches.find((m) => m.index === selectedRecipe) || matches[0] || null;
}
function renderRecipeBook() {
  const station = creative || nearbyType('workbench');
  $('#recipes').innerHTML = recipeBookHTML(
    craftingStock(pack, craftingGrid),
    craftingPreviewOnly
      ? selectedRecipe
      : (currentCraftingMatch()?.index ?? selectedRecipe),
    station,
    $('#recipe-search').value,
    $('#recipe-available').checked,
    creative,
  );
}
function renderCraft() {
  containInventory();
  const paletteQuery = $('#creative-search')?.value || '';
  const paletteOpen = $('.creative-palette')?.open ?? true;
  const paletteScroll = $('.palette-grid')?.scrollTop || 0;
  const recipeScroll = $('#recipes').scrollTop;
  const station = creative || nearbyType('workbench'),
    match = currentCraftingMatch();
  const reference = RECIPES[selectedRecipe],
    recipe = craftingPreviewOnly ? reference : match?.recipe || reference;
  const guide = showCraftGuide
    ? (!craftingPreviewOnly && match?.cells) || recipeCells(reference)
    : null;
  const stock = craftingStock(pack, craftingGrid);
  renderRecipeBook();
  $('#recipes').scrollTop = recipeScroll;
  $('#recipe-book').hidden = !recipeBookOpen;
  $('.workshop-layout').classList.toggle('book-closed', !recipeBookOpen);
  $('#recipe-book-toggle').setAttribute(
    'aria-expanded',
    String(recipeBookOpen),
  );
  $('#recipe-title').textContent = recipe.title;
  $('#recipe-desc').textContent = recipe.desc;
  $('#craft-context').textContent = station
    ? '工作台 · 七格合成'
    : '随身 · 七格合成';
  $('#pattern').innerHTML = craftingGridHTML(craftingGrid, guide, recipe);
  $('#recipe-cost').innerHTML = Object.entries(recipe.cost)
    .map(
      ([id, n]) =>
        `<span class="${ingredientCount(recipe, id, stock) < n && !creative ? 'missing' : ''}">${icon(id)} ${ingredientName(recipe, id, ITEMS[id].name)} ${creative ? '∞' : ingredientCount(recipe, id, stock)} / ${n}</span>`,
    )
    .join('');
  const output = craftingResult(match);
  $('#craft-button').disabled = !output;
  $('#craft-button').innerHTML =
    stackContent(output) || '<span class="slot-ghost">?</span>';
  $('#craft-button').setAttribute(
    'aria-label',
    output
      ? stackTitle(output).replaceAll('\n', ' · ') + ' ×' + output.count
      : '合成产物：尚无匹配配方',
  );
  $('#craft-product-name').textContent = output
    ? ITEMS[output.item].name + ' ×' + output.count
    : '等待摆料';
  const alternatives = craftingMatches(craftingGrid, station);
  const locked = !station && craftingMatches(craftingGrid, true).length > 0;
  $('#craft-match').innerHTML =
    alternatives.length > 1
      ? '<span>可合成：</span>' +
        alternatives
          .map(
            (m) =>
              `<button data-craft-choice="${m.index}" aria-pressed="${m.index === match.index}">${icon(m.recipe.id)}${ITEMS[m.recipe.id].name} ×${m.recipe.count}</button>`,
          )
          .join('')
      : locked
        ? '图案正确，需要附近的工作台'
        : output
          ? craftingPreviewOnly
            ? '当前网格产物：' + ITEMS[output.item].name + ' · 参考配方尚未填料'
            : '图案匹配 · 取出产物时扣料'
          : craftingGrid.some(Boolean)
            ? '按提示补齐材料，或自由尝试新的图案'
            : '放入材料，或点击配方册自动填料';
  $('#fill-recipe').disabled = !!reference.station && !station;
  $('#craft-guide').checked = showCraftGuide;
  $('#station-note').textContent =
    reference.station && !station
      ? '此配方需要 5 格内的工作台'
      : 'Shift 点击配方 / 填料：填入尽可能多的批次';
  $('#inventory').innerHTML =
    playerSlots(pack, true) + (creative ? creativePalette() : '');
  if (creative) {
    $('#creative-search').value = paletteQuery;
    $('.creative-palette').open = paletteOpen;
    $('.palette-grid').scrollTop = paletteScroll;
    document.querySelectorAll('[data-creative-item]').forEach((b) => {
      b.hidden = !b.dataset.search.includes(paletteQuery.trim().toLowerCase());
    });
  }
  $('#pack-capacity').textContent =
    `${usedSlots(inventory)} / ${INVENTORY_SLOTS} 格`;
}
function selectCraftRecipe(index, all = false) {
  if (!Number.isInteger(index) || !RECIPES[index]) return;
  inventoryControls.cancel();
  selectedRecipe = index;
  craftingPreviewOnly = false;
  const recipe = RECIPES[index];
  if (recipe.station && !creative && !nearbyType('workbench')) {
    craftingPreviewOnly = true;
    toast('需要在工作台 5 格范围内；已显示配方提示。');
  } else {
    const result = fillCraftingRecipe(
      pack,
      craftingGrid,
      recipe,
      all,
      creative,
    );
    if (!result.ok) {
      craftingPreviewOnly = true;
      toast(
        result.reason === 'missing'
          ? '材料不足。淡色图标仅为提示，不会消耗物品。'
          : '背包放不下原有材料，先腾出空间或手动调整网格。',
      );
    } else soundFX.play('pickup');
  }
  updateHUD();
  renderCraft();
  inventoryControls.refresh();
  saveGame();
}
function doCraft(event) {
  const result = quickCraft(
    pack,
    craftingGrid,
    selectedRecipe,
    creative || nearbyType('workbench'),
    event?.shiftKey ? 64 : 1,
  );
  if (!result.count) {
    toast('没有可取出的产物，或背包空间不足。');
    return;
  }
  craftingReturns.push(...result.remainders);
  soundFX.play('craft');
  graphics.swing();
  updateHUD();
  renderCraft();
  saveGame();
  toast(`已合成 ${ITEMS[result.item].name} ×${result.count}`);
}
function settleCraftingGrid() {
  containInventory();
  returnCraftingGrid(pack, craftingGrid);
  for (const stack of craftingGrid) if (stack) dropInventoryStack(stack, false);
  craftingGrid.fill(null);
}

function heldItem() {
  const id = hotbar[selected];
  return id;
}
function handRef(hand = actionHand || 'main') {
  return hand === 'offhand' ? 'gear:4' : 'pack:' + selected;
}
function handStack(hand = actionHand || 'main') {
  return resolveInventorySlot(handRef(hand))?.get();
}
function validHandUse(use, item) {
  return !!(
    use &&
    handRef(use.hand) === use.ref &&
    handStack(use.hand) === use.stack &&
    use.stack?.item === item
  );
}
function arrowSlot() {
  if (ARROW_ITEMS[pack.gear[4]?.item]) return resolveInventorySlot('gear:4');
  if (ARROW_ITEMS[pack.slots[selected]?.item])
    return resolveInventorySlot('pack:' + selected);
  const index = pack.slots.findIndex((stack) => ARROW_ITEMS[stack?.item]);
  return index < 0 ? null : resolveInventorySlot('pack:' + index);
}
function collectArrow(item) {
  const offhand = pack.gear[4];
  if (offhand?.item === item && offhand.count < stackSize(item))
    offhand.count++;
  else if (!pack.insertStack({ item, count: 1 })) return false;
  pickupNotice(item, 1);
  updateHUD();
  return true;
}
function arrowCount(item) {
  return (
    (inventory[item] || 0) +
    (pack.gear[4]?.item === item ? pack.gear[4].count : 0)
  );
}
function cancelBow() {
  bowUse = null;
  bowCharge = 0;
}
function useBow() {
  if (useItem() !== 'bow') return false;
  if (bowUse) return true;
  if (!creative && !arrowSlot()) {
    toast('需要箭矢：可放在副手、快捷栏或背包。');
    return true;
  }
  const input = heldUseInput();
  if (!input) {
    toast('按住右键或触屏「用」拉弓，松开发射。');
    return true;
  }
  stopEating();
  blockUse = throwHeldItem = null;
  bowUse = {
    hand: actionHand || 'main',
    ref: handRef(),
    stack: handStack(),
    input,
  };
  bowCharge = mining = 0;
  combat.reset();
  return true;
}
function updateBowUse(dt) {
  if (!bowUse) return;
  if (
    !validHandUse(bowUse, 'bow') ||
    !foodInputs.has(bowUse.input) ||
    leftDown ||
    foodUse ||
    combat.raised ||
    (!creative && !arrowSlot())
  ) {
    cancelBow();
    return;
  }
  bowCharge = Math.min(1, bowCharge + dt);
}
function requestedShieldHand() {
  if (keys.has('KeyR'))
    return handStack('offhand')?.item === 'shield'
      ? 'offhand'
      : handStack('main')?.item === 'shield'
        ? 'main'
        : null;
  if (!heldUseInput() || bowUse || foodUse) return null;
  const hand = chooseUseHand();
  return handStack(hand)?.item === 'shield' ? hand : null;
}
function blockingShield() {
  return combat.raised && validHandUse(combat, 'shield') ? combat.stack : null;
}
function availableShield() {
  return (
    blockingShield() ||
    [handStack('offhand'), handStack('main')].find(
      (stack) => stack?.item === 'shield',
    )
  );
}
function updateShield(dt) {
  const hand = requestedShieldHand(),
    stack = hand && handStack(hand);
  if (
    combat.hand !== hand ||
    combat.stack !== stack ||
    (hand && combat.ref !== handRef(hand))
  )
    combat.reset();
  combat.hand = hand;
  combat.stack = stack;
  combat.ref = hand ? handRef(hand) : null;
  if (hand && keys.has('KeyR')) cancelBow();
  combat.update(dt, !!hand && !foodUse && !bowUse && !glider.active);
}
function useItem() {
  return handStack()?.item;
}
function useCount(id = useItem()) {
  const stack = handStack();
  return stack?.item === id ? stack.count : 0;
}
function withUseHand(hand, action) {
  const previous = actionHand;
  actionHand = hand;
  try {
    return action();
  } finally {
    actionHand = previous;
  }
}
function beginUse(action) {
  const hand = chooseUseHand(),
    item = handStack(hand)?.item,
    previousTarget = target,
    previousWorld = world;
  // A bucket in the offhand must not make the main-hand mining ray stop on
  // water. Only use actions need the liquid surface as their selected target.
  const liquidTarget =
    ITEMS[item]?.bucket || ['boat', 'glassBottle'].includes(item);
  if (liquidTarget) target = graphics.target(true);
  try {
    return withUseHand(hand, action);
  } finally {
    if (liquidTarget && world === previousWorld) target = previousTarget;
  }
}
function consumeUseItem(id = useItem(), count = 1) {
  if (useCount(id) < count) return false;
  if (!creative) takeSlot(resolveInventorySlot(handRef()), count);
  return true;
}
function exchangeUseItem(next) {
  const slot = resolveInventorySlot(handRef());
  if (creative) return;
  consumeUseItem();
  if (!slot.get()) slot.set({ item: next, count: 1 });
  else addItem(next);
}
function useSwing() {
  graphics.swing(actionHand || 'main');
}
function heldUseInput() {
  return foodInputs.has('mouse')
    ? 'mouse'
    : foodInputs.has('touch-use')
      ? 'touch-use'
      : null;
}
function rememberBlockUse(item) {
  const input = heldUseInput();
  if (input)
    blockUse = {
      item,
      input,
      hand: actionHand || 'main',
      ref: handRef(),
      timer: 0.2,
    };
}
function wearUseItem(id = useItem(), amount = 1) {
  const stack = handStack();
  if (stack?.item !== id) return;
  if (equipment.damageStack(stack, amount, creative)) {
    toast(ITEMS[id].name + '损坏了');
    soundFX.play('break', 'glass');
  }
  updateHUD();
}
function canPlantHere(item) {
  const kind = plantForItem(item);
  return !!(
    kind &&
    target &&
    !plantingIssue(world, kind, target.q, target.y, target.r)
  );
}
function handCanUse(hand) {
  const id = handStack(hand)?.item,
    item = ITEMS[id];
  if (!item) return false;
  if (cauldronAction(target?.type, id)) return true;
  if (
    (id === 'boneMeal' && isCaveVine(target?.type)) ||
    (id === 'glowBerries' &&
      target?.normal?.y < -0.5 &&
      canHang(world, target.place.q, target.place.y, target.place.r, true))
  )
    return true;
  const mob = creatureTarget;
  if (mob && !MOBS[mob.kind]?.hostile) {
    const def = MOBS[mob.kind];
    if ((def.foods || [def.food]).includes(id)) return true;
    if (
      (id === 'shears' && mob.kind === 'sheep') ||
      (id === 'bucket' && mob.kind === 'cow')
    )
      return true;
  }
  if (
    isCampfire(target?.type) &&
    (CAMPFIRE_FOODS[id] || id === 'torch' || item.kind === 'shovel')
  )
    return true;
  if (plantForItem(id) && target && (!FOODS[id] || canPlantHere(id)))
    return true;
  if (FOODS[id]) return canEat(id, hand);
  return !!(
    ((BLOCKS[id] || id === 'redstone') &&
      target &&
      !creatureTarget &&
      !villagerTarget) ||
    item.bucket ||
    THROWABLES[id] ||
    ['glassBottle', 'fireworkRocket', 'flintAndSteel', 'endCrystal'].includes(
      id,
    ) ||
    (id === 'bow' && (creative || !!arrowSlot())) ||
    id === 'fishingRod' ||
    id === 'shield' ||
    (id === 'boneMeal' && target?.crop) ||
    (item.kind === 'axe' &&
      BLOCKS[target?.type]?.stripped &&
      !creatureTarget) ||
    (item.kind === 'hoe' && ['grass', 'dirt'].includes(target?.type))
  );
}
function chooseUseHand() {
  return handCanUse('main')
    ? 'main'
    : handCanUse('offhand')
      ? 'offhand'
      : 'main';
}
function swapHands() {
  stopEating(true);
  throwHeldItem = null;
  leftDown = false;
  mining = 0;
  cancelBow();
  miningKey = '';
  fishing.clear();
  combat.reset();
  inventorySession.swap('pack:' + selected, 'gear:4');
  graphics.swing();
  updateHUD();
  saveGame();
}
function wearItem(id, amount = 1, worn = false) {
  // Ranged gear and shields wear only through their dedicated use actions.
  if (!worn && ['bow', 'fishingRod', 'shield'].includes(id)) return;
  if (equipment.damage(id, amount, creative, worn)) {
    toast(ITEMS[id].name + '损坏了');
    soundFX.play('break', 'glass');
  }
  updateHUD();
}
function updateHUD() {
  pack.selected = selected;
  containInventory();
  graphics.shieldEquipped = pack.gear[4]?.item === 'shield';
  graphics.mainShieldEquipped = heldItem() === 'shield';
  if (bowUse && !validHandUse(bowUse, 'bow')) cancelBow();
  if (fishingUse && !validHandUse(fishingUse, 'fishingRod')) {
    fishing.clear();
    fishingUse = null;
  }
  tool = miningStats('', heldItem()).tier;
  $('#armor-hud').textContent = creative
    ? ''
    : '护甲 ' + equipment.protection() + ' / 20';
  document
    .querySelectorAll('[data-dimension]')
    .forEach(
      (b) =>
        (b.disabled =
          !hasGame || !creative || b.dataset.dimension === dimension),
    );
  const signature = JSON.stringify([
    pack.slots.slice(0, 9),
    pack.gear[4],
    selected,
    creative,
  ]);
  if (hudSignature !== signature) {
    hudSignature = signature;
    const offhand = pack.gear[4];
    $('#hotbar').innerHTML =
      (offhand
        ? `<span class="slot offhand-slot ${enchantLabel(offhand.wear) ? 'enchanted' : ''}" role="img" aria-label="副手：${escapeHTML(stackTitle(offhand).replaceAll('\n', ' · '))} ×${offhand.count}">${stackContent(offhand)}<span class="num">副</span></span>`
        : '') +
      pack.slots
        .slice(0, 9)
        .map(
          (stack, i) =>
            `<button class="slot ${i === selected ? 'active' : ''} ${enchantLabel(stack?.wear) ? 'enchanted' : ''}" data-slot="${i}" aria-label="${i + 1} ${escapeHTML(stack ? stackTitle(stack).replaceAll('\n', ' · ') : '空格')}">${stackContent(stack)}${THROWABLES[stack?.item] || stack?.item === 'chorusFruit' ? '<i class="item-cooldown" aria-hidden="true"></i>' : ''}<span class="num">${i + 1}</span></button>`,
        )
        .join('');
  }
  const selectedEnchant = enchantLabel(pack.slots[selected]?.wear);
  $('#selected-name').textContent =
    (heldItem()
      ? customName(pack.slots[selected]?.wear) || ITEMS[heldItem()].name
      : '') + (selectedEnchant ? ' · ' + selectedEnchant : '');
  $('#health').textContent = creative
    ? '◇ 自由建造'
    : '♥'.repeat(Math.ceil(health / 2)) +
      '♡'.repeat(10 - Math.ceil(health / 2));
  $('#hunger').textContent = creative
    ? '无限材料'
    : `饱食 ${Math.ceil(hunger)} / 20`;
  const held = heldItem();
  $('#tool').textContent =
    held && ITEMS[held].durability
      ? `${wearValue(pack.slots[selected].wear)} / ${ITEMS[held].durability}`
      : HELD_LIGHTS[held]
        ? '随身照明'
        : HELD_LIGHTS[pack.gear[4]?.item]
          ? '副手照明'
          : '';
  const a = worldToAxial(camera.position.x, camera.position.z),
    phase = time % 600;
  $('#world-info').textContent =
    `第 ${Math.floor(time / 600) + 1} 天 / ${phase < 270 ? '日光' : phase < 330 ? '黄昏' : phase < 570 ? '星夜' : '黎明'}${dimension === 'overworld' && phase >= 300 ? ' · ' + moonPhase(time).name : ''} · ${creative ? '创造' : '生存'}`;
  $('#location').innerHTML =
    `${DIMENSIONS[dimension].name} · 种子 ${world.seed}<br>Q ${a.q} / R ${a.r} / Y ${Math.floor(playerFeet())}<br>${creative ? (creativeFlying ? '飞行 · 空格 ↑ · Shift ↓' : '双击空格起飞 · Shift 蹲伏') : 'E 背包 · 右键使用 · Shift 蹲伏'}`;
  $('#dimension-name').textContent = DIMENSIONS[dimension].name;
  $('#weather-hud').textContent =
    dimension === 'overworld' ? weather.label(world.biome(a.q, a.r)) : '';
  $('#weather-controls').classList.toggle(
    'hidden',
    !creative || dimension !== 'overworld',
  );
  const settlement = world
    .villages(a.q, a.r, 0)
    .find((v) => hexDistance(a.q - v.q, a.r - v.r) <= 12);
  const cave =
    camera.position.y < world.terrainHeight(a.q, a.r) - 1
      ? world
          .caves(a.q, a.r)
          .find((c) => hexDistance(a.q - c.q, a.r - c.r) < c.radius)
      : null;
  $('#biome-name').textContent =
    cave?.name || settlement?.name || world.biome(a.q, a.r);
  $('#compass').textContent = [
    '北 N',
    '西北 NW',
    '西南 SW',
    '南 S',
    '东南 SE',
    '东北 NE',
  ][((Math.round(yaw / (Math.PI / 3)) % 6) + 6) % 6];
  document.documentElement.style.setProperty(
    '--dimension',
    DIMENSIONS[dimension].color,
  );
  graphics.setHeld(heldItem());
  graphics.setOffhand(pack.gear[4]?.item);
  graphics.offhandEnchanted = !!enchantLabel(pack.gear[4]?.wear);
  graphics.heldEnchanted = !!enchantLabel(pack.slots[selected]?.wear);
}
function pickupNotice(id, n) {
  const popup = document.createElement('div');
  popup.className = 'pickup';
  popup.innerHTML =
    icon(id) + '<span>' + ITEMS[id].name + '</span><b>+' + n + '</b>';
  $('#pickups').append(popup);
  while ($('#pickups').children.length > 4) $('#pickups').firstChild.remove();
  setTimeout(() => popup.remove(), 2400);
}
function addItem(id, n = 1) {
  const taken = Math.min(n, roomFor(inventory, id));
  inventory[id] = (inventory[id] || 0) + taken;
  if (taken > 0) pickupNotice(id, taken);
  if (taken < n) {
    drops.spawn(id, n - taken, [
      camera.position.x,
      playerFeet() + 0.5,
      camera.position.z,
    ]);
    toast('背包已满，多余物品留在脚边。Q 丢出手持物，或存入箱子。');
  }
  updateHUD();
  return taken;
}
function awardXP(value, position) {
  if (!creative && value > 0) experience.spawn(value, position);
}
function updateExperienceHUD() {
  const level = experience.level;
  const next = xpForLevel(level + 1),
    base = xpForLevel(level);
  $('#experience-hud').classList.toggle('hidden', creative);
  $('#experience-level').textContent = level;
  $('#experience-level').title = '等级 ' + level;
  $('#experience-progress').value = (experience.total - base) / (next - base);
  $('#experience-progress').title =
    '经验 ' + (experience.total - base) + ' / ' + (next - base);
}
function collectDrop(d, capacityOnly = false) {
  const n = Math.min(d.count, roomFor(inventory, d.item));
  if (capacityOnly || n <= 0) return Math.max(0, n);
  if (ITEMS[d.item].portable)
    pack.insertStack({ item: d.item, count: n, contents: d.contents });
  else pack.insert(d.item, n, d.wear[d.item] || []);
  pickupNotice(d.item, n);
  beep(720 + Math.random() * 180, 0.06, 'sine', 0.025);
  updateHUD();
  return n;
}
function containInventory() {
  for (const stack of craftingReturns.splice(0)) {
    const moved = pack.insertStack(stack);
    if (moved < stack.count)
      dropInventoryStack({ ...stack, count: stack.count - moved }, false);
  }
  const overflow = pack.overflow.splice(0);
  for (const stack of overflow) dropInventoryStack(stack, false);
  if (overflow.length) toast('背包已满，多余物品落在脚边。');
}
function throwItem(wholeStack = false) {
  const stack = takeSlot(
    resolveInventorySlot('pack:' + selected),
    wholeStack ? Infinity : 1,
  );
  if (!stack) return;
  dropInventoryStack(stack);
  updateHUD();
  saveGame();
}
function dropAt(id, n, q, y, r, wear = {}) {
  const p = axialToWorld(q, r);
  drops.spawn(id, n, [p.x, y + 0.5, p.z], wear);
}
function mine(dt) {
  if (!target?.type || target.fluid || villagerTarget || creatureTarget) {
    mining = 0;
    return;
  }
  if (target.crop) {
    harvestPlant(target.crop, true);
    target = null;
    leftDown = false;
    mining = 0;
    return;
  }
  const data = BLOCKS[target.type];
  const held = heldItem(),
    enchant = equipment.tags(held),
    stats = miningStats(target.type, held, enchant);
  if (data.hardness === Infinity) {
    mining = 0;
    return;
  }
  const k = key(target.q, target.y, target.r);
  const actionKey = `${k}:${target.type}:${selected}:${held}`;
  if (actionKey !== miningKey) {
    mining = 0;
    miningKey = actionKey;
    if (!creative && !stats.harvest)
      toast(
        `${data.name}需要${stats.requiredTool === 'pick' ? ITEMS['pick' + stats.requiredTier].name : '铲子'}才能获得掉落物；当前工具只能缓慢破坏。`,
      );
  }
  if (creative && creativeMineDelay > 0) {
    mining = 0;
    return;
  }
  const helmet = equipment.armor.head;
  mining = creative
    ? data.hardness
    : mining +
      dt *
        miningRate(stats, {
          underwater: survivalSubmerged,
          grounded,
          aquaAffinity: !!helmet && equipment.rank(helmet, 'aquaAffinity') > 0,
        });
  $('#mine-progress i').style.width =
    `${data.hardness > 0 ? Math.min(100, (mining / data.hardness) * 100) : 100}%`;
  if (mining < data.hardness) return;
  const { q, y, r, type } = target;
  if (creative) creativeMineDelay = 0.2;
  graphics.swing();
  if (isChorus(type)) {
    harvestChorusBlock(q, y, r, true, !creative);
    wearItem(held);
    mining = 0;
    target = null;
    return;
  }
  if (BLOCKS[type].shape) {
    removeBuilding(q, y, r, !creative && stats.harvest && type !== 'cobweb');
    if (type === 'cobweb' && !creative && stats.harvest)
      for (const stack of miningLoot(type, { tool: ITEMS[held]?.kind, enchant })
        .stacks)
        dropAt(stack.item, stack.count, q, y, r);
    wearItem(held, type === 'cobweb' && ITEMS[held]?.kind === 'sword' ? 2 : 1);
    mining = 0;
    target = null;
    return;
  }
  if (isStorage(type)) syncDecor();
  const packed = ITEMS[type]?.portable ? packStorage(k, type) : null;
  graphics.blockBreak(target);
  world.set(q, y, r, null);
  graphics.updateBlock(q, y, r);
  if (type === 'obsidian') refreshNetherPortals();
  soundFX.play('break', type);
  wearItem(held, ITEMS[held]?.kind === 'sword' ? 2 : 1);
  if (packed && (!creative || packed.contents.some(Boolean))) {
    const point = axialToWorld(q, r);
    drops.spawnStack(packed, [point.x, y + 0.5, point.z]);
  }
  if (!creative && stats.harvest) {
    const loot = miningLoot(type, { tool: ITEMS[held]?.kind, enchant });
    if (!packed)
      for (const stack of loot.stacks) dropAt(stack.item, stack.count, q, y, r);
    if (loot.xp)
      awardXP(loot.xp, [axialToWorld(q, r).x, y + 0.5, axialToWorld(q, r).z]);
    if (type === 'grass' && !enchant.silkTouch && Math.random() < 0.35)
      dropAt('seed', 1, q, y, r);
  }
  if (!creative) survival.exhaust(0.02);
  if (crops.has(k)) {
    harvestPlant(k, true);
  }
  spillChest(k);
  spillFurnace(k);
  spillBrewing(k);
  mining = 0;
  target = null;
}
function useGlassBottle() {
  if (useItem() !== 'glassBottle') return false;
  const fluid = target?.fluid && world.fluids.get(target.q, target.y, target.r);
  if (!fluid?.source || fluid.type !== 'water') {
    toast('玻璃瓶需要对准水源。装水不会消耗水源。');
    return true;
  }
  if (creative) addItem('waterBottle');
  else exchangeUseItem('waterBottle');
  soundFX.play('drink');
  useSwing();
  updateHUD();
  saveGame();
  toast('已装满水瓶 · 加入下界疣可以开始酿造');
  return true;
}
function useCauldron() {
  if (!isCauldron(target?.type)) return false;
  const id = useItem();
  if (!ITEMS[id]?.bucket && !['glassBottle', 'waterBottle'].includes(id))
    return false;
  const action = cauldronAction(target.type, id);
  if (!action) {
    toast(
      id === 'bucket'
        ? '装满三档后才能用桶取出。'
        : '这个物品不能继续改变锅中液体。',
    );
    return true;
  }
  if (!creative && useCount(id) < 1) return true;
  const { q, y, r } = target;
  world.set(q, y, r, action.type);
  if (!creative) exchangeUseItem(action.item);
  else if (id === 'bucket')
    resolveInventorySlot(handRef()).set({ item: action.item, count: 1 });
  else if (id === 'glassBottle') addItem(action.item);
  graphics.updateCells([[q, y, r]]);
  useSwing();
  soundFX.play('splash');
  updateHUD();
  saveGame();
  return true;
}
function useBucket() {
  const id = useItem(),
    kind = ITEMS[id]?.bucket;
  if (!kind) return false;
  if (!target) {
    toast('对准液体源或细雪装桶，或对准方块倒出内容。');
    return true;
  }
  if (!creative && useCount(id) < 1) {
    toast('背包里没有这个桶。');
    return true;
  }
  let next;
  let changedSnow = null;
  if (kind === 'empty' && target.type === 'powderSnow') {
    const { q, y, r } = target;
    world.set(q, y, r, null);
    changedSnow = [q, y, r];
    next = 'powderSnowBucket';
  } else if (kind === 'powderSnow') {
    const p = target.place;
    if (
      !p ||
      p.y < 1 ||
      p.y >= world.maxY ||
      world.get(p.q, p.y, p.r) ||
      world.fluids.get(p.q, p.y, p.r)
    ) {
      toast('这里无法放置细雪。');
      return true;
    }
    world.set(p.q, p.y, p.r, 'powderSnow');
    changedSnow = [p.q, p.y, p.r];
    next = 'bucket';
  } else if (kind === 'empty') {
    if (!target.fluid) {
      toast('空桶需要对准液体源或细雪。');
      return true;
    }
    const type = world.fluids.scoop(target.q, target.y, target.r);
    if (!type) {
      toast('只能装取液体源，流动液体无法装桶。');
      return true;
    }
    next = LIQUIDS[type].bucket;
  } else {
    const p = target.fluid && target.type !== kind ? target : target.place;
    if (!p || !world.fluids.source(p.q, p.y, p.r, kind)) {
      toast('这里无法倒出液体。');
      return true;
    }
    next = 'bucket';
  }
  if (!creative) exchangeUseItem(next);
  else if (kind === 'empty')
    resolveInventorySlot(handRef()).set({ item: next, count: 1 });
  if (changedSnow) graphics.updateCells([changedSnow]);
  flushFluidChanges();
  updateCampfires(0);
  refreshNetherPortals();
  graphics.fluidRenderer.sync(world, new Set(graphics.chunks.keys()), true);
  soundFX.play('splash');
  useSwing();
  updateHUD();
  saveGame();
  return true;
}
function flushFluidChanges() {
  for (const k of world.fluids.washedWebs)
    dropAt('string', 1, ...k.split(',').map(Number));
  world.fluids.washedWebs.clear();
  const chunks = new Set();
  for (const k of world.fluids.blockChanges) {
    const [q, y, r] = k.split(',').map(Number);
    chunks.add(graphics.chunkKey(q, r));
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ])
      chunks.add(graphics.chunkKey(q + a, r + b));
    graphics.updateLight(q, y, r);
  }
  world.fluids.blockChanges.clear();
  for (const k of chunks) if (graphics.chunks.has(k)) graphics.buildChunk(k);
}
function leaveBoat() {
  const b = boats.riding;
  if (!b) return false;
  const candidates = [];
  for (const radius of [1.9, 2.6])
    for (let i = 0; i < 6; i++) {
      const angle = b.yaw + (i * Math.PI) / 3;
      const x = b.position[0] + Math.sin(angle) * radius,
        z = b.position[2] + Math.cos(angle) * radius;
      const a = worldToAxial(x, z);
      if (!world.loaded(a.q, a.r)) continue;
      for (
        let y = Math.floor(b.position[1]) + 1;
        y >= Math.floor(b.position[1]) - 2;
        y--
      ) {
        const feet = y + 1.02;
        if (world.pointSolid(x, y + 0.95, z) && !collides(x, feet, z)) {
          candidates.push({ x, z, feet, wet: false });
          break;
        }
        const f = world.fluids.get(a.q, y, a.r);
        if (
          f?.type === 'water' &&
          !f.falling &&
          !world.fluids.get(a.q, y + 1, a.r)
        ) {
          const waterFeet = y + fluidHeight(f) + 0.04;
          if (!collides(x, waterFeet, z)) {
            candidates.push({ x, z, feet: waterFeet, wet: true });
            break;
          }
        }
      }
    }
  candidates.sort((a, b) => Number(a.wet) - Number(b.wet));
  const spot = candidates[0];
  if (!spot) {
    toast('附近没有安全的下船位置，先移到岸边或开阔水面。');
    return false;
  }
  boats.riding = null;
  b.vx = b.vz = 0;
  camera.position.set(spot.x, spot.feet + 1.65, spot.z);
  vy = 0;
  motion.reset();
  fishing.clear();
  toast(spot.wet ? '已下船到水面 · 空格游泳上浮' : '已靠岸下船');
  saveGame();
  return true;
}
function interactBoat() {
  if (boats.riding) {
    leaveBoat();
    return true;
  }
  if (
    !boatTarget ||
    creatureTarget ||
    villagerTarget ||
    !boats.records.includes(boatTarget.boat)
  )
    return false;
  const b = boatTarget.boat;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) {
    if (!creative && roomFor(inventory, 'boat') < 1) {
      toast('背包已满，先腾出一格再收船。');
      return true;
    }
    boats.remove(b, false);
    addItem('boat');
    boatTarget = null;
    toast('已收回橡木船。');
    saveGame();
    return true;
  }
  if (boats.blocked(world, ...b.position, b, true)) {
    toast('船上空间不足，先清理上方的障碍。');
    return true;
  }
  boats.riding = b;
  fishing.clear();
  motion.reset();
  vy = 0;
  grounded = true;
  yaw = b.yaw;
  camera.rotation.set(pitch, yaw, 0);
  camera.position.set(b.position[0], b.position[1] + BOAT_EYE, b.position[2]);
  boatTarget = null;
  toast('W/S 划行 · A/D 转向 · 空格刹船 · Shift 下船');
  saveGame();
  return true;
}
function useBoatItem() {
  if (useItem() !== 'boat') return false;
  if (boats.riding) {
    toast('先下船，再放置另一艘船。');
    return true;
  }
  if (!target?.fluid || target.type !== 'water') {
    toast('对准水面右键放船。');
    return true;
  }
  const f = world.fluids.get(target.q, target.y, target.r),
    p = axialToWorld(target.q, target.r);
  if (!f || f.falling || world.fluids.get(target.q, target.y + 1, target.r)) {
    toast('需要一片开阔的水面。');
    return true;
  }
  const position = [p.x, target.y + fluidHeight(f), p.z];
  if (
    boats.blocked(world, ...position, null, true) ||
    (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 1.2 &&
      playerFeet() < position[1] + 0.4)
  ) {
    toast('空间不足，离岸边、其他船和自己稍远一点。');
    return true;
  }
  if (!boats.add(position, yaw)) {
    toast('这个维度的船太多了，先收回一些。');
    return true;
  }
  consumeUseItem('boat');
  soundFX.play('splash');
  useSwing();
  updateHUD();
  saveGame();
  toast('已放船 · 对准船右键乘坐 · Shift 右键收回');
  return true;
}
function attackBoat() {
  if (
    !boatTarget ||
    boatTarget.distance > 3.5 ||
    !boats.records.includes(boatTarget.boat)
  )
    return false;
  if (fauna.target(camera, boatTarget.distance)) return false;
  if (attackCooldown > 0) return true;
  attackCooldown = 0.45;
  attackPeriod = attackCooldown;
  if (!creative) survival.exhaust(0.1);
  boats.damage(
    boatTarget.boat,
    creative ? 20 : ITEMS[heldItem()]?.kind === 'axe' ? 7 : 4,
  );
  soundFX.play('break', 'wood');
  graphics.swing();
  wearItem(heldItem());
  mining = 0;
  saveGame();
  return true;
}
function useFishingRod() {
  if (useItem() !== 'fishingRod') return false;
  if (
    fishing.active &&
    validHandUse(fishingUse, 'fishingRod') &&
    fishingUse.hand !== actionHand
  )
    return withUseHand(fishingUse.hand, useFishingRod);
  if (!fishing.active || !validHandUse(fishingUse, 'fishingRod')) {
    fishing.clear();
    fishingUse = {
      hand: actionHand || 'main',
      ref: handRef(),
      stack: handStack(),
    };
  }
  fishing.act(world, camera, weather.rain);
  useSwing();
  saveGame();
  return true;
}
function wornElytra() {
  const stack = pack.gear[GEAR_SLOTS.indexOf('chest')];
  return ITEMS[stack?.item]?.glider ? stack : null;
}
function startGliding() {
  if (glider.active) return true;
  const stack = wornElytra();
  if (
    !playing ||
    overlay ||
    creative ||
    grounded ||
    boats.riding ||
    !stack ||
    wearValue(stack.wear) <= 1 ||
    survival.rank('levitation') ||
    playerFluidAt(playerFeet() + 0.12) ||
    onLadder()
  )
    return false;
  const eye = playerEyeHeight();
  glider.start(yaw, motion.x + motion.kickX, vy, motion.z + motion.kickZ);
  crouching = false;
  const change = playerEyeHeight() - eye;
  camera.position.y += change;
  graphics.stepOffset = (graphics.stepOffset || 0) + change;
  combat.reset();
  fishing.clear();
  motion.jumpBuffer = 0;
  soundFX.play('elytraOpen');
  return true;
}
function stopGliding() {
  if (!glider.active) return;
  vy = glider.vy;
  motion.x = glider.vx;
  motion.z = glider.vz;
  motion.kickX = motion.kickZ = motion.jumpBuffer = 0;
  glider.stop();
}
function jumpInput(now) {
  const twice = motion.pressJump(now);
  if (creative && twice && !boats.riding) {
    if (
      !creativeFlying &&
      collides(camera.position.x, playerFeet(), camera.position.z, 1.8)
    ) {
      toast('上方空间不足，先离开低顶再起飞。');
      return;
    }
    const feet = playerFeet(),
      eye = playerEyeHeight();
    creativeFlying = !creativeFlying;
    crouching = false;
    glider.lowProfile = false;
    camera.position.y = feet + playerEyeHeight();
    graphics.stepOffset = (graphics.stepOffset || 0) + playerEyeHeight() - eye;
    vy = motion.jumpBuffer = 0;
    grounded = false;
    toast(creativeFlying ? '创造飞行 · 空格上升，Shift 下降' : '已关闭飞行');
    updateHUD();
    return;
  }
  if (!startGliding()) motion.jump();
}
function pickBlock() {
  if (!playing || !target || !BLOCKS[target.type]) return;
  const original = isCaveVine(target.type)
      ? 'glowBerries'
      : target.type === 'powderSnow'
        ? 'powderSnowBucket'
        : isCauldron(target.type)
          ? 'cauldron'
          : circuitItem(doorLower(target.type)),
    id = ITEMS[original]?.internal ? null : original;
  if (!id) return;
  const from = pack.slots.findIndex((s) => s?.item === id);
  if (from >= 0 && from < 9) selected = from;
  else if (from >= 9) pack.choose(id, selected);
  else if (creative) pack.slots[selected] = { item: id, count: stackSize(id) };
  else return;
  updateHUD();
  saveGame();
}
function useRocket() {
  if (useItem() !== 'fireworkRocket') return false;
  if (rocketCooldown > 0) return true;
  if (glider.active) {
    if (!glider.rocket()) return true;
  } else {
    const point = target?.point
      ? target.point
          .clone()
          .addScaledVector(target.normal || new THREE.Vector3(0, 1, 0), 0.12)
      : camera.position
          .clone()
          .add(new THREE.Vector3(0, -playerEyeHeight() + 0.4, 0));
    flightEffects.launch(point);
  }
  consumeUseItem('fireworkRocket');
  rocketCooldown = glider.active ? 0.5 : 0.35;
  if (heldUseInput())
    throwHeldItem = {
      item: 'fireworkRocket',
      input: heldUseInput(),
      hand: actionHand || 'main',
    };
  useSwing();
  soundFX.play('rocket');
  updateHUD();
  saveGame();
  return true;
}
function updateFlightHUD() {
  const stack = wornElytra();
  flightStatus.classList.toggle(
    'hidden',
    !hasGame || (!stack && !glider.lowProfile),
  );
  if (!stack && !glider.lowProfile) return;
  const wear = stack ? wearValue(stack.wear) : 0;
  $('#flight-label').textContent = glider.active
    ? `滑翔 ${Math.round(glider.speed)} m/s · 耐久 ${wear}/432 · 烟花右键助推`
    : creative
      ? '创造飞行 · 空格上升 / Shift 下降'
      : survival.rank('levitation')
        ? '漂浮中 · 牛奶可解除，效果结束后可展开鞘翅'
        : glider.lowProfile
          ? '低姿态移动 · 到开阔处自动站起'
          : wear <= 1
            ? '鞘翅已破损 · 用幻翼膜在铁砧修复'
            : `鞘翅 ${wear}/432 · 跳起后再次按空格展开`;
  $('#flight-boost').value = glider.boost;
  $('#flight-boost').classList.toggle(
    'hidden',
    !glider.active || glider.boost <= 0,
  );
}
function useEndGateway(q, r) {
  if (dimension !== 'end' || !dragonFight.state?.victories) {
    toast('击败末影龙后，折跃门才会回应。');
    return;
  }
  const source = END_GATEWAYS.findIndex((g) => g.q === q && g.r === r);
  if (source < 0) return;
  const destination = END_GATEWAYS[1 - source];
  const origin = worldToAxial(camera.position.x, camera.position.z);
  world.ensureAround(destination.q, destination.r);
  let landing = null;
  for (const [dq, dr] of [[-1, 0], ...DIRECTIONS]) {
    const a = destination.q + dq,
      b = destination.r + dr,
      p = axialToWorld(a, b);
    const floor = findFloor(world, p.x, p.z, world.surface(a, b), {
      step: 1,
      drop: 5,
    });
    if (floor !== null && !collides(p.x, floor + 0.01, p.z, 1.8)) {
      landing = { ...p, y: floor };
      break;
    }
  }
  if (!landing) {
    world.ensureAround(origin.q, origin.r);
    toast('另一侧出口被挡住了，清理后再试。');
    return;
  }
  boats.riding = null;
  fishing.clear();
  stopEating(true);
  combat.reset();
  glider.reset();
  motion.reset();
  flightEffects.clear();
  projectiles.clear();
  throwables.clear();
  fireballs.clear();
  shulkerBullets.clear();
  dragonFight.clearAttacks();
  camera.position.set(landing.x, landing.y + 1.66, landing.z);
  vy = 0;
  grounded = false;
  mining = 0;
  cancelBow();
  leftDown = false;
  target = creatureTarget = villagerTarget = boatTarget = null;
  graphics.stepOffset = 0;
  const a = worldToAxial(landing.x, landing.z);
  graphics.sync(a.q, a.r, true);
  fauna.sync(camera);
  syncDecor();
  damageCooldown = 2;
  $('#travel span').textContent = source === 0 ? '外圈浮岛' : '中央祭坛';
  $('#travel').classList.add('active');
  setTimeout(() => $('#travel').classList.remove('active'), 900);
  soundFX.play('portal');
  toast(
    source === 0
      ? '外圈浮岛 · 梯子通往末地船，船头连桥通向 Q 66 / R −16 的末地城。'
      : '已回到中央祭坛。',
  );
  saveGame();
}
function useEndCrystal() {
  if (useItem() !== 'endCrystal') return false;
  if (
    dimension !== 'end' ||
    !target ||
    hexDistance(target.q, target.r) > 1 ||
    !['bedrock', 'dragonEgg'].includes(target.type) ||
    Math.hypot(camera.position.x, camera.position.z) > 6
  ) {
    toast('末地水晶用于再次召唤末影龙：带六颗水晶，对准末地中央基岩祭坛右键。');
    return true;
  }
  if (dragonFight.state?.mode !== 'dead') {
    toast('先击败守护这片末地的末影龙。');
    return true;
  }
  const crystals =
    (inventory.endCrystal || 0) +
    (actionHand === 'offhand' ? useCount('endCrystal') : 0);
  if (!creative && crystals < 6) {
    toast('需要六颗末地水晶，分别唤醒六座晶柱。');
    return true;
  }
  if (dragonFight.summon(camera)) {
    if (!creative) {
      const used = Math.min(6, useCount('endCrystal'));
      consumeUseItem('endCrystal', used);
      pack.consume('endCrystal', 6 - used);
    }
    useSwing();
    updateHUD();
    saveGame();
  }
  return true;
}
function rebuildEndArena() {
  world.ensureAround(0, 0);
  const chunks = new Set(['0,0', '-1,0', '0,-1', '-1,-1']);
  for (const p of END_PILLARS)
    for (let q = p.q - 1; q <= p.q + 1; q++)
      for (let r = p.r - 1; r <= p.r + 1; r++)
        chunks.add(graphics.chunkKey(q, r));
  for (const chunk of chunks) {
    const [q, r] = chunk.split(',').map(Number);
    stampEndArena(world, q, r, true);
    if (graphics.chunks.has(chunk)) graphics.buildChunk(chunk);
  }
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
}
function dragonVictory(first) {
  awardXP(first ? 12000 : 500, [0, END_FLOOR + 0.8, 0]);
  if (first) {
    const old = world.get(0, END_FLOOR, 0);
    if (!old) {
      world.set(0, END_FLOOR, 0, 'dragonEgg', false);
      if (collides(camera.position.x, playerFeet(), camera.position.z)) {
        world.set(0, END_FLOOR, 0, null, false);
        drops.spawn('dragonEgg', 1, [0, END_FLOOR + 1, 0]);
      } else world.set(0, END_FLOOR, 0, 'dragonEgg');
      graphics.updateBlock(0, END_FLOOR, 0);
    } else drops.spawn('dragonEgg', 1, [0, END_FLOOR + 1, 0]);
  }
  if (!world.get(1, END_FLOOR, 0)) {
    world.set(1, END_FLOOR, 0, 'endportal');
    graphics.updateBlock(1, END_FLOOR, 0);
  }
  toast(
    first
      ? '解放末地！中央留下龙蛋与 12000 点经验。六颗末地水晶可以再次召唤它。'
      : '末影龙再次倒下，中央留下 500 点经验。',
  );
  saveGame();
}
function updateBossHUD() {
  const state = dragonFight.state;
  const visible = dragonFight.active && state && state.mode !== 'dead';
  bossPanel.classList.toggle('hidden', !visible);
  if (!visible) return;
  $('#boss-name').textContent = dragonFight.label;
  $('#boss-health').value = state.hp;
  bossPanel
    .querySelectorAll('[data-boss-crystal]')
    .forEach((node) =>
      node.classList.toggle(
        'broken',
        state.broken[Number(node.dataset.bossCrystal)],
      ),
    );
}
function useThrowable() {
  const item = useItem();
  if (!THROWABLES[item]) return false;
  if (combat.raised || foodUse || !throwables.ready(item)) return true;
  if (!handStack()?.count) return true;
  const inherited = boats.riding
    ? new THREE.Vector3(boats.riding.vx, 0, boats.riding.vz)
    : new THREE.Vector3(
        motion.x,
        grounded ? 0 : Math.max(-8, Math.min(8, vy)),
        motion.z,
      );
  if (
    !throwables.shoot(
      item,
      camera.position,
      camera.getWorldDirection(new THREE.Vector3()),
      inherited,
    )
  ) {
    toast('空中的投掷物太多了，稍等片刻。');
    return true;
  }
  consumeUseItem(item);
  if (heldUseInput())
    throwHeldItem = { item, input: heldUseInput(), hand: actionHand || 'main' };
  mining = 0;
  cancelBow();
  useSwing();
  soundFX.play('throw');
  updateHUD();
  saveGame();
  return true;
}
function resolveThrow(impact) {
  const { item, point, mob, direction, owner } = impact;
  if (mob?.bossType === 'shulkerBullet') shulkerBullets.hit(mob);
  if (mob?.bossType === 'crystal') {
    const owner = survival;
    dragonFight.hit(mob, 1, 'thrown', 'crystal');
    if (owner !== survival) return;
  }
  if (item === 'pearl') {
    const destination = pearlDestination(world, impact, (x, y, z) =>
      collides(x, y, z, 1.8),
    );
    if (!destination) {
      toast('珍珠破碎了，但落点没有足够的容身空间。');
      return;
    }
    const origin = camera.position.clone().add(new THREE.Vector3(0, -0.65, 0));
    boats.riding = null;
    boatTarget = creatureTarget = villagerTarget = target = null;
    fishing.clear();
    stopEating(true);
    glider.reset();
    flightEffects.clear();
    shulkerBullets.clear();
    combat.reset();
    motion.reset();
    vy = 0;
    grounded = false;
    leftDown = false;
    mining = 0;
    cancelBow();
    camera.position.copy(destination);
    camera.position.y += 1.65;
    const a = worldToAxial(destination.x, destination.z);
    graphics.sync(a.q, a.r, true);
    throwables.burst(origin, 'pearl', 22);
    throwables.burst(
      destination.clone().add(new THREE.Vector3(0, 0.8, 0)),
      'pearl',
      22,
    );
    soundFX.play('pearlTeleport');
    toast(
      creative
        ? '珍珠传送！'
        : '珍珠传送 · 消耗 5 生命，可受保护附魔和吸收生命减免',
    );
    // Pearl damage is its own cost and cannot be skipped by recent damage.
    damageCooldown = 0;
    hurt(5, 'pearl');
    updateHUD();
    saveGame();
    return;
  }
  soundFX.play(item === 'snowball' ? 'snowImpact' : 'eggImpact');
  if (mob && fauna.active.includes(mob)) {
    if (item === 'snowball' && mob.kind === 'blaze')
      hitMob(mob, 3, direction, 'thrown', 'body', 0, owner !== 'dispenser');
    else fauna.nudge(mob, direction);
  }
  if (item === 'egg' && Math.random() < 1 / 8) {
    const count = Math.random() < 1 / 32 ? 4 : 1;
    const spawned = fauna.hatch(
      point.clone().addScaledVector(impact.normal, 0.4),
      count,
    );
    if (spawned) {
      toast(
        spawned === 1
          ? '蛋壳裂开，一只小鸡探出头来！'
          : `一颗蛋孵出了 ${spawned} 只小鸡！`,
      );
      saveGame();
    }
  }
}
function stripLog() {
  const held = useItem(),
    next = BLOCKS[target?.type]?.stripped;
  if (
    !next ||
    ITEMS[held]?.kind !== 'axe' ||
    target?.fluid ||
    target?.crop ||
    creatureTarget ||
    villagerTarget ||
    boatTarget
  )
    return false;
  const { q, y, r } = target,
    previous = world.state(q, y, r);
  world.set(q, y, r, next);
  world.setState(q, y, r, { ...previous, axis: previous.axis ?? 0 });
  wearUseItem(held);
  graphics.updateBlock(q, y, r);
  graphics.burst(q, y, r, BLOCKS[next].color);
  useSwing();
  soundFX.play('strip');
  mining = 0;
  miningKey = '';
  updateHUD();
  saveGame();
  toast(
    '已去皮 · ' +
      BLOCKS[next].name +
      ' · 保留' +
      pillarAxisLabel(previous.axis),
  );
  return true;
}
function useCircuitControl() {
  if (
    target &&
    ['lever', 'stoneButton', 'repeater', 'comparator'].includes(target.type) &&
    !keys.has('ShiftLeft') &&
    !keys.has('ShiftRight')
  ) {
    if (world.redstone.activate(target.q, target.y, target.r)) {
      graphics.updateBlock(target.q, target.y, target.r);
      useSwing();
      soundFX.play('place', 'stone');
      saveGame();
    }
    return true;
  }
  return false;
}
function useCavePlant() {
  if (!target || creatureTarget || villagerTarget) return false;
  const { q, y, r, type } = target;
  if (
    type === 'caveVinesBerries' &&
    !keys.has('ShiftLeft') &&
    !keys.has('ShiftRight')
  ) {
    applyPlantChanges(harvestCavePlant(world, q, y, r, true));
    soundFX.play('plant');
    useSwing();
    return true;
  }
  if (useItem() === 'boneMeal' && isCaveVine(type)) {
    if (type === 'caveVines' && (creative || useCount('boneMeal') > 0)) {
      world.set(q, y, r, 'caveVinesBerries');
      graphics.updateBlock(q, y, r);
      consumeUseItem('boneMeal');
      useSwing();
      updateHUD();
    }
    return true;
  }
  if (useItem() !== 'glowBerries' || target.normal?.y >= -0.5) return false;
  const p = target.place;
  if (!p || !canHang(world, p.q, p.y, p.r, true)) return false;
  if (
    !world.get(p.q, p.y, p.r) &&
    !world.fluids.get(p.q, p.y, p.r) &&
    (creative || useCount('glowBerries') > 0)
  ) {
    world.set(p.q, p.y, p.r, 'caveVines');
    graphics.updateBlock(p.q, p.y, p.r);
    consumeUseItem('glowBerries');
    useSwing();
    updateHUD();
  }
  return true;
}
function place() {
  if (!playing) return;
  if (!actionHand) return beginUse(place);
  if (combat.raised) return;
  if (foodUse) stopEating();
  if (boatTarget && !creatureTarget && !villagerTarget && interactBoat())
    return;
  if (useEndCrystal() || useCircuitControl() || useCavePlant() || useCauldron())
    return;
  if (
    target &&
    isOpenable(target.type) &&
    !keys.has('ShiftLeft') &&
    !keys.has('ShiftRight')
  ) {
    toggleBuilding(target.q, target.y, target.r);
    return;
  }
  if (
    !keys.has('ShiftLeft') &&
    !keys.has('ShiftRight') &&
    (villagerTarget ||
      target?.crop ||
      (target &&
        [
          'workbench',
          ...Object.keys(FURNACES),
          'stonecutter',
          'brewingStand',
          'campfire',
          'soulCampfire',
          'enchantingTable',
          ...ANVILS,
          'grindstone',
          'chest',
          'shulkerBox',
          'hopper',
          'dropper',
          'dispenser',
          'bed',
          'portal',
          'endportal',
          'endGateway',
        ].includes(target.type)))
  ) {
    interact(true);
    return;
  }
  if (useBow() || useFishingRod() || useBoatItem()) return;
  if (useIgniter()) return;
  if (interactCreature()) return;
  if (stripLog()) return;
  if (useRocket()) return;
  if (useThrowable()) return;
  if (useGlassBottle()) return;
  if (useItem() === 'boneMeal' && target) {
    interact();
    return;
  }
  if (
    plantForItem(useItem()) &&
    target &&
    (!FOODS[useItem()] || canPlantHere(useItem()))
  ) {
    interact();
    return;
  }
  if (FOODS[useItem()]) {
    eat(heldUseInput() || 'tap');
    return;
  }
  if (useBucket()) return;
  if (actionHand === 'offhand' && useItem() === 'shield') return;
  if (useItem() === 'redstone' && target) {
    placeBuilding('redstoneWire', target.place);
    return;
  }
  if (!target || !BLOCKS[useItem()]) return;
  if (useItem() === 'pointedDripstone' && target.type === 'pointedDripstone') {
    const direction = world.state(target.q, target.y, target.r).upper ? -1 : 1;
    placeBuilding('pointedDripstone', {
      q: target.q,
      y: target.y + direction,
      r: target.r,
    });
    return;
  }
  if (BLOCKS[useItem()].shape === 'slab' && target.type === useItem()) {
    const state = world.state(target.q, target.y, target.r);
    if (
      !state.double &&
      ((state.upper && target.normal?.y < -0.5) ||
        (!state.upper && target.normal?.y > 0.5))
    ) {
      mergeSlab(target.q, target.y, target.r, useItem());
      return;
    }
  }
  if (BLOCKS[useItem()].shape) {
    placeBuilding(useItem(), target.place);
    return;
  }
  const { q, y, r } = target.place,
    id = useItem();
  if (y < 1 || y >= WORLD_HEIGHT) {
    toast('建造高度为 1–63 格，水平方向可以一直探索。');
    return;
  }
  if (world.get(q, y, r)) return;
  if (!creative && useCount(id) <= 0) {
    toast(`背包里没有${ITEMS[id].name}，先采集或合成吧。`);
    return;
  }
  const boatCell = axialToWorld(q, r);
  if (boats.intersectsCell(boatCell.x, y, boatCell.z)) {
    toast('这里有船，先把船移开。');
    return;
  }
  world.set(q, y, r, id, false);
  if (collides(camera.position.x, playerFeet(), camera.position.z)) {
    world.set(q, y, r, null, false);
    toast('这里会挡住你，换个位置试试。');
    return;
  }
  world.set(q, y, r, id);
  if (BLOCKS[id].foliage) world.keepLeaf(q, y, r);
  if (BLOCKS[id].pillar)
    world.setState(q, y, r, {
      facing: 0,
      open: false,
      axis: pillarAxis(target.normal),
    });
  if (
    isFurnace(id) ||
    isStorage(id) ||
    id === 'brewingStand' ||
    isSmithingStation(id)
  ) {
    const center = axialToWorld(q, r);
    world.setState(q, y, r, {
      facing: facingFromDirection(
        camera.position.x - center.x,
        camera.position.z - center.z,
      ),
      open: false,
    });
  }
  const cropBelow = key(q, y - 1, r);
  if (crops.has(cropBelow)) {
    harvestPlant(cropBelow, true, 2);
  }
  const stored = ITEMS[id]?.portable
    ? structuredClone(handStack()?.contents || newChest())
    : null;
  consumeUseItem(id);
  graphics.updateBlock(q, y, r);
  if (isStorage(id)) chests.set(key(q, y, r), stored || newChest());
  rememberBlockUse(id);
  soundFX.play('place', id);
  useSwing();
  updateHUD();
}
function fullSupport(q, y, r, top = false) {
  const type = world.get(q, y, r);
  if (isTrapdoor(type)) {
    const state = world.state(q, y, r);
    return top && state.upper && !state.open;
  }
  if (['slab', 'stairs'].includes(BLOCKS[type]?.shape)) {
    const state = world.state(q, y, r);
    return !!state.double || (top && !!state.upper);
  }
  return (
    !!type &&
    !BLOCKS[type].nonSolid &&
    (!BLOCKS[type].shape || BLOCKS[type]?.shape === 'dropper')
  );
}
function mergeSlab(q, y, r, type) {
  const old = world.state(q, y, r);
  if (old.double || (!creative && !(useCount(type) > 0))) return;
  world.setState(q, y, r, { ...old, double: true });
  if (
    collides(camera.position.x, playerFeet(), camera.position.z) ||
    buildingOccupied(q, y, r)
  ) {
    world.setState(q, y, r, old);
    toast('补全半砖会挡住你，先退开一点。');
    return;
  }
  consumeUseItem(type);
  rememberBlockUse(type);
  graphics.updateBlock(q, y, r);
  soundFX.play('place', BLOCKS[type].base);
  useSwing();
  updateHUD();
}
function buildingOccupied(q, y, r) {
  const center = axialToWorld(q, r);
  return [...creatures, ...villagers.residents.values()].some((mob) => {
    const p = mob.mesh.position,
      size = mob.baby ? 0.55 : 1;
    const height = (MOBS[mob.kind]?.height || 1.9) * size,
      radius = 0.3 * size;
    if (
      Math.hypot(p.x - center.x, p.z - center.z) > 3 ||
      p.y > y + 2 ||
      p.y + height < y
    )
      return false;
    return [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ].some(([dx, dz]) =>
      world.columnSolid(p.x + dx, p.z + dz, p.y + 0.03, p.y + height - 0.03),
    );
  });
}
function placeBuilding(type, p) {
  const { q, y, r } = p;
  const item = circuitItem(type);
  if (
    type === 'sporeBlossom' &&
    (target.normal?.y >= -0.5 || !canHang(world, q, y, r))
  ) {
    toast('孢子花需要悬挂在完整方块的底面。');
    return;
  }
  if (y < 1 || y >= 63 || (!creative && !(useCount(item) > 0))) return;
  const cut = ['slab', 'stairs', 'trapdoor'].includes(BLOCKS[type].shape);
  const upper =
    type === 'pointedDripstone'
      ? target.type === type
        ? !!world.state(target.q, target.y, target.r).upper
        : target.normal?.y < -0.5
      : cut &&
        (target.normal?.y < -0.5 ||
          (Math.abs(target.normal?.y || 0) < 0.5 &&
            (target.hitHeight ?? 0) > 0.5));
  if (
    type === 'pointedDripstone' &&
    (!pointedSupport(world, q, y, r, upper) ||
      (target.type !== type && Math.abs(target.normal?.y || 0) < 0.5))
  ) {
    toast('滴水石锥需要放在完整顶面、底面或同向尖锥上。');
    return;
  }
  if (BLOCKS[type].shape === 'slab' && world.get(q, y, r) === type) {
    const old = world.state(q, y, r);
    if (!old.double && !!old.upper !== !!upper) mergeSlab(q, y, r, type);
    return;
  }
  let facing = facingFromDirection(-Math.sin(yaw), -Math.cos(yaw));
  if (BLOCKS[type]?.shape === 'dropper') {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    facing = facingFromDirection(-direction.x, -direction.z);
    const p = axialToWorld(...DIRECTIONS[facing]),
      horizontal = -(p.x * direction.x + p.z * direction.z) / Math.sqrt(3);
    if (Math.abs(direction.y) > horizontal) facing = direction.y > 0 ? 6 : 7;
  }
  let mount;
  if (
    CIRCUIT_BLOCKS[type]?.shape &&
    !['hopper', 'dropper', 'dispenser'].includes(type)
  ) {
    const control = ['lever', 'stoneButton', 'redstoneTorch'].includes(type);
    if (type === 'redstoneTorch' && target.normal?.y < -0.5) {
      toast('红石火把需要地面或墙面支撑。');
      return;
    }
    mount =
      control && target.normal?.y < -0.5
        ? 'ceiling'
        : control && Math.abs(target.normal?.y ?? 1) < 0.5
          ? 'wall'
          : 'floor';
    if (mount === 'wall')
      facing = facingFromDirection(-target.normal.x, -target.normal.z);
    const support = attachmentCell(q, y, r, { facing, mount }, DIRECTIONS);
    if (!fullSupport(...support, mount === 'floor')) {
      toast('红石元件需要完整的支撑面；红石线与压力板放在顶面。');
      return;
    }
  }
  if (type === 'hopper' && Math.abs(target.normal?.y ?? 1) < 0.5)
    facing = facingFromDirection(-target.normal.x, -target.normal.z);
  if (isTrapdoor(type) && Math.abs(target.normal?.y ?? 1) < 0.5)
    facing = facingFromDirection(-target.normal.x, -target.normal.z);
  if (type === 'chorusFlower') {
    if (!['endstone', 'chorusPlant'].includes(world.get(q, y - 1, r))) {
      toast('紫颂花需要末地石或紫颂枝干支撑。');
      return;
    }
    if (world.chorus.size >= 4096) {
      toast('附近已种下很多紫颂花，先等待一些长成。');
      return;
    }
  }
  if (doorUpper(type) && !fullSupport(q, y - 1, r, true)) {
    toast('门需要放在实心地面上。');
    return;
  }
  if (type === 'ladder') {
    const matches = DIRECTIONS.map(([dq, dr], i) => ({
      i,
      q: q + dq,
      r: r + dr,
    })).filter((a) => fullSupport(a.q, y, a.r));
    const back =
      matches.find((a) => a.q === target.q && a.r === target.r) ||
      matches.find((a) => a.i === facing) ||
      matches[0];
    if (!back) {
      toast('梯子需要贴在实心墙面。');
      return;
    }
    facing = back.i;
  }
  const cells = doorUpper(type)
    ? [
        [q, y, r, type],
        [q, y + 1, r, doorUpper(type)],
      ]
    : [[q, y, r, type]];
  if (
    cells.some(
      ([a, b, c]) => world.get(a, b, c) || world.fluids.get(a, b, c),
    ) ||
    ((isFence(type) || isGate(type)) &&
      (world.get(q, y + 1, r) || world.fluids.get(q, y + 1, r)))
  ) {
    toast('这里没有足够的建造空间。');
    return;
  }
  if (
    cells.some(([q, y, r]) => {
      const p = axialToWorld(q, r);
      return boats.intersectsCell(p.x, y, p.z);
    })
  ) {
    toast('这里有船，先把船移开。');
    return;
  }
  for (const [a, b, c, t] of cells) world.set(a, b, c, t, false);
  world.setState(q, y, r, {
    facing,
    open: false,
    upper,
    double: false,
    ...(mount ? { mount } : {}),
    ...(type === 'redstoneTorch' ? { powered: true } : {}),
    ...(type === 'repeater' ? { delay: 1, powered: false } : {}),
    ...(type === 'comparator' ? { output: 0, subtract: false } : {}),
    ...(BLOCKS[type]?.shape === 'dropper' ? { powered: false } : {}),
    ...(type === 'hopper'
      ? { down: Math.abs(target.normal?.y ?? 1) > 0.5, powered: false }
      : {}),
  });
  if (
    collides(camera.position.x, playerFeet(), camera.position.z) ||
    buildingOccupied(q, y, r)
  ) {
    for (const [a, b, c] of cells) world.set(a, b, c, null, false);
    world.blockStates.delete(key(q, y, r));
    toast('这里会挡住你，退开一点再放置。');
    return;
  }
  for (const [a, b, c, t] of cells) world.set(a, b, c, t);
  if (['hopper', 'dropper', 'dispenser'].includes(type))
    blockSlots(world, q, y, r);
  if (type === 'chorusFlower')
    world.chorus.set(key(q, y, r), { stage: 0, time: 0 });
  if (crops.has(key(q, y - 1, r))) harvestPlant(key(q, y - 1, r), true, 3);
  consumeUseItem(item);
  rememberBlockUse(item);
  graphics.updateBlock(q, y, r);
  useSwing();
  soundFX.play('place', BLOCKS[type].base || 'wood');
  updateHUD();
}
function removeBuilding(q, y, r, drop = true) {
  const original = world.get(q, y, r);
  if (isHangingPlant(original)) {
    graphics.blockBreak({ q, y, r, type: original });
    applyPlantChanges(harvestCavePlant(world, q, y, r), drop);
    soundFX.play('break', 'leaves');
    return;
  }
  if (isChorus(original)) {
    harvestChorusBlock(q, y, r, false, drop);
    return;
  }
  if (!BLOCKS[original]?.shape) return;
  if (isDoorTop(original) && world.get(q, y - 1, r) === doorLower(original))
    y--;
  const type = world.get(q, y, r),
    item = BLOCKS[type].drop || circuitItem(doorLower(type));
  const count =
    BLOCKS[type]?.shape === 'slab' && world.state(q, y, r).double ? 2 : 1;
  graphics.blockBreak({ q, y, r, type });
  if (doorUpper(type) && world.get(q, y + 1, r) === doorUpper(type))
    graphics.blockBreak({ q, y: y + 1, r, type: doorUpper(type) });
  if (isCampfire(type) && !creative) {
    for (const slot of world.campfires.get(key(q, y, r))?.slots || [])
      if (slot) dropAt(slot.item, 1, q, y, r);
  }
  if (['hopper', 'dropper', 'dispenser'].includes(type))
    spillChest(key(q, y, r));
  world.set(q, y, r, null);
  if (doorUpper(type) && world.get(q, y + 1, r) === doorUpper(type))
    world.set(q, y + 1, r, null);
  graphics.updateBlock(q, y, r);
  if (drop)
    dropAt(
      isCampfire(type) ? (type === 'campfire' ? 'charcoal' : 'soulSand') : item,
      type === 'campfire' ? 2 : count,
      q,
      y,
      r,
    );
  soundFX.play('break', BLOCKS[type]?.base || type);
}
function toggleBuilding(q, y, r, open = null) {
  if (isDoorTop(world.get(q, y, r))) y--;
  if (!isOpenable(world.get(q, y, r))) return false;
  const old = world.state(q, y, r),
    next = { ...old, open: open ?? !old.open };
  if (next.open === old.open) return true;
  world.setState(q, y, r, next);
  const center = axialToWorld(q, r);
  const blocked =
    collides(camera.position.x, playerFeet(), camera.position.z) ||
    buildingOccupied(q, y, r) ||
    (isTrapdoor(world.get(q, y, r)) &&
      boats.intersectsCell(center.x, y, center.z));
  if (blocked) {
    world.setState(q, y, r, old);
    if (open === null) toast('开合空间内有玩家、动物或船，先让出空间。');
    return false;
  }
  graphics.updateBlock(q, y, r);
  if (open === null) graphics.swing();
  soundFX.play(next.open ? 'doorOpen' : 'doorClose', 'wood');
  if (isTrapdoor(world.get(q, y, r))) maintainBuildings();
  if (open === null) saveGame();
  return true;
}
function maintainBuildings() {
  for (const k of [...world.buildings]) {
    const [q, y, r] = k.split(',').map(Number),
      type = world.get(q, y, r);
    if (
      doorUpper(type) &&
      (!fullSupport(q, y - 1, r, true) ||
        world.get(q, y + 1, r) !== doorUpper(type))
    )
      removeBuilding(q, y, r);
    else if (isDoorTop(type) && world.get(q, y - 1, r) !== doorLower(type))
      removeBuilding(q, y, r);
    else if (type === 'ladder') {
      const [dq, dr] = DIRECTIONS[world.state(q, y, r).facing];
      if (!world.loaded(q + dq, r + dr)) continue;
      if (!fullSupport(q + dq, y, r + dr)) removeBuilding(q, y, r);
    } else if (
      CIRCUIT_BLOCKS[type]?.shape &&
      !['hopper', 'dropper', 'dispenser'].includes(type)
    ) {
      const state = world.state(q, y, r),
        support = attachmentCell(q, y, r, state, DIRECTIONS);
      if (!world.loaded(support[0], support[2])) continue;
      if (
        !fullSupport(...support, !state.mount || state.mount === 'floor') ||
        world.fluids.get(q, y, r)
      )
        removeBuilding(q, y, r);
    }
  }
}
function fertilizePlant(k) {
  const plant = crops.get(k);
  if (!plant) return false;
  const def = PLANTS[plant.kind],
    [q, y, r] = k.split(',').map(Number);
  if (def.infernal) return false;
  if (def.tree) return growTree(k);
  if (plant.age >= def.seconds || plantingIssue(world, plant.kind, q, y, r))
    return false;
  plant.age = def.seconds;
  graphics.crop(k, plant);
  return true;
}
function fireDispenser(q, y, r) {
  const source = dispensingSource(world, q, y, r);
  if (!source) return false;
  const {
      slot,
      target: [a, b, c],
    } = source,
    stack = slot.get(),
    id = stack.item,
    point = new THREE.Vector3(...source.position),
    direction = new THREE.Vector3(...source.direction),
    type = world.get(a, b, c);
  const consume = () => takeSlot(slot, 1);
  const wear = () => {
    if (wearStack(slot.get(), 1)) slot.set(null);
  };
  const finishLiquid = (item, snow = false) => {
    replaceDispensed(world, source, item, drops);
    if (snow) graphics.updateCells([[a, b, c]]);
    flushFluidChanges();
    updateCampfires(0);
    refreshNetherPortals();
    graphics.fluidRenderer.sync(world, new Set(graphics.chunks.keys()), true);
    soundFX.play('splash');
    return true;
  };
  if (ARROW_ITEMS[id]) {
    const aim = direction
      .clone()
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05 + 0.03,
          (Math.random() - 0.5) * 0.05,
        ),
      )
      .normalize();
    projectiles.shoot(point, aim, 1, true, 'dispenser', 1, { item: id });
    consume();
    return true;
  }
  if (id === 'egg' || id === 'snowball') {
    const aim = direction
      .clone()
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05 + 0.03,
          (Math.random() - 0.5) * 0.05,
        ),
      )
      .normalize();
    if (!throwables.spawn(id, point, aim, null, 'dispenser')) return false;
    consume();
    return true;
  }
  if (id === 'fireworkRocket') {
    flightEffects.launch(point, direction);
    consume();
    soundFX.play('rocket');
    return true;
  }
  const kind = ITEMS[id]?.bucket;
  if (kind === 'empty') {
    if (type === 'powderSnow') {
      world.set(a, b, c, null);
      return finishLiquid('powderSnowBucket', true);
    }
    const liquid = world.fluids.scoop(a, b, c);
    if (liquid) return finishLiquid(LIQUIDS[liquid].bucket);
  } else if (kind === 'powderSnow') {
    if (!type && !world.fluids.get(a, b, c) && b >= 1 && b < WORLD_HEIGHT) {
      world.set(a, b, c, 'powderSnow');
      return finishLiquid('bucket', true);
    }
  } else if (LIQUIDS[kind] && world.fluids.source(a, b, c, kind))
    return finishLiquid('bucket');
  if (id === 'glassBottle') {
    const f = world.fluids.get(a, b, c);
    if (f?.type === 'water' && f.source) {
      replaceDispensed(world, source, 'waterBottle', drops);
      soundFX.play('splash');
      return true;
    }
  }
  if (id === 'boneMeal') {
    if (type === 'caveVines') {
      world.set(a, b, c, 'caveVinesBerries');
      graphics.updateCells([[a, b, c]]);
    } else if (!fertilizePlant(key(a, b - 1, c))) return false;
    consume();
    graphics.burst(a, b, c, '#a8cf75');
    return true;
  }
  if (id === 'flintAndSteel') {
    if (isCampfire(type)) {
      if (!setCampfireLit(world, key(a, b, c), true)) return false;
      graphics.updateLight(a, b, c);
    } else {
      if (dimension === 'end') return false;
      const frame = findNetherFrame(world, a, b, c);
      if (!frame || frame.cells.every((p) => world.get(...p) === 'portal'))
        return false;
      graphics.updateCells(lightNetherFrame(world, frame));
    }
    wear();
    soundFX.play('campfireIgnite');
    return true;
  }
  if (id === 'shears') {
    const mob = fauna.active.find(
      (m) =>
        m.kind === 'sheep' &&
        !m.baby &&
        m.wool <= 0 &&
        worldToAxial(m.mesh.position.x, m.mesh.position.z).q === a &&
        worldToAxial(m.mesh.position.x, m.mesh.position.z).r === c &&
        m.mesh.position.y < b + 1 &&
        m.mesh.position.y + MOBS[m.kind].height > b,
    );
    if (!mob) return false;
    const action = fauna.interact(mob, 'shears');
    for (const [item, count] of Object.entries(action.give))
      dropAt(item, count, a, b, c);
    wear();
    return true;
  }
  if (ITEMS[id]?.armorSlot) {
    const index = GEAR_SLOTS.indexOf(ITEMS[id].armorSlot),
      p = worldToAxial(camera.position.x, camera.position.z);
    if (
      index >= 0 &&
      !pack.gear[index] &&
      p.q === a &&
      p.r === c &&
      playerFeet() < b + 1 &&
      playerFeet() + playerHeight() > b
    ) {
      pack.gear[index] = consume();
      updateHUD();
      return true;
    }
  }
  if (ITEMS[id]?.portable) {
    if (type || world.fluids.get(a, b, c) || b < 1 || b >= WORLD_HEIGHT)
      return false;
    const p = axialToWorld(a, c);
    world.set(a, b, c, id, false);
    const blocked =
      collides(camera.position.x, playerFeet(), camera.position.z) ||
      buildingOccupied(a, b, c) ||
      boats.intersectsCell(p.x, b, p.z);
    world.set(a, b, c, null, false);
    if (blocked) return false;
    const packed = consume();
    world.set(a, b, c, id);
    world.setState(a, b, c, {
      facing: world.state(q, y, r).facing % 6,
      open: false,
    });
    world.chests.set(
      key(a, b, c),
      structuredClone(packed.contents || newChest()),
    );
    graphics.updateCells([[a, b, c]]);
    return true;
  }
  if (id === 'boat') {
    let level = b,
      fluid = world.fluids.get(a, b, c);
    if (!fluid && !type) {
      level--;
      fluid = world.fluids.get(a, level, c);
    }
    if (
      fluid?.type === 'water' &&
      !fluid.falling &&
      !world.fluids.get(a, level + 1, c)
    ) {
      const p = axialToWorld(a, c),
        position = [p.x, level + fluidHeight(fluid), p.z];
      if (boats.blocked(world, ...position, null, true)) return false;
      if (!boats.add(position, Math.atan2(direction.x, direction.z)))
        return false;
      consume();
      soundFX.play('splash');
      return true;
    }
  }
  ejectStack(world, drops, consume(), source.position, source.direction);
  return true;
}

function updateRedstone(dt) {
  if (!world.circuitCells.size) return [];
  const actors = [
    {
      x: camera.position.x,
      y: playerFeet(),
      z: camera.position.z,
      radius: 0.24,
    },
    ...[...creatures, ...villagers.residents.values()].map((mob) => ({
      x: mob.mesh.position.x,
      y: mob.mesh.position.y,
      z: mob.mesh.position.z,
      radius: mob.baby ? 0.16 : 0.3,
    })),
  ];
  const changed = world.redstone.tick(dt, actors, toggleBuilding, (q, y, r) => {
    const fired =
        world.get(q, y, r) === 'dispenser'
          ? fireDispenser(q, y, r)
          : fireDropper(world, q, y, r, drops),
      p = axialToWorld(q, r);
    if (
      Math.hypot(
        p.x - camera.position.x,
        y + 0.5 - camera.position.y,
        p.z - camera.position.z,
      ) < 12
    )
      beep(fired ? 180 : 100, 0.035, 'square');
  });
  world.hoppers.tick(dt, drops);
  return changed;
}
function endermanBlockChange(q, y, r, type) {
  const k = key(q, y, r),
    previous = world.get(q, y, r);
  if (crops.has(k) || crops.has(key(q, y - 1, r))) return false;
  const point = axialToWorld(q, r);
  if (
    type &&
    (boats.intersectsCell(point.x, y, point.z) ||
      [...villagers.residents.values()].some(
        (n) =>
          Math.hypot(n.mesh.position.x - point.x, n.mesh.position.z - point.z) <
            1.3 &&
          y < n.mesh.position.y + 1.9 &&
          y + 1 > n.mesh.position.y,
      ))
  )
    return false;
  world.set(q, y, r, type, false);
  if (type && collides(camera.position.x, playerFeet(), camera.position.z)) {
    world.set(q, y, r, previous, false);
    return false;
  }
  world.set(q, y, r, type);
  graphics.updateBlock(q, y, r);
  maintainBuildings();
  if (Math.hypot(point.x - camera.position.x, point.z - camera.position.z) < 20)
    soundFX.play(type ? 'place' : 'break', type || previous);
  return true;
}
villagers.openDoor = (q, y, r) => toggleBuilding(q, y, r, true);
function onLadder() {
  const a = worldToAxial(camera.position.x, camera.position.z),
    p = axialToWorld(a.q, a.r);
  for (
    let y = Math.floor(playerFeet());
    y <= Math.floor(camera.position.y);
    y++
  ) {
    const type = world.get(a.q, y, a.r),
      state = world.state(a.q, y, a.r);
    if (
      isCaveVine(type) &&
      Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 0.55
    )
      return true;
    if (
      isTrapdoor(type) &&
      state.open &&
      world.get(a.q, y - 1, a.r) === 'ladder' &&
      world.state(a.q, y - 1, a.r).facing === state.facing &&
      Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 0.22
    )
      return true;
    if (type !== 'ladder') continue;
    const angle = facingAngle(state.facing);
    const dx = camera.position.x - p.x,
      dz = camera.position.z - p.z;
    if (dx * Math.sin(angle) + dz * Math.cos(angle) > 0.25) return true;
  }
  return false;
}
function cropConditions(k, plant) {
  const [q, y, r] = k.split(',').map(Number);
  return growthConditions(
    world,
    plant,
    q,
    y,
    r,
    time,
    weather,
    weatherColumns,
    [...graphics.lights.values()].filter(
      (l) => l.type === 'torch' || l.type === 'lantern',
    ),
  );
}
function harvestPlant(k, uproot = false, lift = 1) {
  const plant = crops.get(k);
  if (!plant) return false;
  const def = PLANTS[plant.kind],
    mature = plant.age >= def.seconds;
  const [q, y, r] = k.split(',').map(Number);
  const products = mature ? { ...def.yield } : { [def.seed]: 1 };
  if (def.perennial && mature && !uproot) {
    plant.age = 0;
    products[def.seed]--;
    graphics.crop(k, plant);
  } else {
    crops.delete(k);
    graphics.removeCrop(k);
  }
  if (!creative)
    for (const [id, n] of Object.entries(products))
      dropAt(id, n, q, y + lift, r);
  graphics.swing();
  soundFX.play('break', 'leaves');
  return true;
}
function growTree(k) {
  const [q, y, r] = k.split(',').map(Number);
  const plant = crops.get(k),
    def = PLANTS[plant?.kind];
  if (!def?.tree || !def.soil.includes(world.get(q, y, r))) return false;
  const cells = treePlan(world, q, y, r, growthOccupied, def.species);
  if (!cells) return false;
  crops.delete(k);
  graphics.removeCrop(k);
  const chunks = new Set();
  for (const [a, b, c, type] of cells) {
    world.set(a, b, c, type);
    for (const [dq, dr] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ])
      chunks.add(graphics.chunkKey(a + dq, c + dr));
  }
  for (const ck of chunks) if (graphics.chunks.has(ck)) graphics.buildChunk(ck);
  weatherColumns.update(1, world);
  graphics.renderer.shadowMap.needsUpdate = true;
  return true;
}
function updatePlants(dt) {
  const stoneGrowth = tickDripstone(world, dt, growthOccupied);
  if (stoneGrowth.length) graphics.updateCells(stoneGrowth);
  applyPlantChanges(tickCavePlants(world, dt), !creative);
  const leaves = world.leafDecay.update(dt);
  if (leaves.length) {
    const chunks = new Set();
    for (const { q, y, r, type } of leaves) {
      graphics.leafParticles.spawn(q, y, r, type, camera.position);
      for (const [dq, dr] of [[0, 0], ...DIRECTIONS])
        chunks.add(graphics.chunkKey(q + dq, r + dr));
      if (!creative)
        for (const stack of leafDrops(type))
          dropAt(stack.item, stack.count, q, y, r);
    }
    for (const ck of chunks)
      if (graphics.chunks.has(ck)) graphics.buildChunk(ck);
    weatherColumns.update(1, world);
  }
  applyPlantChanges(growChorus(world, dt, growthOccupied), !creative);
  for (const [k, plant] of crops) {
    const [q, y, r] = k.split(',').map(Number);
    if (!world.loaded(q, r)) continue;
    const def = PLANTS[plant.kind];
    if (
      !def.soil.includes(world.get(q, y, r)) ||
      world.get(q, y + 1, r) ||
      world.fluids.get(q, y + 1, r) ||
      (def.perennial &&
        [2, 3].some(
          (h) => world.get(q, y + h, r) || world.fluids.get(q, y + h, r),
        ))
    ) {
      harvestPlant(k, true, world.get(q, y + 1, r) ? 2 : 1);
      continue;
    }
    const status = cropConditions(k, plant);
    plant.age = Math.min(def.seconds, plant.age + dt * status.rate);
    if (def.tree && plant.age >= def.seconds && status.rate > 0) growTree(k);
    else graphics.crop(k, plant);
  }
}
function growthOccupied(q, y, r) {
  const p = axialToWorld(q, r);
  if (
    Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 1.25 &&
    y < camera.position.y + 0.15 &&
    y + 1 > playerFeet()
  )
    return true;
  return [...creatures, ...villagers.residents.values()].some(
    (m) =>
      Math.hypot(p.x - m.mesh.position.x, p.z - m.mesh.position.z) < 1.3 &&
      y < m.mesh.position.y + (MOBS[m.kind]?.height || 1.9) &&
      y + 1 > m.mesh.position.y,
  );
}
function applyPlantChanges(output, drop = true) {
  if (!output.changed.length) return;
  const chunks = new Set();
  for (const { q, y, r } of output.changed) {
    graphics.updateLight(q, y, r);
    for (const [dq, dr] of [[0, 0], ...DIRECTIONS])
      chunks.add(graphics.chunkKey(q + dq, r + dr));
  }
  for (const ck of chunks) if (graphics.chunks.has(ck)) graphics.buildChunk(ck);
  if (drop)
    for (const p of output.drops) dropAt(p.item, p.count, p.q, p.y, p.r);
  weatherColumns.update(1, world);
  graphics.renderer.shadowMap.needsUpdate = true;
}
function harvestChorusBlock(q, y, r, direct, drop) {
  applyPlantChanges(harvestChorus(world, q, y, r, direct), drop);
  graphics.burst(q, y, r, '#ac82b3');
  soundFX.play('break', 'wood');
}
function interactPlant(k) {
  const [q, y, r] = k.split(',').map(Number),
    plant = crops.get(k);
  if (plant) {
    const def = PLANTS[plant.kind];
    if (useItem() === 'boneMeal') {
      if (def.infernal) {
        toast('下界疣无法用骨粉催熟，灵魂沙上会自然生长。');
        return true;
      }
      if (!fertilizePlant(k)) {
        toast(
          def.tree
            ? '请清理树苗周围的生长空间。'
            : plant.age >= def.seconds
              ? '作物已成熟，换下骨粉后右键收获。'
              : '先恢复植物需要的土地和水。',
        );
        return true;
      }
      consumeUseItem('boneMeal');
      useSwing();
      updateHUD();
      toast(
        def.tree
          ? '树苗长成了' + TREES[def.species].name + '。'
          : def.name + '已成熟，右键收获。',
      );
      return true;
    }
    if (plant.age >= def.seconds && !def.tree) {
      harvestPlant(k);
      toast(
        def.perennial
          ? '收取上段甘蔗，根部会继续生长。'
          : '收获' + def.name + '，可用种子或蔬菜重新播种。',
      );
      return true;
    }
    const status = cropConditions(k, plant);
    toast(
      def.name +
        ' · ' +
        Math.floor((plant.age / def.seconds) * 100) +
        '% · ' +
        (def.tree && plant.age >= def.seconds
          ? '空间不足，清理上方并退开'
          : status.reason),
    );
    return true;
  }
  const kind = plantForItem(useItem());
  if (!kind) return false;
  const issue = plantingIssue(world, kind, q, y, r);
  if (issue) {
    toast(issue);
    return true;
  }
  crops.set(k, { kind, age: 0 });
  consumeUseItem(PLANTS[kind].seed);
  useSwing();
  graphics.crop(k, crops.get(k));
  soundFX.play('place', 'grass');
  updateHUD();
  toast(
    '种下' + PLANTS[kind].name + ' · ' + cropConditions(k, crops.get(k)).reason,
  );
  return true;
}
function interact(preferContext = false) {
  if (!playing) return;
  if (!actionHand) return beginUse(() => interact(preferContext));
  combat.reset();
  if (foodUse) stopEating();
  if (useEndCrystal() || useCircuitControl() || useCavePlant() || useCauldron())
    return;
  if (!preferContext && boats.riding && useItem() === 'fishingRod') {
    useFishingRod();
    return;
  }
  if (!preferContext && interactBoat()) return;
  if (interactCreature()) return;
  const contextual =
    villagerTarget ||
    (target &&
      (isOpenable(target.type) ||
        [
          'ladder',
          'portal',
          'endportal',
          'endGateway',
          'bed',
          'workbench',
          ...Object.keys(FURNACES),
          'stonecutter',
          'enchantingTable',
          'brewingStand',
          'campfire',
          'soulCampfire',
          ...ANVILS,
          'grindstone',
          'chest',
          'shulkerBox',
          'hopper',
          'dropper',
          'dispenser',
          'farmland',
        ].includes(target.type) ||
        (plantForItem(useItem()) && ['grass', 'dirt'].includes(target.type))));
  if (
    !contextual &&
    !target?.crop &&
    (useBow() ||
      useFishingRod() ||
      useBoatItem() ||
      useRocket() ||
      useThrowable())
  )
    return;
  if (FOODS[useItem()] && !contextual) {
    eat(heldUseInput() || 'tap');
    return;
  }
  if (villagerTarget) {
    tradingWith = villagerTarget;
    openOverlay('#station-overlay');
    renderTrade();
    return;
  }
  if (!contextual && (stripLog() || useGlassBottle() || useBucket())) return;
  if (!target) return;
  const { q, y, r, type } = target,
    k = key(q, y, r);
  if (useItem() === 'flintAndSteel' && type === 'obsidian') {
    useIgniter();
    return;
  }
  if (type === 'portal' && ITEMS[useItem()]?.bucket) {
    useBucket();
    return;
  }
  if (isCampfire(type)) {
    interactCampfire(q, y, r);
    return;
  }
  if (type === 'endGateway') {
    useEndGateway(q, r);
    return;
  }
  if (isOpenable(type)) {
    toggleBuilding(q, y, r);
    return;
  }
  if (type === 'ladder') {
    toast('贴近梯子：W / 空格向上，Shift 停住，松开缓慢下滑。');
    return;
  }
  if (type === 'portal' || type === 'endportal') {
    travel(
      dimension === 'overworld'
        ? type === 'portal'
          ? 'nether'
          : 'end'
        : 'overworld',
    );
    return;
  }
  if (type === 'bed') {
    if (dimension !== 'overworld') {
      toast('这里无法入睡。回到主世界再休息吧。');
      return;
    }
    const p = axialToWorld(q, r);
    respawnPoint = [p.x, y + 1.03, p.z];
    if (time % 600 > 300 || weather.storm > 0.6) {
      time = Math.floor(time / 600) * 600 + 675;
      weather.set('clear', 300);
      health = 20;
      hunger = Math.max(4, hunger - 2);
      survival.saturation = Math.min(survival.saturation, hunger);
      toast('一觉醒来，天光正好。重生点已设在床边。');
      beep(500, 0.4);
    } else toast('重生点已设在这里。夜晚再来，可以睡到黎明。');
    updateHUD();
    saveGame();
    return;
  }
  if (type === 'workbench') {
    openOverlay('#craft-overlay');
    return;
  }
  if (type === 'stonecutter') {
    stationKey = k;
    openOverlay('#station-overlay');
    renderStonecutter();
    return;
  }
  if (isFurnace(type)) {
    stationKey = k;
    openOverlay('#station-overlay');
    renderFurnace();
    return;
  }
  if (type === 'brewingStand') {
    stationKey = k;
    tradingWith = null;
    openOverlay('#station-overlay');
    renderBrewing();
    return;
  }
  if (type === 'enchantingTable') {
    if (world.solid(q, y + 1, r)) {
      toast('先清理附魔台上方的空间。');
      return;
    }
    stationKey = k;
    openOverlay('#station-overlay');
    renderEnchanting();
    return;
  }
  if (isSmithingStation(type)) {
    stationKey = k;
    tradingWith = null;
    smithState.name = '';
    openOverlay('#station-overlay');
    renderSmithing();
    return;
  }
  if (type === 'spawner') {
    toast('在五格内放置火把或萤灯压制刷怪，也可用石镐拆除。');
    return;
  }
  if (isStorage(type)) {
    if (!storageLidClear(world, q, y, r, camera, playerFeet())) {
      toast('箱盖需要展开空间，移开上方的方块或离开箱顶后再试。');
      return;
    }
    syncDecor();
    stationKey = k;
    openOverlay('#station-overlay');
    if (!['hopper', 'dropper', 'dispenser'].includes(type)) {
      graphics.chestModels.openKey = k;
      soundFX.play(ITEMS[type]?.portable ? 'shulkerOpen' : 'chestOpen');
    }
    renderChest();
    return;
  }
  if (interactPlant(k)) return;
  if (['grass', 'dirt', 'farmland'].includes(type)) {
    if (type === 'farmland') {
      toast('手持麦种、胡萝卜或马铃薯，右键播种。');
      return;
    }
    if (!creative && ITEMS[useItem()]?.kind !== 'hoe') {
      toast('手持锄头右键翻耕；树苗可直接种在泥土或草地上。');
      return;
    }
    if (world.get(q, y + 1, r) || world.fluids.get(q, y + 1, r)) {
      toast('先清理土地上方的空间。');
      return;
    }
    world.set(q, y, r, 'farmland');
    wearUseItem(useItem());
    graphics.updateBlock(q, y, r);
    toast('已翻耕。手持种子或蔬菜播种，三格内的水可以灌溉。');
    return;
  }
  openOverlay('#craft-overlay');
}
function renderTrade() {
  if (!tradingWith) return;
  const n = tradingWith,
    day = Math.floor(time / 600);
  $('#station-title').textContent = n.village.name + ' · ' + ROLES[n.role].name;
  const items = (obj) =>
    Object.entries(obj)
      .map(([id, count]) => icon(id) + ITEMS[id].name + ' ×' + count)
      .join(' ');
  $('#station-content').innerHTML =
    `<p>绿宝石 ${inventory.emerald || 0} · 每项交易每天可进行 4 次。</p><div class="village-trades">${ROLES[
      n.role
    ].trades
      .map((o, i) => {
        const stock = world.villageTrades.get(n.id + '/' + i),
          left = 4 - (stock?.day === day ? stock.used : 0),
          available =
            creative ||
            (left > 0 &&
              Object.entries(o.cost).every(
                ([id, n]) => (inventory[id] || 0) >= n,
              ));
        return `<button data-trade="${i}" ${available ? '' : 'disabled'}>${items(o.cost)} <span>→</span> ${items(o.give)}<small>今日剩余 ${left}</small></button>`;
      })
      .join(
        '',
      )}</div><p class="panel-note">村民白天在村中活动，夜晚返回住处。收获农田、开采矿物或采集原木，都可以换取物资。</p>`;
}
$('#station-content').addEventListener('click', (e) => {
  const b = e.target.closest('[data-trade]');
  if (!b || !tradingWith) return;
  if (
    trade(
      world,
      tradingWith,
      Number(b.dataset.trade),
      inventory,
      time,
      creative,
    )
  ) {
    soundFX.play('craft');
    updateHUD();
    awardXP(3 + Math.floor(Math.random() * 4), [
      camera.position.x,
      playerFeet() + 0.5,
      camera.position.z,
    ]);
    saveGame();
    renderTrade();
  }
});
function currentEnchanting() {
  return (
    !!stationKey &&
    world.get(...stationKey.split(',').map(Number)) === 'enchantingTable'
  );
}
function renderEnchanting() {
  if (!currentEnchanting()) return;
  const [q, y, r] = stationKey.split(',').map(Number);
  $('#station-title').textContent = '六棱附魔台';
  $('#station-content').innerHTML = enchantingPanel(
    pack,
    workstationItems.enchant,
    experience,
    bookshelfPower(world, q, y, r),
    (experience.seed + world.seed) % 1e9,
    creative,
  );
}
$('#station-content').addEventListener('click', (e) => {
  const button = e.target.closest('[data-enchant-offer]');
  if (!currentEnchanting() || !button || button.disabled) return;
  const target = workstationItems.enchant[0],
    lapis = workstationItems.enchant[1];
  if (!target || enchantLabel(target.wear)) return;
  const [q, y, r] = stationKey.split(',').map(Number);
  const offer = enchantOffers(
    target.item,
    (experience.seed + world.seed) % 1e9,
    bookshelfPower(world, q, y, r),
  )[Number(button.dataset.enchantOffer)];
  if (
    !offer?.available ||
    (!creative &&
      (experience.level < offer.levels || (lapis?.count || 0) < offer.cost))
  )
    return;
  if (!creative) {
    if (!experience.spend(offer.cost, true)) return;
    lapis.count -= offer.cost;
    if (!lapis.count) workstationItems.enchant[1] = null;
  } else experience.seed = (experience.seed + 1) % 1e9;
  target.wear = {
    ...(typeof target.wear === 'object' ? target.wear : {}),
    value: wearValue(target.wear),
    enchant: { ...offer.enchants },
  };
  renderEnchanting();
  inventoryControls.refresh();
  updateHUD();
  saveGame();
  soundFX.play('enchant');
  toast(
    (customName(target.wear) || ITEMS[target.item].name) +
      ' · ' +
      enchantLabel(target.wear),
  );
});
function currentSmithing() {
  const type = stationKey && world.get(...stationKey.split(',').map(Number));
  return isSmithingStation(type) ? type : null;
}
function currentSmithingPlan() {
  const type = currentSmithing();
  if (!type) return { valid: false, reason: '需要使用铁砧或砂轮。' };
  return smithingPlan(
    type === 'grindstone' ? type : 'anvil',
    ...workstationItems.smith,
    smithState.name,
    creative,
  );
}
function renderSmithing(previewOnly = false) {
  const type = currentSmithing();
  if (!type) return;
  const plan = currentSmithingPlan();
  if (previewOnly && $('#smith-preview')) {
    $('#smith-preview').innerHTML = smithingPreview(plan, experience, creative);
    return;
  }
  $('#station-title').textContent = BLOCKS[type].name;
  $('#station-content').innerHTML = smithingPanel(
    type === 'grindstone' ? type : 'anvil',
    pack,
    workstationItems.smith,
    smithState.name,
    plan,
    experience,
    creative,
  );
}
$('#station-content').addEventListener('input', (e) => {
  if (e.target.id !== 'smith-name' || !currentSmithing()) return;
  smithState.name = e.target.value;
  renderSmithing(true);
});
$('#station-content').addEventListener('click', (e) => {
  const button = e.target.closest('[data-station-return]');
  if (!button) return;
  const kind = button.dataset.stationReturn;
  if (!['enchant', 'smith', 'stonecut'].includes(kind)) return;
  if (
    kind === 'enchant'
      ? !currentEnchanting()
      : kind === 'stonecut'
        ? !currentStonecutter()
        : !currentSmithing()
  )
    return;
  for (let i = 0; i < workstationItems[kind].length; i++)
    moveSlot(
      resolveInventorySlot(
        kind === 'stonecut' ? 'stonecut:input' : kind + ':' + i,
      ),
      [...packRefs(9), ...packRefs(0, 9)].map(resolveInventorySlot),
    );
  updateHUD();
  refreshInventoryPanel();
  inventoryControls.refresh();
  saveGame();
  if (workstationItems[kind].some(Boolean))
    toast('背包空间不足，剩余物品留在槽位。');
});
function settleWorkstationItems() {
  for (const list of Object.values(workstationItems))
    for (let i = 0; i < list.length; i++) {
      const stack = list[i];
      if (!stack) continue;
      const moved = pack.insertStack(stack);
      if (moved < stack.count)
        dropInventoryStack({ ...stack, count: stack.count - moved }, false);
      list[i] = null;
    }
  smithState.name = '';
  stonecutState.selection = null;
  stonecutState.cuts = 0;
}
function flushStationEffects() {
  if (stonecutState.cuts) {
    stonecutState.cuts = 0;
    soundFX.play('grindstone');
    if (stationKey) {
      const [q, y, r] = stationKey.split(',').map(Number);
      graphics.burst(q, y + 0.5, r, '#aaa99b');
    }
  }
  let shouldClose = false;
  for (const effect of pendingStationEffects.splice(0)) {
    const { plan, type, key: k } = effect,
      grind = type === 'grindstone';
    const [q, y, r] = k.split(',').map(Number);
    if (grind && !effect.creative)
      awardXP(plan.xp, [
        camera.position.x,
        playerFeet() + 0.5,
        camera.position.z,
      ]);
    let broken = false;
    if (!grind && !effect.creative && Math.random() < 0.12) {
      const state = { ...world.state(q, y, r) },
        next = ANVILS[ANVILS.indexOf(type) + 1] || null;
      world.set(q, y, r, next);
      if (next) world.setState(q, y, r, state);
      else {
        broken = true;
        shouldClose = true;
      }
      graphics.updateBlock(q, y, r);
    }
    graphics.smithingModels.use(k);
    graphics.burst(q, y + 0.5, r, grind ? '#c7be9f' : '#d6bd8c');
    soundFX.play(grind ? 'grindstone' : broken ? 'anvilBreak' : 'anvil');
    toast(
      (grind ? '砂轮加工完成' : '铁砧加工完成') +
        ' · ' +
        (customName(plan.entry) || ITEMS[plan.id].name) +
        (broken ? ' · 铁砧已损坏消失' : ''),
    );
  }
  if (shouldClose) closeOverlay();
}
function currentStonecutter() {
  return !!(
    stationKey &&
    world.get(...stationKey.split(',').map(Number)) === 'stonecutter'
  );
}
function renderStonecutter() {
  if (!currentStonecutter()) return;
  const scroll = document.querySelector('.stonecut-recipes')?.scrollTop || 0;
  $('#station-title').textContent = '六棱切石机';
  $('#station-content').innerHTML = stonecutterPanel(
    pack,
    workstationItems.stonecut[0],
    stonecutState.selection,
  );
  document.querySelector('.stonecut-recipes').scrollTop = scroll;
}
$('#station-content').addEventListener('click', (event) => {
  const button = event.target.closest('[data-stonecut]');
  if (!button || !currentStonecutter()) return;
  if (
    !stonecuttingResult(workstationItems.stonecut[0], button.dataset.stonecut)
  )
    return;
  inventoryControls.cancel();
  stonecutState.selection = button.dataset.stonecut;
  renderStonecutter();
  inventoryControls.refresh();
});
function currentFurnace() {
  if (
    !stationKey ||
    !isFurnace(world.get(...stationKey.split(',').map(Number)))
  )
    return null;
  if (!world.furnaces.has(stationKey))
    world.furnaces.set(
      stationKey,
      newFurnace(world.get(...stationKey.split(',').map(Number))),
    );
  return world.furnaces.get(stationKey);
}
function renderFurnace() {
  const f = currentFurnace();
  if (!f) return;
  $('#station-title').textContent = '六棱' + FURNACES[f.kind].name;
  $('#station-content').innerHTML = furnacePanel(pack, f.kind);
  updateFurnacePanel(f);
}
function spillFurnace(k) {
  const f = world.furnaces.get(k);
  if (!f) return;
  const [q, y, r] = k.split(',').map(Number);
  const point = axialToWorld(q, r);
  awardXP(f.xp || 0, [point.x, y + 0.5, point.z]);
  for (const slot of ['input', 'fuel', 'output'])
    if (f[slot]) dropAt(f[slot].item, f[slot].count, q, y, r);
  world.furnaces.delete(k);
}
function updateFurnaces(dt) {
  for (const [k, f] of world.furnaces) {
    const [q, y, r] = k.split(',').map(Number);
    if (!world.loaded(q, r)) continue;
    if (world.get(q, y, r) !== f.kind) {
      spillFurnace(k);
      continue;
    }
    const lit = f.burn > 0;
    tickFurnace(f, dt);
    const burning = f.burn > 0;
    if (lit !== burning) graphics.updateBlock(q, y, r);
  }
  if (overlay === '#station-overlay' && $('#furnace-progress')) {
    const f = currentFurnace();
    if (f) updateFurnacePanel(f);
  }
}
function refreshNetherPortals() {
  const changed = maintainNetherPortals(world);
  if (changed.length) graphics.updateCells(changed);
}
function useIgniter() {
  if (useItem() !== 'flintAndSteel') return false;
  if (target && isCampfire(target.type)) {
    interactCampfire(target.q, target.y, target.r);
    return true;
  }
  if (dimension === 'end') {
    toast('末地无法开启下界门。');
    return true;
  }
  const p = target?.place;
  const frame = p && findNetherFrame(world, p.q, p.y, p.r);
  if (!frame) {
    toast(
      '黑曜石门框：内部至少 2 格宽、3 格高；对准框内底座右键点燃。三个水平轴均可，四角可省略。',
    );
    return true;
  }
  if (frame.cells.every(([q, y, r]) => world.get(q, y, r) === 'portal')) {
    toast('这座下界门已经开启。');
    return true;
  }
  const cells = lightNetherFrame(world, frame);
  graphics.updateCells(cells);
  wearUseItem('flintAndSteel');
  useSwing();
  soundFX.play('campfireIgnite');
  toast(
    `下界门已点燃 · ${frame.width} × ${frame.height} · 站入门中穿越，也可右键`,
  );
  saveGame();
  return true;
}
function updateFalling(dt) {
  const changed = world.gravity.tick(dt, {
    canPlace(q, y, r) {
      const old = world.get(q, y, r),
        p = axialToWorld(q, r);
      world.set(q, y, r, 'stone', false);
      const occupied =
        collides(camera.position.x, playerFeet(), camera.position.z) ||
        buildingOccupied(q, y, r) ||
        boats.intersectsCell(p.x, y, p.z);
      world.set(q, y, r, old || null, false);
      return !occupied;
    },
    drop(id, q, y, r) {
      dropAt(id, 1, q, y, r);
    },
    impact(block, support, amount) {
      const p = axialToWorld(block.q, block.r);
      if (amount > 0) {
        if (
          Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 0.5 &&
          playerFeet() < support + 1 &&
          playerFeet() + playerHeight() > support
        )
          hurt(amount, 'fallingBlock');
        for (const m of [...fauna.active])
          if (
            Math.hypot(m.mesh.position.x - p.x, m.mesh.position.z - p.z) <
              0.3 + (MOBS[m.kind].radius || 0.35) &&
            m.mesh.position.y < support + 1 &&
            m.mesh.position.y + MOBS[m.kind].height > support
          )
            fauna.hit(m, amount, null, false);
      }
      graphics.burst(block.q, Math.floor(support), block.r, '#b58d70');
      soundFX.play('break', 'stone');
    },
  });
  if (changed.length) {
    graphics.updateCells(changed);
    maintainBuildings();
    refreshNetherPortals();
  }
}
function updatePortalTravel(dt) {
  portalCooldown = Math.max(0, portalCooldown - dt);
  const a = worldToAxial(camera.position.x, camera.position.z),
    y = Math.floor(playerFeet() + 0.75);
  let inside = false;
  if (world.get(a.q, y, a.r) === 'portal') {
    const p = axialToWorld(a.q, a.r),
      direction = axialToWorld(
        ...DIRECTIONS[world.state(a.q, y, a.r).facing % 3],
      );
    const distance =
      Math.abs(
        (camera.position.x - p.x) * direction.z -
          (camera.position.z - p.z) * direction.x,
      ) / Math.sqrt(3);
    inside = distance < 0.38;
  }
  if (inside && !portalCooldown) portalExposure += dt;
  else portalExposure = Math.max(0, portalExposure - dt * 4);
  const seconds = creative ? 1 : 4;
  $('#portal-overlay').style.opacity = Math.min(
    0.6,
    (portalExposure / seconds) * 0.6,
  );
  if (portalExposure < seconds) return false;
  return travel(dimension === 'nether' ? 'overworld' : 'nether');
}
function campfireSlotOrder(q, r) {
  const p = axialToWorld(q, r),
    hit = target?.point || camera.position;
  const angle = Math.atan2(hit.z - p.z, hit.x - p.x);
  return Array.from({ length: 6 }, (_, i) => i).sort(
    (a, b) =>
      Math.cos((b * Math.PI) / 3 - angle) - Math.cos((a * Math.PI) / 3 - angle),
  );
}
function interactCampfire(q, y, r) {
  const k = key(q, y, r),
    fire = world.campfires.get(k),
    held = useItem();
  if (!fire) return;
  if (ITEMS[held]?.bucket) {
    useBucket();
    return;
  }
  if (ITEMS[held]?.kind === 'shovel') {
    if (!setCampfireLit(world, k, false)) {
      toast('营火已经熄灭，用打火石或火把重新点燃。');
      return;
    }
    wearUseItem(held);
    soundFX.play('campfireOut');
  } else if (held === 'torch' || held === 'flintAndSteel') {
    if (fire.lit) {
      toast('营火已经点燃，不需要持续添加燃料。');
      return;
    }
    if (campfireWet(world, q, y, r)) {
      toast('先移开周围的水或萤晶液，再点火。');
      return;
    }
    setCampfireLit(world, k, true);
    if (held === 'flintAndSteel') wearUseItem(held);
    else consumeUseItem('torch');
    soundFX.play('campfireIgnite');
  } else if (Object.hasOwn(CAMPFIRE_FOODS, held)) {
    const index = campfireSlotOrder(q, r).find((i) => !fire.slots[i]);
    if (index === undefined) {
      toast('六个烹饪位已满，熟食完成后会自动弹出。');
      return;
    }
    if (!creative && !(useCount(held) > 0)) return;
    fire.slots[index] = { item: held, elapsed: 0 };
    consumeUseItem(held);
    soundFX.play('place', 'wood');
    toast(
      fire.lit
        ? '已放上食材 · 30 秒后自动出炉'
        : '已放上食材 · 用打火石或火把点燃后开始烹饪',
    );
  } else if (!held) {
    const index = campfireSlotOrder(q, r).find((i) => fire.slots[i]);
    if (index === undefined) {
      toast('右键放入生肉、生鱼或马铃薯 · 铲子熄灭 · 打火石点燃');
      return;
    }
    const slot = fire.slots[index];
    dropAt(slot.item, 1, q, y, r);
    fire.slots[index] = null;
    soundFX.play('pickup');
  } else {
    toast('用生肉、生鱼或马铃薯烹饪，空手取回食材；Shift 右键可在旁建造。');
    return;
  }
  graphics.updateLight(q, y, r);
  useSwing();
  updateHUD();
  saveGame();
}
let campfireSoundTimer = 0;
function updateCampfires(dt) {
  let cookedNearby = false;
  const near = (q, y, r) => {
    const p = axialToWorld(q, r);
    return (
      Math.hypot(
        p.x - camera.position.x,
        y - camera.position.y,
        p.z - camera.position.z,
      ) < 12
    );
  };
  tickCampfires(world, dt, {
    changed(q, y, r) {
      graphics.updateLight(q, y, r);
      if (near(q, y, r)) soundFX.play('campfireOut');
    },
    drop(id, q, y, r, i) {
      const p = axialToWorld(q, r),
        angle = (i * Math.PI) / 3;
      drops.spawn(
        id,
        1,
        [p.x + Math.cos(angle) * 0.8, y + 0.55, p.z + Math.sin(angle) * 0.8],
        {},
        [Math.cos(angle) * 1.1, 2.5, Math.sin(angle) * 1.1],
      );
      cookedNearby ||= near(q, y, r);
    },
  });
  if (cookedNearby) soundFX.play('campfireCook');
  if (!dt) return;
  campfireSoundTimer -= dt;
  if (campfireSoundTimer > 0) return;
  campfireSoundTimer = 1.2 + Math.random() * 1.5;
  for (const [k, fire] of world.campfires) {
    const [q, y, r] = k.split(',').map(Number);
    if (fire.lit && world.loaded(q, r) && near(q, y, r)) {
      soundFX.play('campfireCrackle');
      break;
    }
  }
}
function currentBrewing() {
  if (
    !stationKey ||
    world.get(...stationKey.split(',').map(Number)) !== 'brewingStand'
  )
    return null;
  if (!world.brewing.has(stationKey))
    world.brewing.set(stationKey, newBrewing());
  return world.brewing.get(stationKey);
}
function renderBrewing() {
  const b = currentBrewing();
  if (!b) return;
  $('#station-title').textContent = '六棱酿造台';
  $('#station-content').innerHTML = brewingPanel(pack);
  updateBrewingPanel(b);
}
function spillBrewing(k) {
  const b = world.brewing.get(k);
  if (!b) return;
  const [q, y, r] = k.split(',').map(Number);
  for (const id of b.bottles) if (id) dropAt(id, 1, q, y, r);
  if (b.ingredient) dropAt(b.ingredient.item, b.ingredient.count, q, y, r);
  if (b.fuelStock) dropAt('ember', b.fuelStock, q, y, r);
  world.brewing.delete(k);
}
function updateBreweries(dt) {
  for (const [k, b] of world.brewing) {
    const [q, y, r] = k.split(',').map(Number);
    if (!world.loaded(q, r)) continue;
    if (world.get(q, y, r) !== 'brewingStand') {
      spillBrewing(k);
      continue;
    }
    if (tickBrewing(b, dt)) {
      const p = axialToWorld(q, r);
      if (
        Math.hypot(
          camera.position.x - p.x,
          camera.position.y - y,
          camera.position.z - p.z,
        ) < 12
      )
        soundFX.play('brew');
    }
  }
  if (overlay === '#station-overlay' && $('#brew-progress')) {
    const b = currentBrewing();
    if (b) updateBrewingPanel(b);
  }
}
function closeChestLid() {
  if (!graphics.chestModels.openKey) return;
  const portable = graphics.chestModels.models.get(graphics.chestModels.openKey)
    ?.userData.portable;
  graphics.chestModels.openKey = null;
  soundFX.play(portable ? 'shulkerClose' : 'chestClose');
}
function currentChest() {
  if (
    !stationKey ||
    !isStorage(world.get(...stationKey.split(',').map(Number)))
  )
    return null;
  if (!chests.has(stationKey))
    chests.set(
      stationKey,
      Array(
        ITEMS[world.get(...stationKey.split(',').map(Number))].storage,
      ).fill(null),
    );
  return chests.get(stationKey);
}
function renderChest() {
  const chest = currentChest();
  if (!chest) return;
  const type = world.get(...stationKey.split(',').map(Number));
  $('#station-title').textContent = ITEMS[type].name;
  $('#station-content').innerHTML = chestPanel(chest, pack, type);
}
function packStorage(k, type) {
  const stack = {
    item: type,
    count: 1,
    contents: structuredClone(chests.get(k) || newChest()),
  };
  chests.delete(k);
  return stack;
}
function spillChest(k) {
  const chest = chests.get(k);
  if (!chest) return;
  const [q, y, r] = k.split(',').map(Number);
  for (const slot of chest) {
    if (!slot) continue;
    const point = axialToWorld(q, r);
    drops.spawnStack(slot, [point.x, y + 0.5, point.z]);
  }
  chests.delete(k);
}
function stopEating(clearInputs = false) {
  foodUse = null;
  pendingChorusUse = null;
  if (clearInputs) {
    foodInputs.clear();
    blockUse = null;
  }
  if (graphics) {
    graphics.eating = 0;
    graphics.eatingHand = null;
    graphics.setHeld(heldItem());
  }
}
function teleportChorusFruit() {
  const origin = camera.position.clone(),
    feet = playerFeet();
  let destination = null;
  for (let i = 0; i < 16; i++) {
    const x = origin.x + (Math.random() * 2 - 1) * 8,
      z = origin.z + (Math.random() * 2 - 1) * 8,
      y = Math.max(1, Math.min(62, feet + (Math.random() * 2 - 1) * 8));
    const floor = findFloor(world, x, z, y, { step: 0, drop: 8, height: 1.8 });
    if (
      floor === null ||
      Math.abs(floor - feet) > 8 ||
      collides(x, floor + 0.01, z, 1.8)
    )
      continue;
    const a = worldToAxial(x, z);
    if (growthOccupied(a.q, floor, a.r)) continue;
    destination = new THREE.Vector3(x, floor + 1.66, z);
    break;
  }
  if (!destination) {
    toast('紫颂果 · 附近没有可安全落脚的位置。');
    return;
  }
  boats.riding = null;
  fishing.clear();
  glider.reset();
  flightEffects.clear();
  combat.reset();
  motion.reset();
  camera.position.copy(destination);
  graphics.stepOffset = 0;
  graphics.sync(
    worldToAxial(destination.x, destination.z).q,
    worldToAxial(destination.x, destination.z).r,
    true,
  );
  vy = 0;
  grounded = false;
  leftDown = false;
  mining = 0;
  cancelBow();
  target = creatureTarget = villagerTarget = boatTarget = null;
  throwables.burst(origin, 'pearl', 18);
  throwables.burst(destination, 'pearl', 18);
  soundFX.play('pearlTeleport');
  toast('紫颂果 · 折跃到附近地面');
}
function canEat(item, hand = actionHand || 'main') {
  return !!(
    FOODS[item] &&
    handStack(hand)?.item === item &&
    (item !== 'chorusFruit' || chorusCooldown <= 0) &&
    (creative || hunger < 20 || FOODS[item].always)
  );
}
function eat(source = 'tap', chosen = null, hand = actionHand) {
  if (!playing || overlay || foodUse) return false;
  hand ||= canEat(handStack('main')?.item, 'main') ? 'main' : 'offhand';
  const item = chosen || handStack(hand)?.item;
  if (!canEat(item, hand)) {
    toast(
      item === 'chorusFruit' && chorusCooldown > 0
        ? '紫颂果还在冷却，稍等片刻。'
        : FOODS[item]
          ? '已经吃饱了，等饥饿后再吃。'
          : '把食物或饮品拿在主手或副手，再按住右键使用。',
    );
    return false;
  }
  foodUse = {
    item,
    hand,
    source,
    elapsed: 0,
    sound: 0,
    ref: handRef(hand),
    stack: handStack(hand),
  };
  mining = 0;
  cancelBow();
  graphics.eatingHand = hand;
  return true;
}
function updateEating(dt) {
  if (!foodUse) return;
  const use = foodUse;
  if (
    handRef(use.hand) !== use.ref ||
    handStack(use.hand) !== use.stack ||
    !canEat(use.item, use.hand) ||
    leftDown ||
    (use.source !== 'tap' && !foodInputs.has(use.source))
  ) {
    stopEating();
    return;
  }
  use.elapsed += dt;
  use.sound -= dt;
  if (use.sound <= 0) {
    soundFX.play(FOODS[use.item].drink ? 'drink' : 'eat');
    use.sound = 0.28;
  }
  graphics.eating = use.elapsed;
  if (use.elapsed < 1.6) return;
  withUseHand(use.hand, () => {
    if (FOODS[use.item].container) exchangeUseItem(FOODS[use.item].container);
    else consumeUseItem(use.item);
  });
  const vitals = { health, hunger };
  survival.eat(use.item, vitals);
  health = vitals.health;
  hunger = vitals.hunger;
  stopEating();
  if (use.item === 'chorusFruit') {
    chorusCooldown = 1;
    teleportChorusFruit();
    if (use.source !== 'tap' && foodInputs.has(use.source))
      pendingChorusUse = { source: use.source, hand: use.hand, ref: use.ref };
  }
  updateHUD();
  saveGame();
  if (use.item === 'goldenApple')
    toast('金苹果 · 生命恢复 5 秒 · 伤害吸收 2 分钟');
  else if (use.item === 'milkBucket') toast('已喝下牛奶，清除状态效果。');
  else if (POTIONS[use.item])
    toast(ITEMS[use.item].name + ' · ' + potionDescription(use.item));
  if (
    !FOODS[use.item].container &&
    use.source !== 'tap' &&
    foodInputs.has(use.source) &&
    canEat(use.item, use.hand)
  )
    eat(use.source, use.item, use.hand);
}
function playerFluidAt(height) {
  const a = worldToAxial(camera.position.x, camera.position.z),
    y = Math.floor(height);
  const fluid = world.fluids.get(a.q, y, a.r);
  return fluid && height < y + world.fluids.height(a.q, y, a.r) ? fluid : null;
}
function updateSurvival(dt) {
  if (creative) {
    survivalSubmerged = false;
    survival.frost.reset();
    const vitals = { health, hunger };
    survival.tickEffects(dt, vitals);
    health = Math.max(health, vitals.health);
    return;
  }
  const head = playerFluidAt(camera.position.y),
    feet = playerFluidAt(playerFeet() + 0.12);
  const a = worldToAxial(camera.position.x, camera.position.z);
  const cauldron = cauldronContact(
    world,
    camera.position.x,
    playerFeet(),
    camera.position.z,
  );
  if (
    cauldron?.liquid === 'water' &&
    survival.burning > 0 &&
    !survival.rank('fireResistance')
  ) {
    world.set(
      cauldron.q,
      cauldron.y,
      cauldron.r,
      waterCauldron(cauldron.level - 1),
    );
    graphics.updateCells([[cauldron.q, cauldron.y, cauldron.r]]);
  }
  let snow = powderContact(
    world,
    camera.position.x,
    playerFeet(),
    camera.position.z,
    playerHeight(),
  );
  if (snow.length && survival.burning > 0) {
    const p = snow[0];
    world.set(...p, null);
    graphics.updateCells([p]);
    survival.burning = 0;
    snow = snow.slice(1);
  }
  const column = weatherColumns.get(world, a.q, a.r);
  survivalSubmerged = !!head && head.type !== 'lava';
  const wet =
    cauldron?.liquid === 'water' ||
    [feet, head].some((fluid) => fluid && LIQUIDS[fluid.type].coolant) ||
    (dimension === 'overworld' &&
      weather.rain > 0.25 &&
      column.roof < camera.position.y &&
      !['沙漠', '雪原'].includes(column.biome));
  const vitals = { health, hunger };
  const owner = survival;
  const damage = owner.tick(dt, vitals, {
    powder: snow.length > 0,
    insulated: Object.values(equipment.armor).some((id) =>
      id.startsWith('leather'),
    ),
    submerged: survivalSubmerged,
    respiration: equipment.armor.head
      ? equipment.rank(equipment.armor.head, 'respiration')
      : 0,
    campfire: campfireHeat(
      world,
      camera.position.x,
      playerFeet(),
      camera.position.z,
    ),
    wet,
    lava:
      cauldron?.liquid === 'lava' ||
      [feet, head].some((fluid) => fluid && LIQUIDS[fluid.type].damage) ||
      !!boats.riding?.burning,
  });
  health = vitals.health;
  hunger = vitals.hunger;
  for (const [amount, cause] of damage) {
    hurt(amount, cause);
    if (survival !== owner) break;
  }
}
function survivalHUD() {
  const cold = creative ? 0 : survival.frost.time;
  const freezeBar = $('#freeze-bar');
  freezeBar.classList.toggle('hidden', !hasGame || cold <= 0);
  freezeBar.setAttribute('aria-valuenow', cold.toFixed(2));
  freezeBar.querySelector('i').style.transform = `scaleX(${cold / 7})`;
  $('#frost-overlay').style.opacity = hasGame ? cold / 7 : 0;
  $('#health').classList.toggle('frozen', cold >= 7);
  const headCell = worldToAxial(camera.position.x, camera.position.z);
  $('#powder-overlay').style.opacity =
    hasGame &&
    world.get(headCell.q, Math.floor(camera.position.y), headCell.r) ===
      'powderSnow'
      ? 0.85
      : 0;
  const air = Math.ceil(survival.air / 1.5);
  const airBar = $('#air-bar');
  airBar.classList.toggle(
    'hidden',
    creative || (!survivalSubmerged && survival.air >= 15),
  );
  airBar.setAttribute('aria-valuenow', survival.air.toFixed(1));
  if (airBar.dataset.bubbles !== String(air)) {
    airBar.dataset.bubbles = air;
    airBar.innerHTML = Array.from(
      { length: 10 },
      (_, i) => '<i class="' + (i < air ? 'filled' : '') + '"></i>',
    ).join('');
  }
  $('#absorption-hud').textContent = creative
    ? ''
    : '◆'.repeat(Math.ceil(survival.absorption / 2));
  const effects = [];
  if (!creative) {
    if (survival.burning > 0)
      effects.push('燃烧 ' + Math.ceil(survival.burning) + 's');
    if (survival.absorptionTime > 0)
      effects.push('伤害吸收 ' + Math.ceil(survival.absorptionTime) + 's');
    if (hunger <= 0) effects.push('饥饿 · 需要食物');
    if (
      touchesWeb(
        world,
        camera.position.x,
        playerFeet(),
        camera.position.z,
        playerHeight(),
        0.24,
      )
    )
      effects.push('蛛网缠身');
  }
  const effectHTML =
    effects
      .map((text) => `<span class="effect-badge">${text}</span>`)
      .join('') +
    Object.entries(survival.effects)
      .map(
        ([id, e]) =>
          `<span class="effect-badge" style="--effect:${EFFECTS[id].color}">${EFFECTS[id].icon ? `<img src="${textureURL('mcl_potions_effect_' + EFFECTS[id].icon)}" alt="">` : `<span aria-hidden="true">${id === 'slowness' ? '⌛' : '☠'}</span>`}${EFFECTS[id].name} ${e.rank === 2 ? 'II' : 'I'} ${Math.ceil(e.time)}s</span>`,
      )
      .join('');
  if ($('#effect-list').dataset.value !== effectHTML) {
    $('#effect-list').dataset.value = effectHTML;
    $('#effect-list').innerHTML = effectHTML;
  }
  $('#health').classList.toggle('low-health', !creative && health <= 6);
  $('#hunger').classList.toggle('low-hunger', !creative && hunger <= 6);
  $('#hunger').title =
    '饱和度 ' + survival.saturation.toFixed(1) + ' / ' + Math.floor(hunger);
  $('#fire-overlay').classList.toggle(
    'active',
    !creative && survival.burning > 0 && hasGame,
  );
  $('#use-food').classList.toggle('hidden', !foodUse);
  if (foodUse) {
    $('#use-food-name').textContent =
      (FOODS[foodUse.item].drink ? '饮用 ' : '食用 ') +
      ITEMS[foodUse.item].name;
    $('#use-progress').value = foodUse.elapsed / 1.6;
    $('#use-progress').setAttribute(
      'aria-label',
      FOODS[foodUse.item].drink ? '饮用进度' : '食用进度',
    );
  }
}

function combatHUD() {
  document.querySelectorAll('#hotbar .item-cooldown').forEach((overlay) => {
    const item = pack.slots[Number(overlay.parentElement.dataset.slot)]?.item;
    const remaining =
      item === 'chorusFruit'
        ? chorusCooldown
        : (throwables.cooldowns[item] || 0) / (THROWABLES[item]?.cooldown || 1);
    overlay.style.height = `${Math.min(1, remaining) * 100}%`;
  });
  const shield = availableShield(),
    shieldStatus = $('#shield-status');
  shieldStatus.classList.toggle('hidden', !shield);
  shieldStatus.classList.toggle('impact', combat.impact > 0.05);
  if (shield) {
    $('#shield-label').textContent =
      (combat.raised
        ? combat.raiseTime < 0.25
          ? '举盾中'
          : '正面防御'
        : '右键 / R 举盾') +
      ' · ' +
      (shield === handStack('offhand') ? '副手' : '主手') +
      ' · ' +
      (creative ? '∞' : wearValue(shield.wear) + ' / 336');
    $('#shield-ready').value = combat.raiseTime;
  }
  const charge = Math.max(0, Math.min(1, 1 - attackCooldown / attackPeriod));
  const meter = $('#attack-meter');
  meter.classList.toggle('hidden', !!foodUse || !!bowUse);
  meter.setAttribute('aria-valuenow', charge.toFixed(2));
  $('#mobile-shield').classList.toggle('hidden', !availableShield());
  const cells = Math.floor(charge * 6 + 0.001);
  if (meter.dataset.cells !== String(cells)) {
    meter.dataset.cells = cells;
    meter.innerHTML = Array.from(
      { length: 6 },
      (_, i) => '<i class="' + (i < cells ? 'ready' : '') + '"></i>',
    ).join('');
  }
}
function hurt(amount, cause = 'combat', source = null) {
  if (creative) return;
  let blocked = false;
  if (
    ['combat', 'projectile', 'fireball', 'explosion'].includes(cause) &&
    blockingShield() &&
    combat.canBlock(camera.position, yaw, source)
  ) {
    blocked = true;
    combat.impact = 1;
    withUseHand(combat.hand, () =>
      wearUseItem('shield', 1 + Math.ceil(amount)),
    );
    survival.exhaust(0.05);
    soundFX.play('shieldBlock');
    if (source && !boats.riding)
      motion.kick(
        camera.position.x - source.x,
        camera.position.z - source.z,
        0.8,
      );
    if (cause !== 'explosion') return 'blocked';
    amount *= 0.3;
  }
  if (damageCooldown > 0) return;
  stopEating();
  const enchantedProtection = equipment.enchantProtection();
  if (
    [
      'combat',
      'projectile',
      'fireball',
      'explosion',
      'burn',
      'fallingBlock',
    ].includes(cause)
  ) {
    const protection = equipment.protection();
    for (const id of Object.values(equipment.armor))
      if (ITEMS[id].armor)
        wearItem(id, Math.max(1, Math.ceil(amount / 4)), true);
    amount *= 1 - protection * 0.04;
  }
  if (!['void', 'hunger'].includes(cause))
    amount *= 1 - enchantedProtection * 0.04;
  if (cause !== 'void') amount = survival.absorb(amount);
  if (source && !boats.riding && !blocked) {
    if (glider.active)
      glider.kick(
        camera.position.x - source.x,
        camera.position.z - source.z,
        cause === 'explosion' ? 5 : 3.5,
      );
    else
      motion.kick(
        camera.position.x - source.x,
        camera.position.z - source.z,
        cause === 'explosion' ? 5 : 3.5,
      );
    if (grounded && !playerFluidAt(playerFeet() + 0.12)) {
      vy = Math.max(vy, 2.6);
      grounded = false;
    }
  }
  survival.exhaust(0.1);
  health = Math.max(0, health - amount);
  damageCooldown = 0.8;
  $('#damage').style.opacity = '.6';
  $('#damage').dataset.cause = cause;
  setTimeout(() => ($('#damage').style.opacity = '0'), 250);
  soundFX.play(cause === 'drown' ? 'drown' : 'hurt');
  if (health <= 0) {
    fishing.clear();
    lastDeath = [camera.position.x, playerFeet() + 0.4, camera.position.z];
    for (const stack of [
      ...pack.slots,
      ...pack.gear,
      ...craftingGrid,
      ...craftingReturns,
      ...Object.values(workstationItems).flat(),
      inventorySession.cursor,
    ].filter(Boolean)) {
      drops.spawnStack(stack, lastDeath, null, 600);
    }
    inventorySession.cursor = null;
    craftingGrid = newCraftingGrid();
    craftingReturns = [];
    workstationItems = newWorkstationItems();
    pendingStationEffects = [];
    const lostXP = Math.min(100, experience.level * 7);
    experience.total = experience.fraction = 0;
    awardXP(lostXP, lastDeath);
    pack = new PlayerInventory();
    inventory = pack.counts;
    hotbar = pack.hotbar;
    equipment = new Equipment().bind(pack);
    survival = new Survival({ saturation: 2 });
    combat.reset();
    safeSpawn();
    health = 20;
    hunger = 12;
    toast(
      (cause === 'drown'
        ? '你溺水了。'
        : cause === 'freeze'
          ? '你在细雪中冻伤倒下了。'
          : cause === 'burn'
            ? '你被烧伤倒下了。'
            : '') + '已在出生点醒来。物资留在死亡地点，M 查看红色 × 标记。',
    );
    saveGame();
    return 'dead';
  }
  updateHUD();
  return 'hit';
}
function updateMobs(dt) {
  fauna.update(
    dt,
    time,
    camera,
    [heldItem(), pack.gear[4]?.item],
    creative,
    weather,
  );
}
function updateWeather(dt) {
  weather.update(dt, world.seed);
  weatherColumns.update(dt, world);
  weatherGrowthTimer += dt;
  if (weatherGrowthTimer < 1) return;
  updatePlants(weatherGrowthTimer);
  const collected = tickCauldrons(
    world,
    weatherGrowthTimer,
    weather,
    weatherColumns,
  );
  if (collected.length) graphics.updateCells(collected);
  updateCampfires(weatherGrowthTimer);
  refreshNetherPortals();
  weatherGrowthTimer = 0;
}
function hitMob(
  mob,
  amount,
  direction,
  source = 'melee',
  part = 'body',
  punch = 0,
  owned = true,
) {
  if (mob.bossType === 'shulkerBullet') return shulkerBullets.hit(mob);
  if (mob.bossType) return dragonFight.hit(mob, amount, source, part);
  if (source === 'arrow' && mob.kind === 'shulker' && (mob.peek || 0) < 0.15) {
    soundFX.play('shulkerBlock');
    return 'deflected';
  }
  if (source === 'arrow' && fauna.dodge(mob, owned)) return 'dodged';
  const p = mob.mesh.position,
    a = worldToAxial(p.x, p.z);
  graphics.burst(a.q, p.y, a.r, MOBS[mob.kind].color);
  beep(140, 0.07, 'triangle');
  fauna.hit(mob, amount, direction, true, owned, 0.5 + punch * 0.8, owned);
  return 'hit';
}
function interactCreature() {
  const mob = fauna.target(
    camera,
    Math.min(
      target?.distance ?? Infinity,
      villagerTarget?.distance ?? Infinity,
    ),
  );
  if (!mob || MOBS[mob.kind].hostile) return false;
  const action = fauna.interact(mob, useItem());
  if (!action) return false;
  if (action.replace && !creative) exchangeUseItem(action.replace);
  else {
    if (action.consume) consumeUseItem(action.consume);
    for (const [id, n] of Object.entries(action.give || {})) addItem(id, n);
  }
  if (action.wear) wearUseItem(action.wear);
  toast(action.message);
  useSwing();
  updateHUD();
  saveGame();
  return true;
}

function explode(center, settings = {}) {
  const radius = settings.radius ?? 2.7,
    damageRadius = settings.damageRadius ?? 5,
    damage = settings.damage ?? 14;
  const blastOwner = survival;
  syncDecor();
  for (const b of [...boats.records])
    if (
      Math.hypot(...b.position.map((n, i) => n - center.getComponent(i))) <
      radius + 1
    )
      boats.damage(b, settings.damage ?? 20);
  const origin = worldToAxial(center.x, center.z),
    changed = new Set();
  const distance = center.distanceTo(
    camera.position.clone().add(new THREE.Vector3(0, -0.8, 0)),
  );
  if (
    distance < damageRadius &&
    (!settings.soft ||
      fauna.visible(
        center,
        camera.position.clone().add(new THREE.Vector3(0, -0.65, 0)),
      ))
  ) {
    const guarded =
      blockingShield() && combat.canBlock(camera.position, yaw, center);
    hurt(
      Math.max(1, damage * (1 - distance / damageRadius)),
      'explosion',
      center,
    );
    if (
      settings.fire &&
      blastOwner === survival &&
      !creative &&
      !guarded &&
      !survival.rank('fireResistance') &&
      distance < 2
    )
      survival.burning = Math.max(survival.burning, 4);
  }
  for (const mob of [...creatures])
    if (
      mob.id !== settings.excludeMob &&
      mob.mesh.position.distanceTo(center) < (settings.mobRadius ?? 4) &&
      (!settings.soft ||
        fauna.visible(
          center,
          mob.mesh.position
            .clone()
            .add(new THREE.Vector3(0, MOBS[mob.kind].height * 0.5, 0)),
        ))
    )
      fauna.hit(
        mob,
        settings.mobDamage ?? 12,
        mob.mesh.position.clone().sub(center).normalize(),
        !!settings.playerOwned,
        !!settings.playerOwned,
      );
  const reach = Math.ceil(radius / 1.5);
  for (let dq = -reach; dq <= reach; dq++)
    for (let dr = -reach; dr <= reach; dr++) {
      const q = origin.q + dq,
        r = origin.r + dr,
        p = axialToWorld(q, r);
      for (
        let y = Math.max(1, Math.floor(center.y - radius));
        y <= Math.min(63, Math.ceil(center.y + radius));
        y++
      ) {
        if (
          Math.hypot(p.x - center.x, y + 0.5 - center.y, p.z - center.z) >
          radius
        )
          continue;
        const type = world.get(q, y, r),
          k = key(q, y, r);
        if (!type || type === 'bedrock' || type === 'obsidian') continue;
        if (
          settings.soft &&
          (BLOCKS[type].hardness > 1 ||
            ['stone', 'basalt', 'netherbrick', 'brick', 'endstone'].includes(
              type,
            ))
        )
          continue;
        if (BLOCKS[type].shape) {
          removeBuilding(q, y, r, !creative && Math.random() < 0.6);
          continue;
        }
        const packed = ITEMS[type]?.portable ? packStorage(k, type) : null;
        world.set(q, y, r, null);
        if (packed && (!creative || packed.contents.some(Boolean)))
          drops.spawnStack(packed, [p.x, y + 0.5, p.z]);
        else if (!packed && !creative && Math.random() < 0.6) {
          for (const stack of miningLoot(type).stacks)
            dropAt(stack.item, stack.count, q, y, r);
        }
        spillChest(k);
        spillFurnace(k);
        spillBrewing(k);
        chests.delete(k);
        world.structureFeatures.add('chest:' + k);
        for (const cropKey of [k, key(q, y - 1, r)]) {
          harvestPlant(cropKey, true);
        }
        for (const [a, b] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [0, -1],
          [1, -1],
        ])
          changed.add(graphics.chunkKey(q + a, r + b));
        graphics.updateLight(q, y, r);
        if (graphics.portalMeshes.has(k)) {
          const portal = graphics.portalMeshes.get(k);
          portal.traverse((o) => {
            o.geometry?.dispose();
            if (Array.isArray(o.material))
              o.material.forEach((m) => m.dispose());
            else o.material?.dispose();
          });
          graphics.decor.remove(portal);
          graphics.portalMeshes.delete(k);
        }
      }
    }
  for (const k of changed) if (graphics.chunks.has(k)) graphics.buildChunk(k);
  graphics.burst(origin.q, center.y, origin.r, '#e3b567');
  soundFX.play('break', 'stone');
  if (settings.notice !== false) toast('轰！苦力怕炸开了周围的方块。');
  saveGame();
}
function attack() {
  graphics.ray.setFromCamera(new THREE.Vector2(), camera);
  const combatants = [
    ...creatures,
    ...dragonFight.combatants,
    ...shulkerBullets.combatants,
  ];
  const meshes = combatants.filter((m) => m.mesh.visible).map((m) => m.mesh);
  const hit = graphics.ray
    .intersectObjects(meshes, true)
    .find((h) => h.distance < 3.5);
  const incoming = fireballs.target(
    camera,
    Math.min(3.5, target?.distance ?? Infinity, hit?.distance ?? Infinity),
  );
  if (incoming) {
    if (attackCooldown > 0) return true;
    attackCooldown = attackPeriod = ITEMS[heldItem()]?.cooldown || 0.45;
    if (!creative) survival.exhaust(0.1);
    graphics.swing();
    fireballs.reflect(incoming, camera.getWorldDirection(new THREE.Vector3()));
    wearItem(heldItem(), 1);
    toast('火球已击回！对准恶魂，让它尝尝自己的火球。');
    return true;
  }
  if (!hit || (target && hit.distance > target.distance)) return false;
  let obj = hit.object;
  while (obj.parent && !meshes.includes(obj)) obj = obj.parent;
  const mob = combatants.find((m) => m.mesh === obj);
  if (!mob) return false;
  if (attackCooldown > 0) return true;
  const held = heldItem(),
    item = ITEMS[held];
  attackCooldown = item?.cooldown || 0.45;
  attackPeriod = attackCooldown;
  if (!creative) survival.exhaust(0.1);
  const critical =
    !grounded &&
    vy < -1 &&
    !creative &&
    !glider.active &&
    !survival.rank('levitation');
  graphics.swing();
  hitMob(
    mob,
    ((item?.damage || 2) +
      survival.rank('strength') * 3 +
      (equipment.rank(held, 'sharpness')
        ? 0.5 + equipment.rank(held, 'sharpness') * 0.5
        : 0)) *
      (critical ? 1.5 : 1),
    camera.getWorldDirection(new THREE.Vector3()),
    'melee',
    dragonFight.partOf(hit.object),
  );
  wearItem(held, item?.kind === 'sword' ? 1 : 2);
  if (critical) toast('暴击！');
  return true;
}
function hurtLanding(velocity) {
  const a = worldToAxial(camera.position.x, camera.position.z);
  const support = world.groundAt(
    camera.position.x,
    camera.position.z,
    playerFeet() - 0.4,
    playerFeet() + 0.02,
  );
  const hay =
    support !== null &&
    world.get(a.q, Math.floor(support - 0.03), a.r) === 'hayBale';
  const spike = spikeAtFeet(
    world,
    camera.position.x,
    playerFeet(),
    camera.position.z,
  );
  const damage = spike
    ? spikeLandingDamage(velocity)
    : Math.floor((-velocity - 12) * 0.6 * (hay ? 0.2 : 1));
  if (damage > 0) hurt(damage, 'fall');
}
function releaseBow(input) {
  const use = bowUse,
    pull = bowPull(bowCharge);
  if (!use || (input && input !== use.input)) return;
  cancelBow();
  if (
    !playing ||
    overlay ||
    !validHandUse(use, 'bow') ||
    pull < 0.1 ||
    combat.raised ||
    foodUse
  )
    return;
  const ammo = arrowSlot();
  if (!creative && !ammo) return;
  const item = ammo?.get()?.item || 'arrow',
    enchant = enchantmentsOf(use.stack.wear),
    infinite = creative || (item === 'arrow' && !!enchant.infinity);
  if (!infinite) takeSlot(ammo, 1);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  projectiles.shoot(
    camera.position.clone(),
    direction,
    pull,
    !infinite,
    'player',
    1,
    { item, power: enchant.power || 0, punch: enchant.punch || 0 },
  );
  attackCooldown = 0.25;
  attackPeriod = attackCooldown;
  if (!creative) survival.exhaust(0.1);
  graphics.swing(use.hand);
  beep(pull >= 1 ? 320 : 240, 0.05, 'triangle');
  withUseHand(use.hand, () => wearUseItem('bow'));
  updateHUD();
  saveGame();
}
function moveGlider(dt) {
  const owner = survival;
  const movement = glider.update(dt, yaw, pitch);
  if (movement.wear) {
    wearItem('elytra', movement.wear, true);
    if (wearValue(wornElytra()?.wear) <= 1) {
      stopGliding();
      toast('鞘翅已破损！落地后用幻翼膜修复。');
    }
  }
  const steps = Math.max(
    1,
    Math.ceil(
      Math.max(
        Math.abs(movement.dx),
        Math.abs(movement.dy),
        Math.abs(movement.dz),
      ) / 0.12,
    ),
  );
  const delta = {
    x: movement.dx / steps,
    y: movement.dy / steps,
    z: movement.dz / steps,
  };
  grounded = false;
  for (let step = 0; step < steps; step++)
    for (const axis of ['x', 'z', 'y']) {
      const amount = delta[axis];
      if (!amount) continue;
      const x = camera.position.x + (axis === 'x' ? amount : 0),
        z = camera.position.z + (axis === 'z' ? amount : 0),
        feet = playerFeet() + (axis === 'y' ? amount : 0);
      if (!collides(x, feet, z)) camera.position[axis] += amount;
      else {
        const velocity =
          axis === 'x' ? glider.vx : axis === 'y' ? glider.vy : glider.vz;
        delta[axis] = 0;
        if (axis === 'y' && amount < 0) {
          grounded = true;
          if (velocity < -3) hurtLanding(velocity);
          if (owner !== survival) return;
          stopGliding();
          vy = 0;
          glider.vy = 0;
        } else {
          if (axis === 'x') glider.vx *= -0.08;
          else if (axis === 'z') glider.vz *= -0.08;
          else glider.vy = -1;
          const damage = Math.floor(Math.max(0, Math.abs(velocity) * 0.5 - 3));
          if (damage > 0) hurt(damage, 'flyWall');
          if (owner !== survival) return;
        }
      }
    }
  if (camera.position.y > 160) {
    camera.position.y = 160;
    glider.vy = Math.min(0, glider.vy);
  }
  vy = glider.active ? glider.vy : vy;
  moved = 0;
  survival.exhaust(dt * 0.01);
  camera.rotation.set(pitch, yaw, glider.active ? glider.bank : 0);
  const fov = glider.active
    ? fieldOfView +
      Math.min(14, glider.speed * 0.35) +
      (glider.boost > 0 ? 3 : 0)
    : fieldOfView;
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 6));
  camera.updateProjectionMatrix();
  $('#underwater').style.display = 'none';
  if (camera.position.y < -12) {
    damageCooldown = 0;
    hurt(20, 'void');
  }
}
function movePlayer(dt) {
  if (boats.riding) {
    crouching = creativeFlying = false;
    glider.reset();
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) {
      keys.delete('ShiftLeft');
      keys.delete('ShiftRight');
      leaveBoat();
      if (!boats.riding) return;
    }
    const b = boats.riding;
    const distance = Math.hypot(
      camera.position.x - b.position[0],
      camera.position.z - b.position[2],
    );
    camera.position.set(b.position[0], b.position[1] + BOAT_EYE, b.position[2]);
    camera.rotation.set(pitch, yaw, 0);
    camera.fov +=
      (fieldOfView * (1 - (bowUse ? bowPull(bowCharge) ** 2 * 0.15 : 0)) -
        camera.fov) *
      (1 - Math.exp(-dt * 8));
    camera.updateProjectionMatrix();
    vy = 0;
    grounded = true;
    moved = 0;
    $('#underwater').style.display = 'none';
    if (!creative) survival.exhaust(distance * 0.02);
    return;
  }
  if (!glider.active) {
    const feet = playerFeet(),
      eye = playerEyeHeight(),
      nextCrouch =
        !creativeFlying &&
        (keys.has('ShiftLeft') ||
          keys.has('ShiftRight') ||
          collides(camera.position.x, feet, camera.position.z, 1.8));
    if (
      !glider.lowProfile ||
      !collides(
        camera.position.x,
        feet,
        camera.position.z,
        nextCrouch ? 1.5 : 1.8,
      )
    ) {
      glider.lowProfile = false;
      crouching = nextCrouch;
      const change = playerEyeHeight() - eye;
      camera.position.y += change;
      graphics.stepOffset = (graphics.stepOffset || 0) + change;
    }
  }
  const survivalBeforeMove = survival;
  const startX = camera.position.x,
    startZ = camera.position.z;
  const feetFluid = playerFluidAt(playerFeet() + 0.12),
    headFluid = playerFluidAt(camera.position.y);
  const swimming = !!feetFluid,
    fly = creative && creativeFlying,
    levitating = !creative && survival.rank('levitation') > 0,
    climbing = !creative && onLadder(),
    webbed =
      !fly &&
      touchesWeb(
        world,
        camera.position.x,
        playerFeet(),
        camera.position.z,
        playerHeight(),
        0.24,
      );
  const powder =
    !fly &&
    powderContact(
      world,
      camera.position.x,
      playerFeet(),
      camera.position.z,
      playerHeight(),
    ).length > 0;
  const snowBoots = equipment.armor.feet === 'leatherFeet';
  if (glider.active) {
    const stack = wornElytra();
    if (
      fly ||
      swimming ||
      climbing ||
      levitating ||
      webbed ||
      powder ||
      !stack ||
      wearValue(stack.wear) <= 1
    )
      stopGliding();
    else {
      moveGlider(dt);
      return;
    }
  }
  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const norm = Math.hypot(forward, side);
  if (norm) {
    forward /= norm;
    side /= norm;
  }
  const sneaking = crouching || keys.has('ShiftLeft') || keys.has('ShiftRight');
  const sprint =
      (keys.has('ControlLeft') ||
        keys.has('ControlRight') ||
        motion.sprintRequested) &&
      forward > 0 &&
      (creative || hunger > 6) &&
      !glider.lowProfile &&
      !sneaking &&
      !powder &&
      !combat.raised &&
      !foodUse &&
      !bowUse,
    baseSpeed = fly
      ? sprint
        ? 20
        : 10
      : swimming
        ? LIQUIDS[feetFluid.type].speed
        : glider.lowProfile
          ? 1.5
          : sneaking
            ? 1.44
            : sprint
              ? 7
              : 4.8;
  const footCell = worldToAxial(camera.position.x, camera.position.z);
  const soulSlow =
    !fly &&
    !swimming &&
    !climbing &&
    world.get(footCell.q, Math.floor(playerFeet() - 0.05), footCell.r) ===
      'soulSand'
      ? 0.55
      : 1;
  const speed =
    baseSpeed *
    (!fly && (foodUse || combat.raised || bowUse) ? 0.35 : 1) *
    (!fly && !swimming && !climbing
      ? (1 + survival.rank('speed') * 0.2) *
        (1 - survival.rank('slowness') * 0.15)
      : 1) *
    soulSlow;
  let { dx, dz } = motion.update(
    dt,
    (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed,
    (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed,
    grounded,
    swimming,
    fly,
  );
  if (webbed) {
    dx *= 0.25;
    dz *= 0.25;
    motion.sprintRequested = false;
  }
  if (powder) {
    dx *= 0.2;
    dz *= 0.2;
    motion.sprintRequested = false;
  }
  if (
    !forward ||
    sneaking ||
    (!creative && hunger <= 6) ||
    combat.raised ||
    foodUse ||
    bowUse
  )
    motion.sprintRequested = false;
  const fov =
    fieldOfView *
    (swimming ? 0.96 : sprint && norm ? 1.1 : 1) *
    (1 - (bowUse ? bowPull(bowCharge) ** 2 * 0.15 : 0));
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 8));
  camera.updateProjectionMatrix();
  moved = norm;
  if (fly) {
    const dy =
      ((keys.has('Space') ? 1 : 0) -
        (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)) *
      speed *
      dt;
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.12),
    );
    for (let i = 0; i < steps; i++)
      for (const [axis, amount] of [
        ['x', dx / steps],
        ['z', dz / steps],
        ['y', dy / steps],
      ]) {
        const x = camera.position.x + (axis === 'x' ? amount : 0),
          z = camera.position.z + (axis === 'z' ? amount : 0),
          feet = playerFeet() + (axis === 'y' ? amount : 0);
        if (!collides(x, feet, z)) camera.position[axis] += amount;
        else if (axis === 'y' && amount < 0) {
          creativeFlying = false;
          grounded = true;
        }
      }
    camera.position.y = Math.max(-20, Math.min(85, camera.position.y));
    vy = 0;
  } else {
    let feet = playerFeet();
    const supported = (x, z) =>
      !sneaking ||
      !grounded ||
      swimming ||
      Math.hypot(motion.kickX, motion.kickZ) > 0.15 ||
      collides(x, feet - 0.51, z);
    const tryMove = (axis, amount) => {
      if (!amount) return;
      const x = camera.position.x + (axis === 'x' ? amount : 0),
        z = camera.position.z + (axis === 'z' ? amount : 0);
      if (!collides(x, feet, z) && supported(x, z)) {
        camera.position[axis] += amount;
        return;
      }
      if (grounded && !swimming && !climbing && vy <= 0) {
        const floor = findFloor(world, x, z, feet, {
          step: 0.6,
          drop: 0.04,
          wet: true,
          height: playerHeight(),
        });
        if (
          floor !== null &&
          floor > feet + 0.01 &&
          !collides(camera.position.x, floor + 0.005, camera.position.z)
        ) {
          const rise = floor + 0.005 - feet;
          camera.position[axis] += amount;
          camera.position.y += rise;
          graphics.stepOffset = Math.min(
            0.65,
            (graphics.stepOffset || 0) + rise,
          );
          feet = playerFeet();
          vy = 0;
          return;
        }
      }
      if (axis === 'x') motion.x = motion.kickX = 0;
      else motion.z = motion.kickZ = 0;
      motion.sprintRequested = false;
    };
    tryMove('x', dx);
    tryMove('z', dz);
    if (
      !swimming &&
      !climbing &&
      !levitating &&
      !powder &&
      motion.takeJump(keys.has('Space'), grounded)
    ) {
      vy = 8.5;
      if (!creative) survival.exhaust(sprint ? 0.8 : 0.2);
      grounded = false;
      beep(180, 0.04, 'sine', 0.01);
    }
    if (levitating) {
      vy += (survival.rank('levitation') - vy) * (1 - Math.exp(-dt * 4.46));
    } else if (climbing) {
      vy = sneaking ? 0 : keys.has('KeyW') || keys.has('Space') ? 3.2 : -1.2;
    } else if (swimming) {
      vy = Math.max(-2, vy - dt * 4);
      if (keys.has('Space')) vy = 4;
    } else vy -= dt * DIMENSIONS[dimension].gravity;
    if (powder && !levitating)
      vy =
        snowBoots && keys.has('Space') && !sneaking
          ? 3.2
          : Math.max(-0.8, Math.min(0.1, vy));
    if (webbed) vy = Math.max(-0.5, Math.min(0.1, vy));
    const dy = vy * dt,
      steps = Math.max(1, Math.ceil(Math.abs(dy) / 0.12));
    grounded = false;
    for (let i = 0; i < steps; i++) {
      const next = playerFeet() + dy / steps;
      if (collides(camera.position.x, next, camera.position.z)) {
        let clear = playerFeet(),
          blocked = next;
        for (let n = 0; n < 7; n++) {
          const mid = (clear + blocked) / 2;
          if (collides(camera.position.x, mid, camera.position.z))
            blocked = mid;
          else clear = mid;
        }
        camera.position.y = clear + playerEyeHeight();
        if (vy < 0) {
          grounded = true;
          if (vy < -3 && !levitating) hurtLanding(vy);
        }
        vy = 0;
        break;
      }
      camera.position.y += dy / steps;
      if (
        vy < -0.8 &&
        powderContact(
          world,
          camera.position.x,
          next,
          camera.position.z,
          playerHeight(),
        ).length
      ) {
        vy = -0.8;
        break;
      }
    }
    if (!creative && survival === survivalBeforeMove)
      survival.exhaust(
        Math.hypot(camera.position.x - startX, camera.position.z - startZ) *
          (swimming ? 0.015 : sprint ? 0.06 : 0.006),
      );
  }
  const a = worldToAxial(camera.position.x, camera.position.z);
  if (levitating && camera.position.y > 160) {
    camera.position.y = 160;
    vy = 0;
  }
  if (camera.position.y < -12) {
    if (creative) safeSpawn();
    else {
      damageCooldown = 0;
      hurt(20, 'void');
    }
  }
  $('#underwater').style.display =
    headFluid && !(graphics.usePost && headFluid.type === 'water')
      ? 'block'
      : 'none';
  $('#underwater').style.background = headFluid
    ? LIQUIDS[headFluid.type].color + '70'
    : '#238fa94a';
  if (norm && (grounded || swimming) && !fly) {
    footstepDistance += speed * dt;
    if (footstepDistance > 2.1) {
      footstepDistance = 0;
      soundFX.play(
        swimming ? 'splash' : 'step',
        world.get(a.q, Math.floor(playerFeet() - 0.1), a.r),
      );
    }
  }
  camera.rotation.set(pitch, yaw, 0);
}
function drawMap(canvas, full = false) {
  const ctx = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = full ? '#173536' : '#173c38';
  ctx.fillRect(0, 0, w, h);
  const scale = full ? 5.65 : 1.75,
    cx = w / 2 - camera.position.x * scale,
    cy = h / 2 - camera.position.z * scale;
  for (const [k, height] of world.heights) {
    const [q, r] = k.split(',').map(Number),
      p = axialToWorld(q, r);
    ctx.fillStyle =
      height <= 3
        ? '#427f83'
        : height <= 4
          ? '#c5b47b'
          : height >= 12
            ? '#a7ada0'
            : height >= 9
              ? '#719270'
              : '#4b7c60';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = ((i * 60 - 30) * Math.PI) / 180;
      ctx.lineTo(
        cx + (p.x + Math.cos(angle) * 0.97) * scale,
        cy + (p.z + Math.sin(angle) * 0.97) * scale,
      );
    }
    ctx.fill();
  }
  for (const [k, t] of world.edits)
    if (t === 'portal' || t === 'endportal') {
      const [q, , r] = k.split(',').map(Number),
        p = axialToWorld(q, r);
      ctx.fillStyle = t === 'portal' ? '#d6a1ff' : '#8effd4';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◈', cx + p.x * scale, cy + p.z * scale);
    }
  const at = worldToAxial(camera.position.x, camera.position.z);
  for (const cave of world.caves(at.q, at.r, full ? 65 : 35)) {
    const entrance = cave.path.at(-1);
    if (!world.loaded(entrance.q, entrance.r)) continue;
    const p = axialToWorld(entrance.q, entrance.r);
    ctx.fillStyle = cave.kind === 'lush' ? '#b6d887' : '#dddccc';
    ctx.font = full ? '17px monospace' : '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◌', cx + p.x * scale, cy + p.z * scale);
    if (full) {
      ctx.font = '11px sans-serif';
      ctx.fillText(cave.name + '入口', cx + p.x * scale, cy + p.z * scale + 15);
    }
  }
  for (const s of world.structures(at.q, at.r, full ? 65 : 35)) {
    if (!world.discoveredStructures.has(s.id)) continue;
    const p = axialToWorld(s.q, s.r);
    ctx.fillStyle =
      s.kind === 'dungeon' ||
      s.kind === 'mine' ||
      s.kind === 'endcity' ||
      s.kind === 'endship'
        ? '#c9abe9'
        : '#e9b56b';
    ctx.font = full ? '17px monospace' : '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◆', cx + p.x * scale, cy + p.z * scale);
    if (full) {
      ctx.font = '11px sans-serif';
      ctx.fillText(
        STRUCTURE_NAMES[s.kind],
        cx + p.x * scale,
        cy + p.z * scale + 15,
      );
    }
  }
  for (const v of world.villages(at.q, at.r, full ? 65 : 35)) {
    if (!world.loaded(v.q, v.r)) continue;
    const p = axialToWorld(v.q, v.r);
    ctx.fillStyle = '#ffe4a1';
    ctx.font = full ? '16px sans-serif' : '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⌂', cx + p.x * scale, cy + p.z * scale);
    if (full) {
      ctx.font = '11px sans-serif';
      ctx.fillText(v.name, cx + p.x * scale, cy + p.z * scale + 15);
    }
  }
  if (lastDeath) {
    ctx.fillStyle = '#ff8c83';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    const dx = Math.max(14, Math.min(w - 14, cx + lastDeath[0] * scale));
    const dz = Math.max(38, Math.min(h - 38, cy + lastDeath[2] * scale));
    ctx.fillText('×', dx, dz);
    if (full) {
      ctx.font = '12px sans-serif';
      ctx.fillText(
        `上次死亡 · Y ${Math.floor(lastDeath[1])} · ${Math.round(Math.hypot(lastDeath[0] - camera.position.x, lastDeath[2] - camera.position.z))}m`,
        dx,
        dz + 16,
      );
    }
  }
  const x = cx + camera.position.x * scale,
    y = cy + camera.position.z * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-yaw);
  ctx.fillStyle = '#ffe1a3';
  ctx.strokeStyle = '#183a33';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (full) {
    ctx.fillStyle = '#b6c5ae';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(DIMENSIONS[dimension].name + ' · N', w / 2, 23);
    ctx.fillText(
      `种子 ${world.seed} · Q ${worldToAxial(camera.position.x, camera.position.z).q} / R ${worldToAxial(camera.position.x, camera.position.z).r}`,
      w / 2,
      h - 18,
    );
  }
}

$('#start').onclick = () => {
  if (hasGame) {
    creative = false;
    closeOverlay();
    return;
  }
  const existing = readSave();
  if (existing) {
    startGame(false, existing);
    creative = false;
    updateHUD();
    saveGame();
    toast('已继续你的世界 · 生存模式');
  } else startGame(false);
};
$('#creative').onclick = () => {
  const existing = hasGame ? saveData() : readSave();
  if (existing) existing.creative = true;
  startGame(true, existing);
};
$('#continue').onclick = () => {
  const s = readSave();
  if (s) startGame(s.creative, s);
};
$('#menu-help').onclick = () => openOverlay('#pause-overlay');
$('#resume').onclick = () => {
  if (fromMenu) {
    document
      .querySelectorAll('.overlay')
      .forEach((e) => e.classList.add('hidden'));
    overlay = null;
  } else closeOverlay();
};
$('#recipes').onclick = (e) => {
  const b = e.target.closest('[data-recipe]');
  if (b) selectCraftRecipe(Number(b.dataset.recipe), e.shiftKey);
};
$('#fill-recipe').onclick = (e) =>
  selectCraftRecipe(selectedRecipe, e.shiftKey);
$('#craft-clear').onclick = () => {
  inventoryControls.cancel();
  craftingPreviewOnly = false;
  const remaining = returnCraftingGrid(pack, craftingGrid);
  updateHUD();
  renderCraft();
  inventoryControls.refresh();
  saveGame();
  if (remaining) toast('背包空间不足，剩余材料留在网格。');
};
for (const [id, mirror] of [
  ['craft-rotate', false],
  ['craft-mirror', true],
]) {
  $('#' + id).onclick = () => {
    inventoryControls.cancel();
    craftingPreviewOnly = false;
    transformCraftingGrid(craftingGrid, mirror);
    renderCraft();
    inventoryControls.refresh();
    saveGame();
  };
}
$('#craft-match').onclick = (e) => {
  const b = e.target.closest('[data-craft-choice]');
  if (b) {
    selectedRecipe = Number(b.dataset.craftChoice);
    craftingPreviewOnly = false;
    renderCraft();
  }
};
$('#recipe-book-toggle').onclick = () => {
  recipeBookOpen = !recipeBookOpen;
  renderCraft();
};
$('#craft-guide').onchange = (e) => {
  showCraftGuide = e.target.checked;
  renderCraft();
};
$('#recipe-available').onchange = renderRecipeBook;
$('#hotbar').onclick = (e) => {
  const b = e.target.closest('[data-slot]');
  if (b) {
    selected = Number(b.dataset.slot);
    updateHUD();
  }
};
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeOverlay();
});
$('#mode-toggle').onclick = () => {
  creative = !creative;
  creativeFlying = false;
  if (creative) stopGliding();
  if (!creative && collides(camera.position.x, playerFeet(), camera.position.z))
    safeSpawn();
  $('#mode-toggle').textContent = creative ? '切换生存探索' : '切换自由建造';
  updateHUD();
  saveGame();
  toast(creative ? '已进入自由建造 · 无限材料与飞行' : '已回到生存探索');
};
$('#respawn').onclick = () => {
  respawnPoint = null;
  safeSpawn();
  closeOverlay();
  toast('已回到出生点。');
};
$('#home').onclick = () => {
  fishing.clear();
  saveGame();
  document.exitPointerLock?.();
  playing = false;
  hasGame = false;
  survival.frost.reset();
  for (const id of ['frost-overlay', 'powder-overlay'])
    $('#' + id).style.opacity = 0;
  overlay = null;
  portalExposure = 0;
  $('#portal-overlay').style.opacity = 0;
  document
    .querySelectorAll('.overlay')
    .forEach((e) => e.classList.add('hidden'));
  $('#hud').classList.add('hidden');
  $('#landing').classList.remove('hidden');
};
$('#new-world').onclick = () => {
  const seed = Number($('#seed').value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 999999) {
    toast('种子请输入 0–999999 之间的整数。');
    return;
  }
  if (
    readSave() &&
    !confirm('创建新世界会替换当前自动存档。已导出备份，确定继续？')
  )
    return;
  startGame(false);
};
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(saveData(), null, 2)], {
      type: 'application/json',
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `hexwild-${world.seed}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('存档已导出。');
};
$('#import').onclick = () => $('#save-file').click();
$('#save-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 16e6) throw new Error('存档文件过大');
    const s = validateSave(JSON.parse(await file.text()));
    startGame(s.creative, s);
    toast('存档已载入。');
  } catch (err) {
    toast('导入失败：' + err.message);
  }
  e.target.value = '';
};
$('#volume').oninput = (e) => (soundFX.volume = Number(e.target.value));
$('#quality').onchange = (e) => {
  graphics.setQuality(Number(e.target.value));
  updatePostControls();
  savePreferences();
};
function updatePostControls() {
  const options = graphics.postOptions;
  $('#post-settings').disabled = !graphics.usePost;
  $('#occlusion-strength').value = options.occlusion;
  $('#occlusion-value').value = Math.round(options.occlusion * 100) + '%';
  $('#antialias-toggle').checked = options.antialias;
  $('#exposure-toggle').checked = options.exposure;
  $('#clouds-toggle').checked = options.clouds;
  $('#bloom-strength').value = options.bloom;
  $('#bloom-value').value = Math.round(options.bloom * 100) + '%';
}
function changePostControls() {
  graphics.setPostOptions({
    occlusion: Number($('#occlusion-strength').value),
    antialias: $('#antialias-toggle').checked,
    exposure: $('#exposure-toggle').checked,
    bloom: Number($('#bloom-strength').value),
    clouds: $('#clouds-toggle').checked,
  });
  updatePostControls();
}
for (const id of ['occlusion-strength', 'bloom-strength']) {
  $('#' + id).oninput = changePostControls;
  $('#' + id).onchange = savePreferences;
}
for (const id of ['antialias-toggle', 'clouds-toggle', 'exposure-toggle'])
  $('#' + id).onchange = () => {
    changePostControls();
    savePreferences();
  };
document.querySelectorAll('[data-dimension]').forEach(
  (b) =>
    (b.onclick = () => {
      if (creative && travel(b.dataset.dimension)) closeOverlay();
    }),
);
document.addEventListener('pointerdown', () => soundFX.unlock());
$('#recipe-search').oninput = renderRecipeBook;
$('#sensitivity').oninput = (e) => (sensitivity = Number(e.target.value));
$('#fov').oninput = (e) => {
  fieldOfView = Number(e.target.value);
  $('#fov-value').value = fieldOfView + '°';
};
$('#sound-toggle').onclick = () => {
  sound = !sound;
  soundFX.enabled = sound;
  $('#sound-toggle').textContent = sound ? '开启' : '关闭';
};
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === $('#world')) {
    playing = true;
  } else {
    playing = false;
    leftDown = false;
    keys.clear();
    cancelBow();
    motion.reset();
    if (hasGame && !overlay) openOverlay('#pause-overlay');
  }
});
document.addEventListener('mousemove', (e) => {
  if (!playing || isTouch) return;
  yaw -= e.movementX * 0.002 * sensitivity;
  pitch = Math.max(
    -1.5,
    Math.min(1.5, pitch - e.movementY * 0.002 * sensitivity),
  );
});
$('#world').addEventListener('mousedown', (e) => {
  if (!hasGame || overlay) return;
  if (!playing) {
    lock();
    return;
  }
  if (e.button === 0) leftDown = true;
  if (e.button === 1) {
    e.preventDefault();
    pickBlock();
  }
  if (e.button === 2) {
    foodInputs.add('mouse');
    place();
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    releaseBow('mouse');
    foodInputs.delete('mouse');
    throwHeldItem = null;
    blockUse = null;
    if (foodUse?.source === 'mouse') stopEating();
  }
  if (e.button !== 0) return;
  leftDown = false;
  mining = 0;
  $('#mine-progress i').style.width = '0';
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener(
  'wheel',
  (e) => {
    if (!playing) return;
    selected = (selected + (e.deltaY > 0 ? 1 : 8)) % 9;
    updateHUD();
  },
  { passive: true },
);
document.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (
    overlay === '#craft-overlay' &&
    (e.code === 'Tab' || (e.code === 'Space' && e.target.matches('button')))
  )
    return;
  if (
    ['recipe-search', 'creative-search', 'smith-name'].includes(e.target.id) &&
    e.code === 'Escape'
  ) {
    closeOverlay();
    return;
  }
  if (
    overlay === '#station-overlay' &&
    (currentChest() ||
      currentBrewing() ||
      currentSmithing() ||
      currentStonecutter() ||
      (stationKey &&
        world.get(...stationKey.split(',').map(Number)) ===
          'enchantingTable')) &&
    (e.code === 'Tab' || (e.code === 'Space' && e.target.matches('button')))
  )
    return;
  if (e.target.matches('input, select, textarea')) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code))
    e.preventDefault();
  if (e.repeat) return;
  if (overlay) {
    if (['Escape', 'KeyE', 'KeyB', 'Tab', 'KeyM'].includes(e.code))
      closeOverlay();
    return;
  }
  if (!hasGame) return;
  if (e.code === 'Escape') {
    openOverlay('#pause-overlay');
    return;
  }
  if (e.code === 'KeyE' || e.code === 'KeyB' || e.code === 'Tab') {
    openOverlay('#craft-overlay');
    return;
  }
  if (e.code === 'KeyM') {
    openOverlay('#map-overlay');
    return;
  }
  if (e.code === 'F1') {
    e.preventDefault();
    document.body.classList.toggle('hide-hud');
    return;
  }
  if (e.code === 'KeyF') {
    swapHands();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyQ') {
    throwItem(e.ctrlKey);
    e.preventDefault();
    return;
  }
  if (
    e.code.startsWith('Digit') &&
    Number(e.code.slice(5)) >= 1 &&
    Number(e.code.slice(5)) <= 9
  ) {
    selected = Number(e.code.slice(5)) - 1;
    updateHUD();
  }
  if (e.code === 'KeyW') motion.pressForward(e.timeStamp);
  if (e.code === 'Space') jumpInput(e.timeStamp);
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyW') motion.sprintRequested = false;
});
window.addEventListener('blur', () => {
  keys.clear();
  cancelBow();
  motion.reset();
  leftDown = false;
  if (hasGame && !overlay) openOverlay('#pause-overlay');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveGame();
    if (hasGame && !overlay) openOverlay('#pause-overlay');
  }
});
addEventListener('beforeunload', () => {
  saveGame();
});
if (isTouch) {
  let look = null;
  $('#world').addEventListener('pointerdown', (e) => {
    if (playing) {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      $('#world').setPointerCapture(e.pointerId);
    }
  });
  $('#world').addEventListener('pointermove', (e) => {
    if (!playing || !look || look.id !== e.pointerId) return;
    yaw -= (e.clientX - look.x) * 0.005 * sensitivity;
    pitch = Math.max(
      -1.5,
      Math.min(1.5, pitch - (e.clientY - look.y) * 0.005 * sensitivity),
    );
    look.x = e.clientX;
    look.y = e.clientY;
  });
  $('#world').addEventListener('pointerup', () => (look = null));
  $('#world').style.touchAction = 'none';
  document.querySelectorAll('[data-key]').forEach((b) => {
    b.onpointerdown = (e) => {
      if (b.dataset.key === 'KeyW') motion.pressForward(e.timeStamp);
      if (b.dataset.key === 'Space') jumpInput(e.timeStamp);
      keys.add(b.dataset.key);
      b.setPointerCapture(e.pointerId);
    };
    b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.key);
  });
  document.querySelectorAll('[data-action]').forEach((b) => {
    b.onpointerdown = (e) => {
      b.setPointerCapture(e.pointerId);
      const action = b.dataset.action;
      if (action === 'mine') leftDown = true;
      else if (action === 'place') {
        foodInputs.add('touch-use');
        place();
      } else if (action === 'swap') swapHands();
      else if (action === 'interact') interact();
      else if (action === 'eat') {
        foodInputs.add('touch');
        eat('touch');
      } else
        openOverlay(
          action === 'craft'
            ? '#craft-overlay'
            : action === 'map'
              ? '#map-overlay'
              : '#pause-overlay',
        );
    };
    b.onpointerup = () => {
      if (b.dataset.action === 'place') {
        releaseBow('touch-use');
        foodInputs.delete('touch-use');
        blockUse = throwHeldItem = null;
        if (foodUse?.source === 'touch-use') stopEating();
      }
      if (b.dataset.action === 'eat') {
        foodInputs.delete('touch');
        if (foodUse?.source === 'touch') stopEating();
      }
      leftDown = false;
    };
    b.onpointercancel = () => {
      cancelBow();
      if (b.dataset.action === 'place') {
        foodInputs.delete('touch-use');
        blockUse = throwHeldItem = null;
        if (foodUse?.source === 'touch-use') stopEating();
      }
      if (b.dataset.action === 'eat') {
        foodInputs.delete('touch');
        if (foodUse?.source === 'touch') stopEating();
      }
      leftDown = false;
    };
  });
} else $('#mobile-controls').style.display = 'none';

let last = performance.now(),
  menuTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // Keep simulation time at wall-clock speed on slower GPUs. Collision uses
  // smaller steps below so a long render frame cannot tunnel through terrain.
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!hasGame) {
    soundFX.weather(0, false, false, false);
    menuTime += dt;
    const angle = 0.64 + Math.sin(menuTime * 0.035) * 0.1;
    camera.position.set(Math.cos(angle) * 47, 29, Math.sin(angle) * 47);
    camera.lookAt(-3, 5, -5);
    graphics.outline.visible = false;
    graphics.frame(dt, 105 + menuTime, false, false, false);
    return;
  }
  if (playing && !overlay) {
    time += dt;
    const cell = worldToAxial(camera.position.x, camera.position.z);
    world.ensureAround(cell.q, cell.r);
    graphics.sync(cell.q, cell.r);
    updateWeather(dt);
    ambienceTimer += dt;
    if (ambienceTimer > 18) {
      ambienceTimer = 0;
      soundFX.play('ambient', dimension);
    }
    attackCooldown = Math.max(0, attackCooldown - dt);
    creativeMineDelay = Math.max(0, creativeMineDelay - dt);
    rocketCooldown = Math.max(0, rocketCooldown - dt);
    chorusCooldown = Math.max(0, chorusCooldown - dt);
    if (pendingChorusUse) {
      const pending = pendingChorusUse;
      if (
        !foodInputs.has(pending.source) ||
        handRef(pending.hand) !== pending.ref ||
        handStack(pending.hand)?.item !== 'chorusFruit'
      )
        pendingChorusUse = null;
      else if (!foodUse && chorusCooldown <= 0)
        eat(pending.source, 'chorusFruit', pending.hand);
    }
    damageCooldown = Math.max(0, damageCooldown - dt);
    updateShield(dt);
    updateBowUse(dt);
    boats.update(dt, world, keys);
    const physicsSteps = Math.max(1, Math.ceil(dt / (1 / 60)));
    if (
      world.circuitCells.size &&
      world.redstone.revision !== world.lightRevision
    )
      maintainBuildings();
    const redstoneChanges = new Map();
    for (let i = 0; i < physicsSteps; i++) {
      movePlayer(dt / physicsSteps);
      for (const p of updateRedstone(dt / physicsSteps))
        redstoneChanges.set(key(...p), p);
    }
    if (redstoneChanges.size)
      graphics.updateCells([...redstoneChanges.values()]);
    updateFalling(dt);
    if (updatePortalTravel(dt)) return;
    flightEffects.update(dt, world, camera, glider);
    updateSurvival(dt);
    updateEating(dt);
    world.fluids.step(dt);
    flushFluidChanges();
    if (
      fishingUse &&
      (!validHandUse(fishingUse, 'fishingRod') || !fishing.active)
    ) {
      fishing.clear();
      fishingUse = null;
    }
    if (fishingUse) fishing.update(dt, world, camera, weather.rain);
    target = graphics.target(
      !!ITEMS[hotbar[selected]]?.bucket ||
        heldItem() === 'boat' ||
        heldItem() === 'glassBottle',
    );
    boatTarget = boats.target(camera, target?.distance ?? Infinity);
    if (foodUse || combat.raised || bowUse) {
      mining = 0;
      miningKey = '';
      $('#mine-progress i').style.width =
        (bowUse ? bowPull(bowCharge) * 100 : 0) + '%';
    } else if (leftDown) {
      if (!attackBoat() && !attack()) mine(dt);
      else mining = 0;
    } else {
      mining = 0;
      miningKey = '';
      $('#mine-progress i').style.width = '0';
    }
    if (
      graphics.miningFeedback(
        mining > 0 ? target : null,
        mining / (BLOCKS[target?.type]?.hardness || Infinity),
        dt,
      )
    )
      soundFX.play('dig', target.type);
    $('#target').classList.toggle('hidden', !target?.type);
    $('#target').textContent = target?.type
      ? (target.fluid
          ? LIQUIDS[target.type].name +
            (target.source ? '源 · 右键装桶' : '流 · 无法装桶')
          : BLOCKS[target.type].name) +
        (isOpenable(target.type) ||
        [
          'workbench',
          ...Object.keys(FURNACES),
          'stonecutter',
          'enchantingTable',
          'brewingStand',
          ...ANVILS,
          'grindstone',
          'chest',
          'shulkerBox',
          'hopper',
          'dropper',
          'dispenser',
          'farmland',
          'bed',
          'portal',
          'endportal',
          'endGateway',
          'spawner',
          'ladder',
        ].includes(target.type)
          ? ' · 右键交互'
          : '')
      : '';
    if (BLOCKS[target?.type]?.foliage)
      $('#target').textContent +=
        ' · ' + world.leafDecay.label(key(target.q, target.y, target.r));
    if (isCaveVine(target?.type))
      $('#target').textContent +=
        target.type === 'caveVinesBerries'
          ? ' · 右键采摘 · 空格攀爬 · 断根会脱落'
          : ' · 骨粉结出浆果 · 空格攀爬 · 断根会脱落';
    if (target?.type === 'sporeBlossom')
      $('#target').textContent += ' · 采集后可悬挂在洞顶 · 飘落孢子';
    if (target?.type === 'pointedDripstone')
      $('#target').textContent += world.state(target.q, target.y, target.r)
        .upper
        ? ' · 钟乳石 · 断根会坠落 · 右键续接'
        : ' · 石笋 · 避免跳落尖端 · 右键续接';
    if (isCauldron(target?.type))
      $('#target').textContent +=
        ' · 右键用桶或水瓶装取 · 钟乳石下集液 / 露天接雨';
    if (target?.type === 'redstoneWire')
      $('#target').textContent +=
        ` · 信号 ${world.redstone.power(target.q, target.y, target.r)} / 15`;
    if (BLOCKS[target?.type]?.shape === 'dropper') {
      const state = world.state(target.q, target.y, target.r),
        direction = ['东', '东南', '西南', '西', '西北', '东北', '下', '上'][
          state.facing
        ];
      $('#target').textContent +=
        ` · 出口 ${direction}${state.powered ? ' · 通电' : ''}`;
    }
    if (target?.type === 'comparator') {
      const state = world.state(target.q, target.y, target.r);
      $('#target').textContent +=
        ` · ${state.subtract ? '减法' : '比较'} · 输出 ${state.output || 0} / 15 · 右键切换 · Shift 旁建`;
    }
    if (target?.type === 'repeater') {
      const { q, y, r } = target,
        state = world.state(q, y, r);
      $('#target').textContent +=
        ` · 延迟 ${state.delay || 1} 红石刻 · ${state.powered ? '已通电' : '未通电'}${world.redstone.locked(q, y, r) ? ' · 已锁定' : ''} · 右键调节 · Shift 旁建`;
    }
    if (target?.type === 'redstoneTorch') {
      const { q, y, r } = target,
        heat = world.redstone.burnouts.get(key(q, y, r));
      $('#target').textContent += heat?.cooldown
        ? ` · 过热冷却 ${heat.cooldown.toFixed(1)}s`
        : world.state(q, y, r).powered === false
          ? ' · 支撑块供电，已熄灭'
          : ' · 输出 15 · 支撑块供电后熄灭';
    }
    if (isCircuitInput(target?.type) || target?.type === 'redstoneLamp') {
      $('#target').textContent += world.state(target.q, target.y, target.r)
        .powered
        ? ' · 已通电'
        : ' · 未通电';
      $('#target').textContent +=
        target.type === 'stonePressurePlate'
          ? ' · 踩下触发'
          : target.type === 'redstoneLamp'
            ? ' · 连接红石线供电'
            : ' · 右键开关 · Shift 右键在旁建造';
    }
    if (isCampfire(target?.type)) {
      const fire = world.campfires.get(key(target.q, target.y, target.r));
      const slots = fire?.slots.filter(Boolean) || [];
      const next = slots.length
        ? Math.ceil(CAMPFIRE_SECONDS - Math.max(...slots.map((s) => s.elapsed)))
        : 0;
      $('#target').textContent =
        BLOCKS[target.type].name +
        (fire?.lit ? ' · 燃烧' : ' · 已熄灭') +
        ` · 食材 ${slots.length}/6` +
        (next ? ` · 下份 ${next}s` : '') +
        ' · 右键放入 · 空手取回 · 铲子熄灭 / 打火石点燃';
    }
    if (target?.type === 'portal')
      $('#target').textContent =
        '下界传送门 · 站入门中 4 秒穿越 / 右键快速穿越 · 水桶关闭';
    if (target?.type === 'obsidian' && heldItem() === 'flintAndSteel')
      $('#target').textContent += ' · 对准框内右键点燃 · 内部至少 2 × 3 格';
    if (isTrapdoor(target?.type)) {
      const state = world.state(target.q, target.y, target.r);
      $('#target').textContent =
        BLOCKS[target.type].name +
        (state.upper ? ' · 上半格' : ' · 下半格') +
        (state.open ? ' · 已翻起' : ' · 已合上') +
        ' · 右键开关 · Shift 右键在旁建造';
    }
    if (BLOCKS[target?.type]?.pillar)
      $('#target').textContent +=
        ' · ' +
        pillarAxisLabel(world.state(target.q, target.y, target.r).axis) +
        (BLOCKS[target.type].stripped ? ' · 斧头右键去皮' : '');
    if (target?.crop && crops.has(target.crop)) {
      const plant = crops.get(target.crop),
        def = PLANTS[plant.kind];
      $('#target').textContent =
        `${def.name} · ${Math.floor((plant.age / def.seconds) * 100)}% · 右键${plant.age >= def.seconds && !def.tree ? '收获' : '查看 / 骨粉催熟'} · 左键拔除`;
    }
    if (target && isChorus(target.type)) {
      const growth = world.chorus.get(key(target.q, target.y, target.r));
      $('#target').textContent =
        BLOCKS[target.type].name +
        (growth
          ? ` · 生长 ${growth.stage + 1}/5 · 无需水与光照`
          : isChorusFlower(target.type)
            ? ' · 直接采集可再种植'
            : ' · 掉落紫颂果 · 先采花再收枝');
    }
    villagers.frame(dt, time, camera);
    villagerTarget = villagers.target(
      camera,
      Math.min(target?.distance ?? Infinity, boatTarget?.distance ?? Infinity),
    );
    if (villagerTarget) {
      $('#target').classList.remove('hidden');
      $('#target').textContent =
        villagerTarget.village.name +
        ' · ' +
        villagerTarget.village.palette.label +
        ' · ' +
        ROLES[villagerTarget.role].name +
        ' · 右键交易';
    }
    creatureTarget = fauna.target(
      camera,
      Math.min(
        target?.distance ?? Infinity,
        villagerTarget?.distance ?? Infinity,
        boatTarget?.distance ?? Infinity,
      ),
    );
    if (creatureTarget) {
      villagerTarget = null;
      const m = creatureTarget,
        def = MOBS[m.kind];
      $('#target').classList.remove('hidden');
      $('#target').textContent =
        def.name +
        (m.baby ? '幼崽' : '') +
        ' · ' +
        Math.ceil(m.hp) +
        ' / ' +
        def.hp +
        (m.kind === 'skeleton' && m.conversion >= 7
          ? ' · 冻结转化中'
          : m.kind === 'creeper' && m.fuse > 0
            ? ' · 即将爆炸！'
            : m.kind === 'shulker'
              ? (m.peek || 0) < 0.15
                ? ' · 闭壳减伤 / 抵挡箭矢'
                : ' · 开壳射击 · 小心漂浮'
              : def.flying && m.charge > 0
                ? ' · 正在蓄力！'
                : m.kind === 'enderman'
                  ? (m.anger > 0 ? ' · 已被激怒！' : ' · 中立 · 避免直视双眼') +
                    (m.carried ? ' · 搬着' + BLOCKS[m.carried].name : '')
                  : def.ambient
                    ? ' · 洞穴生物 · 靠近会惊飞'
                    : def.hostile
                      ? ''
                      : m.love > 0
                        ? ' · ♥ 寻找伙伴'
                        : m.kind === 'chicken' && m.eggs > 0
                          ? ' · 右键收集鸡蛋 ×' + m.eggs
                          : ' · 右键喂养 / 互动') +
        (m.slowness > 0 ? ` · 缓慢 I ${Math.ceil(m.slowness)} 秒` : '');
    }
    if (boatTarget && !creatureTarget && !villagerTarget) {
      $('#target').classList.remove('hidden');
      $('#target').textContent =
        '橡木船 · ' +
        Math.ceil(boatTarget.boat.health) +
        '/20 · 右键上船 · Shift 右键收回';
    }
    if (fireballs.target(camera, Math.min(4.5, target?.distance ?? Infinity))) {
      $('#target').classList.remove('hidden');
      $('#target').textContent = '恶魂火球 · 空手或近战装备左键击回';
    }
    if (
      shulkerBullets.target(
        camera,
        Math.min(
          4.5,
          target?.distance ?? Infinity,
          creatureTarget?.targetDistance ?? Infinity,
        ),
      )
    ) {
      $('#target').classList.remove('hidden');
      $('#target').textContent = '潜影弹 · 左键、箭矢或投掷物击落 · 盾牌可格挡';
    }
    updateMobs(dt);
    dragonFight.update(dt, camera, creative);
    updateBossHUD();
    const bossTarget = dragonFight.target(
      camera,
      Math.min(
        4.5,
        target?.distance ?? Infinity,
        creatureTarget?.targetDistance ?? Infinity,
        villagerTarget?.distance ?? Infinity,
        boatTarget?.distance ?? Infinity,
      ),
    );
    if (bossTarget) {
      $('#target').classList.remove('hidden');
      $('#target').textContent =
        bossTarget.actor.bossType === 'crystal'
          ? '末地水晶 · 攻击摧毁 · 小心爆炸'
          : `末影龙 · ${Math.ceil(dragonFight.state.hp)} / 200 · ${bossTarget.part === 'head' ? '头部弱点' : '身体减伤'}`;
    }
    drops.update(dt, world, camera, collectDrop);
    experience.update(dt, world, camera, !creative);
    projectiles.update(
      dt,
      world,
      [...creatures, ...dragonFight.combatants, ...shulkerBullets.combatants],
      camera,
      (mob, amount, direction, part, punch, item, owner) => {
        const result = hitMob(
          mob,
          amount,
          direction,
          'arrow',
          part,
          punch,
          owner !== 'dispenser',
        );
        const effect = ARROW_ITEMS[item].effect;
        if (result === 'hit' && effect?.id === 'slowness')
          fauna.slow(mob, effect.time);
        return result;
      },
      collectArrow,
      (amount, source, effect) => {
        const result = hurt(amount, 'projectile', source);
        if (result === 'hit' && effect)
          survival.applyEffect(effect.id, effect.time);
        return result;
      },
      { feet: playerFeet(), height: playerHeight() },
    );
    fireballs.update(dt, world, creatures, camera);
    shulkerBullets.update(
      dt,
      world,
      creatures,
      camera,
      playerFeet(),
      playerHeight(),
      creative,
    );
    throwables.update(
      dt,
      world,
      [...creatures, ...dragonFight.combatants, ...shulkerBullets.combatants],
      camera,
      villagers.residents,
      boats.records,
    );
    if (blockUse) {
      const use = blockUse;
      if (
        !foodInputs.has(use.input) ||
        handRef(use.hand) !== use.ref ||
        handStack(use.hand)?.item !== use.item ||
        foodUse ||
        combat.raised ||
        leftDown
      )
        blockUse = null;
      else if ((use.timer -= dt) <= 0) {
        use.timer = 0.2;
        withUseHand(use.hand, place);
      }
    }
    if (throwHeldItem) {
      if (
        !foodInputs.has(throwHeldItem.input) ||
        handStack(throwHeldItem.hand)?.item !== throwHeldItem.item ||
        foodUse ||
        combat.raised
      )
        throwHeldItem = null;
      else {
        const held = throwHeldItem;
        withUseHand(held.hand, () => {
          if (held.item === 'fireworkRocket') {
            if (rocketCooldown <= 0) useRocket();
          } else if (throwables.ready(held.item)) useThrowable();
        });
      }
    }
    $('#boat-status').classList.toggle('hidden', !boats.riding);
    if (boats.riding)
      $('#boat-status').textContent =
        (boats.riding.afloat
          ? '划船 ' +
            Math.hypot(boats.riding.vx, boats.riding.vz).toFixed(1) +
            ' m/s'
          : '船已搁浅') + ' · W/S 划行 · A/D 转向 · 空格刹船 · Shift 下船';
    $('#combat-status').dataset.fishing = fishing.phase;
    $('#fishing-window').classList.toggle('hidden', fishing.phase !== 'bite');
    $('#fishing-window').value =
      fishing.phase === 'bite' ? fishing.remaining / fishing.biteWindow : 0;
    const bowHand =
      bowUse?.hand ||
      (heldItem() === 'bow'
        ? 'main'
        : pack.gear[4]?.item === 'bow'
          ? 'offhand'
          : null);
    const rodHand =
      fishingUse?.hand ||
      (heldItem() === 'fishingRod'
        ? 'main'
        : pack.gear[4]?.item === 'fishingRod'
          ? 'offhand'
          : null);
    const ammoItem = bowHand ? arrowSlot()?.get()?.item || 'arrow' : null;
    $('#combat-status').textContent = bowHand
      ? (bowUse
          ? '拉弓 ' + Math.round(bowPull(bowCharge) * 100) + '% · 松开发射'
          : '按住右键拉弓') +
        ' · ' +
        (bowHand === 'offhand' ? '副手' : '主手') +
        ' · ' +
        ITEMS[ammoItem].name +
        ' ' +
        (creative ? '∞' : arrowCount(ammoItem)) +
        (enchantmentsOf(handStack(bowHand)?.wear).infinity &&
        ammoItem === 'arrow'
          ? '（无限）'
          : '')
      : rodHand
        ? fishing.status + ' · ' + (rodHand === 'offhand' ? '副手' : '主手')
        : THROWABLES[heldItem()]
          ? throwables.ready(heldItem())
            ? THROWABLES[heldItem()].hint
            : `${ITEMS[heldItem()].name} · 冷却 ${throwables.cooldowns[heldItem()].toFixed(1)} 秒`
          : attackCooldown > 0
            ? '挥击恢复中'
            : '';
    simulationAccumulator += dt;
    if (simulationAccumulator > 0.5) {
      simulationAccumulator = 0;
      syncDecor();
    }
    hudTimer += dt;
    if (hudTimer > 0.5) {
      hudTimer = 0;
      updateHUD();
    }
    mapTimer += dt;
    if (mapTimer > 0.3) {
      mapTimer = 0;
      drawMap($('#minimap'));
    }
  }
  if (
    !document.hidden &&
    (playing ||
      (overlay === '#station-overlay' &&
        (document.querySelector('#station-content [data-inv-slot^="box:"]') ||
          $('#furnace-progress') ||
          $('#brew-progress'))))
  ) {
    updateFurnaces(dt);
    updateBreweries(dt);
    if (!playing) {
      const changes = new Map(),
        steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < steps; i++)
        for (const p of updateRedstone(dt / steps)) changes.set(key(...p), p);
      if (changes.size) graphics.updateCells([...changes.values()]);
      if (currentChest()) updateChestPanel(currentChest());
    }
    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      saveGame();
    }
  }
  const rodHand =
    fishingUse?.hand ||
    (heldItem() === 'fishingRod'
      ? 'main'
      : pack.gear[4]?.item === 'fishingRod'
        ? 'offhand'
        : null);
  const rodTip = (rodHand === 'offhand' ? graphics.offhandHeld : graphics.held)
    ?.fishingTip;
  if (rodTip) rodTip.getWorldPosition(fishingTip);
  else fishingTip.copy(camera.position);
  fishing.render(camera, fishingTip, playing && !!rodHand);
  graphics.bowDraw = bowPull(bowCharge);
  graphics.bowTime = bowCharge;
  graphics.bowHand = bowUse?.hand;
  graphics.heldEnchanted = !!enchantLabel(pack.slots[selected]?.wear);
  graphics.offhandEnchanted = !!enchantLabel(pack.gear[4]?.wear);
  graphics.shieldEnchanted = !!enchantLabel(
    pack.gear[4]?.item === 'shield' ? pack.gear[4].wear : null,
  );
  graphics.mainShieldEnchanted = !!enchantLabel(
    heldItem() === 'shield' ? pack.slots[selected].wear : null,
  );
  graphics.blockingHand = combat.hand;
  graphics.blocking = combat.raised;
  graphics.shieldImpact = combat.impact;
  survivalHUD();
  const night = survival.effects.nightVision?.time || 0;
  graphics.nightVision = Math.min(1, night / 10);
  updateExperienceHUD();
  combatHUD();
  updateFlightHUD();
  graphics.gliding = glider.active;
  graphics.frame(
    playing ? dt : 0,
    time,
    playing,
    moved > 0,
    leftDown,
    weather,
    weatherColumns,
    dt,
    heldItem(),
    pack.gear[4]?.item,
  );
  const weatherCell = worldToAxial(camera.position.x, camera.position.z);
  const localWeather = weatherColumns.get(world, weatherCell.q, weatherCell.r);
  const sheltered =
    localWeather.roof > camera.position.y ||
    !!world.fluids.get(
      weatherCell.q,
      Math.floor(camera.position.y),
      weatherCell.r,
    );
  soundFX.weather(
    dimension === 'overworld' && localWeather.biome !== '沙漠'
      ? weather.rain
      : 0,
    sheltered,
    localWeather.biome === '雪原',
    playing && !overlay,
  );
  if (graphics.weatherEffects.thunder && playing) soundFX.thunder(sheltered);
}
if (readSave()) $('#continue').classList.remove('hidden');
$('#loading').classList.add('hidden');
requestAnimationFrame(frame);

// A development-only fixture API makes gameplay regression checks deterministic.
if (import.meta.env.DEV)
  window.__hexwild = {
    get state() {
      return {
        world,
        inventory,
        tool,
        creative,
        dimension,
        health,
        hunger,
        time,
        crops,
        chests,
        playing,
        target,
        position: camera.position.toArray(),
        hotbar,
      };
    },
    travel,
    lookAt: (q, y, r) => {
      const p = axialToWorld(q, r),
        dx = p.x - camera.position.x,
        dz = p.z - camera.position.z;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(y - camera.position.y, Math.hypot(dx, dz));
      camera.rotation.set(pitch, yaw, 0);
    },
    audio: soundFX,
    start: startGame,
    save: saveGame,
    open: openOverlay,
    close: closeOverlay,
    craft: doCraft,
    interact,
    place,
    eat,
    fluidStep: (ticks = 1) => {
      for (let i = 0; i < ticks; i++) world.fluids.step(0.12);
      flushFluidChanges();
      graphics.fluidRenderer.sync(world, new Set(graphics.chunks.keys()), true);
    },
    selectItem: (id) => {
      if (canEquip(id)) {
        hotbar[selected] = id;
        updateHUD();
      }
    },
    step: (dt) => {
      time += dt;
      for (const [k, plant] of crops) graphics.crop(k, plant);
    },
    give: (id, n) => {
      inventory[id] = n;
      updateHUD();
    },
    selectRecipe: (i) => selectCraftRecipe(i),
    setTarget: (t) => (target = t),
    teleport: (q, y, r) => {
      const p = axialToWorld(q, r);
      world.ensureAround(q, r);
      graphics.sync(q, r, true);
      camera.position.set(p.x, y + playerEyeHeight(), p.z);
      vy = 0;
    },
    setPlaying: (v) => (playing = v),
    setTool: (t) => {
      const id = 'pick' + t;
      if (t) {
        inventory[id] = Math.max(1, inventory[id] || 0);
        hotbar[selected] = id;
      }
      updateHUD();
    },
    damage: hurt,
    villagers,
    graphics,
  };

function restorePreferences() {
  try {
    const p = JSON.parse(localStorage.getItem('hexwild-settings') || '{}');
    if (Number.isFinite(p.sensitivity))
      sensitivity = Math.max(0.5, Math.min(2, p.sensitivity));
    if (Number.isFinite(p.fieldOfView))
      fieldOfView = Math.max(60, Math.min(110, p.fieldOfView));
    $('#fov').value = fieldOfView;
    $('#fov-value').value = fieldOfView + '°';
    if (Number.isFinite(p.volume))
      soundFX.volume = Math.max(0, Math.min(1, p.volume));
    if (typeof p.sound === 'boolean') sound = soundFX.enabled = p.sound;
    if (typeof p.flashes === 'boolean')
      graphics.weatherEffects.flashes = p.flashes;
    $('#lightning-toggle').checked = graphics.weatherEffects.flashes;
    $('#sensitivity').value = sensitivity;
    $('#volume').value = soundFX.volume;
    $('#sound-toggle').textContent = sound ? '开启' : '关闭';
    const legacyQuality = Number(localStorage.getItem('hexwild-quality') ?? 1);
    const quality = [0.65, 1, 1.7].includes(p.quality)
      ? p.quality
      : [0.65, 1, 1.7].includes(legacyQuality)
        ? legacyQuality
        : 1;
    $('#quality').value = quality;
    graphics.setPostOptions(p.post);
    graphics.setQuality(Number($('#quality').value));
  } catch {}
  updatePostControls();
}
function savePreferences() {
  try {
    localStorage.setItem(
      'hexwild-settings',
      JSON.stringify({
        sensitivity,
        fieldOfView,
        volume: soundFX.volume,
        sound,
        flashes: graphics.weatherEffects.flashes,
        quality: Number($('#quality').value),
        post: { ...graphics.postOptions },
      }),
    );
  } catch {}
}
for (const id of ['sensitivity', 'volume', 'fov'])
  $('#' + id).addEventListener('change', savePreferences);
$('#sound-toggle').addEventListener('click', savePreferences);
$('#lightning-toggle').onchange = (e) => {
  graphics.weatherEffects.flashes = e.target.checked;
  savePreferences();
};
document.querySelectorAll('[data-weather]').forEach((button) => {
  button.onclick = () => {
    if (!creative || dimension !== 'overworld') return;
    weather.set(button.dataset.weather, 180);
    toast(
      '天气正转为' + WEATHER[button.dataset.weather] + '，返回世界后逐渐变化。',
    );
    updateHUD();
    saveGame();
  };
});
restorePreferences();
