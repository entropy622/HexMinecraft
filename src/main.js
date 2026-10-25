import { STRUCTURE_NAMES, structureLoot } from './structures.js';
import { FUELS, newFurnace, smeltingRecipe, tickFurnace } from './furnaces.js';
import { furnacePanel, updateFurnacePanel } from './furnace-ui.js';
import { newChest, depositChest, withdrawChest, sortChest } from './chests.js';
import { chestPanel } from './chest-ui.js';
import { features as villageFeatures, ROLES, trade } from './villages.js';
import { Villagers } from './villagers.js';
import { LIQUIDS, fluidHeight } from './fluids.js';
import './style.css';
import * as THREE from 'three';
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
  craft,
  canCraft,
} from './core.js';
import { Fauna } from './fauna.js';
import { ItemDrops } from './item-drops.js';
import { Weather, WeatherColumns, WEATHER } from './weather.js';
import { PLANTS, plantForItem } from './farming-data.js';
import { plantingIssue, growthConditions, treePlan } from './farming.js';
import { facingFromDirection, facingAngle } from './building-shapes.js';
import { INVENTORY_SLOTS, usedSlots, roomFor, stackSize } from './inventory.js';
import { MOBS } from './mob-data.js';
import { Graphics } from './graphics.js';
import { HELD_LIGHTS } from './voxel-light.js';
import { Survival, FOODS } from './survival.js';
import { Combat } from './combat.js';
import { Experience, xpForLevel } from './experience.js';
import { enchantLabel } from './enchanting-data.js';
import { bookshelfPower, enchantOffers } from './enchanting.js';
import { enchantingPanel } from './enchanting-ui.js';
import { World, DIMENSIONS, WORLD_HEIGHT } from './world.js';
import { SAVE_KEY, validateSave } from './save.js';
import { loadTexturePack } from './texture-pack.js';
import { Equipment, miningStats, transferWear } from './equipment.js';
import { ARMOR_SLOTS } from './gear-data.js';
import { Projectiles } from './projectiles.js';
import { Fishing } from './fishing.js';
import { Boats, BOAT_EYE } from './boats.js';
import { Movement } from './movement.js';
import { GameAudio } from './audio.js';
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
  <footer class="landing-footer"><div class="tags"><span><b>⬡</b> 六棱世界</span><span><b>✧</b> 生存与创造</span><span><b>◈</b> 每一面，都有可能</span></div><div class="edition">AN EXPERIMENT IN SIX DIRECTIONS<br>v0.23 — EXPERIENCE AND ENCHANTMENT</div></footer>
 </section>
 <div id="hud" class="hidden">
  <div class="hud-top"><div><div class="wordmark">HEXWILD <small>六野</small></div><div class="world-info" id="world-info"></div></div><div class="world-badge"><span id="dimension-name">主世界</span><strong id="biome-name">青翠平原</strong><span id="weather-hud"></span><div id="compass">N · NE · SE · S · SW · NW</div></div></div>
  <div id="crosshair"></div><div id="mine-progress"><i></i></div><div id="target" class="hidden"></div>
  <div class="bottom-hud"><div id="boat-status" class="hidden"></div><div id="combat-status"></div><div id="attack-meter" role="progressbar" aria-label="挥击恢复" aria-valuemin="0" aria-valuemax="1"></div><div id="shield-status" class="hidden"><span id="shield-label"></span><progress id="shield-ready" max="0.25" value="0" aria-label="举盾准备"></progress></div><progress id="fishing-window" class="hidden" max="1" value="0" aria-label="咬钩收杆剩余时间"></progress><div id="selected-name"></div><div id="survival-status"><div id="air-bar" class="hidden" role="progressbar" aria-label="氧气" aria-valuemin="0" aria-valuemax="15"></div><div id="effect-list"></div></div><div id="use-food" class="hidden"><span id="use-food-name"></span><progress id="use-progress" max="1" value="0" aria-label="食用进度"></progress></div><div class="vitals"><span class="health" id="health"></span><span id="absorption-hud" aria-label="额外吸收生命"></span><span class="tool" id="tool"></span><span class="hunger" id="hunger"></span><span id="armor-hud"></span></div><div id="experience-hud"><b id="experience-level">0</b><progress id="experience-progress" max="1" value="0" aria-label="当前等级经验"></progress></div><div id="hotbar"></div><div class="controls-hint"><span><kbd>WASD</kbd>移动</span><span><kbd>空格</kbd>跳跃</span><span><kbd>左 / 右键</kbd>采集 / 放置</span><span><kbd>E</kbd>交互</span><span><kbd>B</kbd>合成</span><span><kbd>M</kbd>地图</span><span><kbd>ESC</kbd>菜单</span></div></div>
  <div class="hud-left" id="location"></div><canvas id="minimap" width="200" height="220"></canvas>
  <div id="mobile-controls"><div class="mobile-top"><button data-action="craft" aria-label="合成">B</button><button data-action="map" aria-label="地图">M</button><button data-action="pause" aria-label="暂停">Ⅱ</button><button data-action="eat" aria-label="按住食用">F</button></div><div class="dpad"><button data-key="KeyW" aria-label="前进">↑</button><button data-key="KeyA" aria-label="左移">←</button><button data-key="KeyS" aria-label="后退">↓</button><button data-key="KeyD" aria-label="右移">→</button></div><div class="mobile-actions"><button data-action="mine" aria-label="采集">挖</button><button data-action="place" aria-label="放置">放</button><button data-key="Space" aria-label="跳跃">↟</button><button data-key="KeyR" id="mobile-shield" aria-label="按住举盾">盾</button><button data-action="interact" aria-label="交互">E</button><button data-key="ShiftLeft" aria-label="下降或冲刺">⇣</button></div></div>
 </div>
 <div id="pickups" aria-live="polite"></div><div id="travel" aria-live="polite"><span>穿越维度</span></div><div id="underwater"></div><div id="fire-overlay" aria-hidden="true"></div><div id="damage"></div><div id="toast" role="status" aria-live="polite"></div>
 <section id="craft-overlay" class="overlay hidden"><div class="panel"><div class="panel-head"><div><div class="eyebrow">THE HONEYCOMB WORKSHOP</div><h2>蜂巢工坊</h2></div><button class="close" data-close aria-label="关闭合成">×</button></div><div class="craft-layout"><div class="recipe-sidebar"><input id="recipe-search" placeholder="搜索配方…" aria-label="搜索配方"><nav class="recipe-list" id="recipes" aria-label="合成配方"></nav></div><div class="craft-main"><h3 id="recipe-title"></h3><p id="recipe-desc"></p><div class="honeycomb" id="pattern"></div><div class="recipe-cost" id="recipe-cost"></div><button class="primary" id="craft-button">合成</button><p id="station-note"></p></div></div><div class="inventory-section"><div class="section-label">你的背包 <b id="pack-capacity"></b> <span class="tiny">/ 点击选择；点击护甲/盾牌装备；Shift 点击丢出一组</span></div><div class="armor-slots" id="armor-slots"></div><div class="inventory-grid" id="inventory"></div><div class="pack-actions"><button id="drop-held">丢出手持物 ×1</button><button id="drop-mode" aria-pressed="false">点击丢弃：关</button></div><p class="panel-note">Q 丢出 1 件 / Ctrl+Q 丢出一组 · 靠近地面物品自动拾取 · 工具必须手持 · 弓：左键蓄力，松开发射 · 桶：右键/E 装取源或倒出 · E 使用工作台 / 熔炉 / 箱子 / 耕种 · 鱼竿：右键/E 抛线与收杆，左键收起 · 按住 F 食用 · 盾牌：副手装备，按住 R 防御 · 鼠标滚轮或 1–9 切换手持物</p></div></div></section>
 <section id="pause-overlay" class="overlay hidden"><div class="panel pause-panel"><div class="eyebrow">TAKE A BREATH</div><h2 id="pause-title">旷野会等你。</h2><p id="pause-description">旅途已暂歇。世界会记住你留下的每一块砖。</p><div class="pause-actions"><button class="primary" id="resume">回到旷野</button><div class="two-col"><button id="export">导出存档</button><button id="import">导入存档</button></div><div class="two-col"><button id="mode-toggle">切换自由建造</button><button id="respawn">返回出生点</button></div><button id="home">保存并返回首页</button></div><div class="settings-row"><label for="sensitivity">视角灵敏度</label><input id="sensitivity" type="range" min="0.5" max="2" step="0.1" value="1"></div><div class="settings-row"><span>游戏音效</span><button id="sound-toggle">开启</button></div><div class="settings-row"><label for="volume">音效音量</label><input id="volume" type="range" min="0" max="1" step="0.05" value="0.45"></div><div class="settings-row"><label for="lightning-toggle">雷电闪光</label><input id="lightning-toggle" type="checkbox" checked></div><div class="settings-row"><label for="quality">渲染精度</label><select id="quality"><option value="1">均衡</option><option value="0.65">流畅</option><option value="1.7">光影 · 体积雾与泛光</option></select></div><p class="panel-note">光影档增加体积光束，显卡开销较高；均衡与流畅使用轻量高度雾。画质选择会保存在本浏览器。</p><div class="dimension-controls" id="dimension-controls"><span>创造模式 · 维度旅行</span><div><button data-dimension="overworld">主世界</button><button data-dimension="nether">下界</button><button data-dimension="end">末地</button></div><p class="panel-note">生存模式中，在工坊制作传送门，放置后按 E 穿越。返回门自动生成。</p></div><div class="help-grid"><span><kbd>W A S D</kbd>移动 / Shift 冲刺 / Ctrl 慢行防坠</span><span><kbd>空格</kbd>跳跃 / 水中上浮</span><span><kbd>左键长按</kbd>采集 / 攻击</span><span><kbd>右键</kbd>放置方块</span><span><kbd>E</kbd>交互 / 耕种 / 收获</span><span><kbd>B / Tab</kbd>背包与蜂巢合成</span><span><kbd>F / M</kbd>按住食用 / 查看地图</span><span><kbd>Q / Ctrl+Q</kbd>丢出一件 / 一组</span><span><kbd>梯子</kbd>W / 空格上爬 · Shift 下爬 · Ctrl 停住</span><span><kbd>门 / 栅栏门</kbd>E 或右键开关</span><span><kbd>R</kbd>按住举起副手盾牌</span><span><kbd>随身照明</kbd>手持火把、萤灯或发光液体桶</span><span><kbd>创造模式</kbd>空格上升 / Shift 下降</span></div><div id="weather-controls" class="hidden"><span>创造模式 · 天气</span><div class="weather-buttons"><button data-weather="clear">晴朗</button><button data-weather="rain">雨 / 雪</button><button data-weather="storm">雷暴</button></div><p class="panel-note">天气会逐渐过渡，之后继续自动轮换。雪原降雪，沙漠只有阴云；雷电闪光可单独关闭。</p></div><div class="world-form"><label for="seed">新世界种子</label><input id="seed" type="number" min="0" max="999999" value="624"><button id="new-world">创建新世界</button></div><p class="panel-note">自动保存在本浏览器。创建新世界会替换当前存档，可先导出备份。手机：左侧方向键移动，拖动右半屏转动视角。</p><input class="hidden" type="file" id="save-file" accept=".json,application/json"></div></section>
 <section id="map-overlay" class="overlay hidden"><div class="panel map-panel"><div class="panel-head"><div><div class="eyebrow">FIELD NOTES / 无限旷野</div><h2>六野图志</h2></div><button class="close" data-close aria-label="关闭地图">×</button></div><canvas id="world-map" width="700" height="700"></canvas><p class="panel-note">▲ 你的位置　 ◈ 传送门　 ⌂ 村庄　 ◆ 已发现遗迹　 × 上次死亡地点<br>死亡物资在附近加载期间保留 10 分钟；普通掉落 5 分钟，岩浆和虚空会销毁。地图跟随玩家，显示周围已加载区域。不同维度分别保存地形与建筑。</p></div></section>
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
const projectiles = new Projectiles(graphics.scene);
const drops = new ItemDrops(graphics.scene, graphics.textures);
const experience = new Experience(graphics.scene, (levelUp) =>
  soundFX.play(levelUp ? 'levelUp' : 'xp'),
);
const enchantState = { id: null, index: 0, page: 0 };
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
const fishing = new Fishing(
  graphics.scene,
  {
    notice: toast,
    wear: (n) => wearItem('fishingRod', n),
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
let lastDeath = null;
let discardMode = false;
const fauna = new Fauna(graphics.scene, graphics.textures, {
  damage: (amount, source) => hurt(amount, 'combat', source),
  drop: (id, n, position) => drops.spawn(id, n, position),
  experience: (value, position) => awardXP(value, position),
  notice: toast,
  explode,
  fuse: () => beep(75, 0.3, 'sawtooth', 0.04),
  shoot: (from, to) => {
    const aim = to.clone().sub(from);
    const flight = aim.length() / 25;
    aim.y += 6.5 * flight * flight;
    projectiles.shoot(from, aim.normalize(), 0.65, false, 'hostile');
  },
});
let equipment = new Equipment(),
  bowCharge = 0;
let survival = new Survival(),
  foodUse = null,
  survivalSubmerged = false;
const foodInputs = new Set();
const combat = new Combat();
let attackPeriod = 0.45;
const chestState = { amount: 'stack', page: 0, query: '' };
let world = new World(624),
  inventory = {},
  tool = 0,
  creative = false,
  hotbar = [...HOTBAR],
  selected = 0,
  health = 20,
  hunger = 20,
  time = 105;
let crops = new Map(),
  chests = new Map(),
  furnaceAmount = 8,
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
  sound = true,
  stationKey = null,
  moved = 0,
  simulationAccumulator = 0;
const spawn = new THREE.Vector3();
let respawnPoint = null;
let dimension = 'overworld',
  dimensionStates = {},
  hudSignature = '',
  footstepDistance = 0,
  ambienceTimer = 0,
  creatureTarget = null;
graphics.build(world);
try {
  const savedQuality = Number(localStorage.getItem('hexwild-quality') ?? 1);
  const quality = [0.65, 1, 1.7].includes(savedQuality) ? savedQuality : 1;
  $('#quality').value = String(quality);
  graphics.setQuality(quality);
} catch {
  graphics.setQuality(1);
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
}
function beep(freq = 300, duration = 0.06, type = 'sine', volume = 0.035) {
  soundFX.tone(freq, duration, type, volume);
}
function setSpawn() {
  const p = axialToWorld(0, 0);
  spawn.set(p.x, Math.max(4, world.surface(0, 0)) + 0.03, p.z);
}
function playerFeet() {
  return camera.position.y - 1.65;
}
function solidAt(x, y, z) {
  return world.pointSolid(x, y, z);
}
function collides(x, feet, z) {
  if (boats.bodyBlocked(x, feet, z)) return true;
  for (const [dx, dz] of [
    [0, 0],
    [0.24, 0],
    [-0.24, 0],
    [0, 0.24],
    [0, -0.24],
    [0.17, 0.17],
    [-0.17, -0.17],
  ])
    for (const dy of [0.04, 0.85, 1.57])
      if (solidAt(x + dx, feet + dy, z + dz)) return true;
  return false;
}
function safeSpawn() {
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
    blockStates: data.blockStates,
    furnaces: data.furnaces,
    fluids: data.fluids,
    villageExclusions: data.villageExclusions,
    villageFeatures: data.villageFeatures,
    villageTrades: data.villageTrades,
    structureFeatures: data.structureFeatures,
    discoveredStructures: data.discoveredStructures,
    load: false,
  });
  inventory = save ? { ...save.inventory } : { dirt: 12, apple: 3, seed: 3 };
  equipment = new Equipment(save?.equipment);
  survival = new Survival(save?.survival);
  experience.loadPlayer(save?.experience || { seed });
  combat.reset();
  stopEating(true);
  weather = new Weather(save?.weather);
  weatherGrowthTimer = 0;
  graphics.weatherEffects.flash = 0;
  graphics.weatherEffects.nextStrike = 18;
  graphics.weatherEffects.thunderDelay = -1;
  bowCharge = 0;
  projectiles.clear();
  hotbar = save?.hotbar ? [...save.hotbar] : [...HOTBAR];
  selected = 0;
  selectedRecipe = 0;
  health = save?.health ?? 20;
  hunger = save?.hunger ?? 20;
  time = save?.time ?? 105;
  creative = save?.creative ?? mode;
  crops = new Map(data.crops);
  chests = new Map(data.chests);
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
  hudSignature = '';
  $('#landing').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#seed').value = seed;
  updateHUD();
  closeOverlay();
  toast(
    creative
      ? '自由建造 · B 材料库 · 菜单可自由穿越维度'
      : '欢迎来到你的世界。长按左键采集，B 打开背包。',
  );
  saveGame();
}
function captureDimension() {
  dimensionStates[dimension] = {
    ...world.serialize(),
    fauna: fauna.serialize(),
    drops: drops.serialize(),
    experienceOrbs: experience.serialize(),
    boats: boats.serialize(),
    mountedBoat: boats.riding?.id ?? null,
    lastDeath,
    crops: [...crops],
    chests: [...chests],
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
      hexDistance(a.q - s.q, a.r - s.r) < 11 &&
      Math.abs(playerFeet() - s.y) < 7
    ) {
      world.discoveredStructures.add(s.id);
      toast('发现 ' + STRUCTURE_NAMES[s.kind] + ' · 已标记地图');
    }
    for (const p of structureLoot(world, s)) {
      const k = key(p.q, p.y, p.r),
        id = 'chest:' + k;
      if (!world.loaded(p.q, p.r) || world.structureFeatures.has(id)) continue;
      world.structureFeatures.add(id);
      if (world.get(p.q, p.y, p.r) === 'chest' && !chests.has(k))
        chests.set(k, newChest(p.loot));
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
  bowCharge = 0;
  captureDimension();
  boats.load();
  const seed = world.seed;
  world.clearLoaded();
  dimension = to;
  const data = dimensionStates[to] || { edits: [], crops: [], chests: [] };
  world = new World(seed, to, {
    edits: data.edits,
    blockStates: data.blockStates,
    furnaces: data.furnaces,
    fluids: data.fluids,
    villageExclusions: data.villageExclusions,
    villageFeatures: data.villageFeatures,
    villageTrades: data.villageTrades,
    structureFeatures: data.structureFeatures,
    discoveredStructures: data.discoveredStructures,
    load: false,
  });
  crops = new Map(data.crops);
  chests = new Map(data.chests);
  respawnPoint = data.respawn || null;
  let destination = data.position || [0, 0, 0],
    a = worldToAxial(destination[0], destination[2]);
  world.ensureAround(a.q, a.r);
  if (!data.position) {
    const h = Math.max(9, world.terrainHeight(a.q, a.r));
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
    world.set(a.q + 1, h, a.r, to === 'end' ? 'endportal' : 'portal');
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
  bowCharge = 0;
  motion.reset();
  mining = 0;
  graphics.build(world, a.q, a.r);
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
  fauna.load(world, data.fauna);
  weatherColumns.update(1, world);
  drops.load(data.drops);
  experience.load(data.experienceOrbs);
  boats.load(data.boats);
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
  hudSignature = '';
  updateHUD();
  saveGame();
  return true;
}

function saveData() {
  const savedInventory = { ...inventory };
  captureDimension();
  return {
    version: 7,
    dimension,
    dimensions: dimensionStates,
    seed: world.seed,
    inventory: savedInventory,
    equipment: equipment.serialize(),
    survival: survival.serialize(),
    experience: experience.serializePlayer(),
    weather: weather.serialize(),
    creative,
    hotbar,
    position: camera.position.toArray(),
    yaw,
    pitch,
    health,
    hunger,
    time,
    crops: [...crops],
    chests: [...chests],
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
  combat.reset();
  stopEating(true);
  closeChestLid();
  soundFX.weather(0, false, false, false);
  leftDown = false;
  keys.clear();
  bowCharge = 0;
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
  closeChestLid();
  if (hasGame && overlay === '#station-overlay' && $('#furnace-progress'))
    saveGame();
  discardMode = false;
  $('#drop-mode').textContent = '点击丢弃：关';
  $('#drop-mode').setAttribute('aria-pressed', 'false');
  document
    .querySelectorAll('.overlay')
    .forEach((e) => e.classList.add('hidden'));
  overlay = null;
  if (hasGame) {
    fromMenu = false;
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
function renderCraft() {
  containInventory();
  const station = creative || nearbyType('workbench');
  $('#recipes').innerHTML = RECIPES.map(
    (r, i) =>
      `<button class="recipe ${i === selectedRecipe ? 'active' : ''}" data-recipe="${i}">${icon(r.id)}<span>${ITEMS[r.id].name}<small>${r.station ? '工作台配方' : '随身合成'} · ×${r.count}</small></span></button>`,
  ).join('');
  const recipe = RECIPES[selectedRecipe];
  $('#recipe-title').textContent = recipe.title;
  $('#recipe-desc').textContent = recipe.desc;
  $('#pattern').innerHTML = recipe.pattern
    .map(
      (id) =>
        `<div class="hex-cell ${id && (inventory[id] || 0) < recipe.cost[id] && !creative ? 'missing' : ''}" title="${id ? ITEMS[id].name : '空位'}">${id ? icon(id) : ''}</div>`,
    )
    .join('');
  $('#recipe-cost').innerHTML = Object.entries(recipe.cost)
    .map(
      ([id, n]) =>
        `<span class="${(inventory[id] || 0) < n && !creative ? 'missing' : ''}">${ITEMS[id].name} ${creative ? '∞' : inventory[id] || 0} / ${n}</span>`,
    )
    .join('');
  $('#craft-button').disabled =
    !creative && !canCraft(recipe, inventory, tool, station);
  $('#craft-button').textContent =
    `合成 ${ITEMS[recipe.id].name} ×${recipe.count}`;
  $('#station-note').textContent =
    recipe.station && !station
      ? '需要在工作台 5 格范围内'
      : station
        ? '六格环绕，一格居中。每次合成，都是新的可能。'
        : '随身合成 · 制作工作台以解锁更多配方';
  $('#armor-slots').innerHTML = Object.entries(ARMOR_SLOTS)
    .map(([slot, name]) => {
      const id = equipment.armor[slot];
      const enchant = enchantLabel(equipment.wear[id]?.[0]);
      return `<button class="${enchant ? 'enchanted' : ''}" data-unequip="${slot}" title="${id ? '点击卸下 ' + ITEMS[id].name + (enchant ? ' · ' + enchant : '') : name}">${id ? icon(id) : '<span class="empty-armor">◇</span>'}<span>${id ? ITEMS[id].name : name}</span>${id ? durabilityBar(id) : ''}</button>`;
    })
    .join('');
  $('#armor-slots').innerHTML +=
    `<button class="${Object.keys(equipment.tags(equipment.offhand)).length ? 'enchanted' : ''}" data-unequip-offhand title="${equipment.offhand ? '点击卸下盾牌 · ' + (enchantLabel(equipment.wear[equipment.offhand]?.[0]) || '未附魔') : '点击背包中的盾牌装备'}">${equipment.offhand ? icon(equipment.offhand) : '<span class="empty-armor">⬡</span>'}<span>副手${equipment.offhand ? ' · 盾牌' : ''}</span>${equipment.offhand ? durabilityBar(equipment.offhand) : ''}</button>`;
  $('#inventory').innerHTML = Object.entries(ITEMS)
    .filter(
      ([id]) =>
        (creative &&
          (canEquip(id) || ITEMS[id].armorSlot) &&
          id !== 'bedrock') ||
        (inventory[id] || 0) > 0,
    )
    .flatMap(([id, item]) =>
      Array.from(
        { length: creative ? 1 : Math.ceil(inventory[id] / stackSize(id)) },
        (_, index) => [id, item, index],
      ),
    )
    .map(
      ([id, item, index]) =>
        `<button class="inv-item ${enchantLabel(equipment.wear[id]?.[index]) ? 'enchanted' : ''} ${hotbar[selected] === id && index === 0 ? 'selected' : ''}" data-item="${id}" data-index="${index}" title="${item.name}${enchantLabel(equipment.wear[id]?.[index]) ? ' · ' + enchantLabel(equipment.wear[id][index]) : ''}${FOODS[id] ? ' · 饱食 +' + FOODS[id].food + ' · 饱和 +' + FOODS[id].saturation : ''} · 点击选择；Shift 点击丢出一组${item.durability ? ' · 耐久 ' + equipment.remaining(id, index) + '/' + item.durability : ''}">${icon(id)}<span>${item.name}</span><b>${creative ? '∞' : Math.min(stackSize(id), inventory[id] - index * stackSize(id))}</b>${item.durability && !creative ? '<i class="durability"><i style="width:' + (equipment.remaining(id, index) / item.durability) * 100 + '%;background:#82bd58"></i></i>' : ''}${index === 0 && item.armorSlot && equipment.armor[item.armorSlot] === id ? '<small>已穿戴</small>' : ''}${index === 0 && item.offhand && equipment.offhand === id ? '<small>副手中</small>' : ''}</button>`,
    )
    .join('');
  if (!creative)
    $('#inventory').innerHTML +=
      '<span class="inv-item empty-slot" aria-hidden="true"></span>'.repeat(
        Math.max(0, INVENTORY_SLOTS - usedSlots(inventory)),
      );
  $('#pack-capacity').textContent = creative
    ? '无限材料'
    : `${usedSlots(inventory)} / ${INVENTORY_SLOTS} 格`;
}
function doCraft() {
  const recipe = RECIPES[selectedRecipe];
  if (
    ITEMS[recipe.id].durability &&
    (inventory[recipe.id] || 0) + recipe.count > 256
  )
    return;
  if (creative)
    inventory[recipe.id] = (inventory[recipe.id] || 0) + recipe.count;
  else if (!craft(recipe, inventory, tool, nearbyType('workbench'))) return;

  if (ITEMS[recipe.id].offhand) {
    if (!equipment.offhand) equipment.equip(recipe.id, inventory, creative);
  } else if (canEquip(recipe.id) && !hotbar.includes(recipe.id))
    hotbar[selected] = recipe.id;
  soundFX.play('craft');
  graphics.swing();
  toast(`已制作 ${ITEMS[recipe.id].name} ×${recipe.count}`);
  renderCraft();
  updateHUD();
  saveGame();
}
function heldItem() {
  const id = hotbar[selected];
  return creative || inventory[id] > 0 ? id : null;
}
function durabilityBar(id) {
  if (!ITEMS[id]?.durability || creative || !inventory[id]) return '';
  const ratio = equipment.remaining(id) / ITEMS[id].durability;
  return `<span class="durability"><i style="width:${ratio * 100}%;background:hsl(${ratio * 110} 70% 48%)"></i></span>`;
}
function wearItem(id, amount = 1) {
  if (equipment.damage(id, amount, inventory, creative)) {
    toast(
      ITEMS[id].name +
        '损坏了' +
        (inventory[id] > 0 ? ' · 已换用备用装备' : ''),
    );
    soundFX.play('break', 'glass');
  }
  updateHUD();
}
function updateHUD() {
  containInventory();
  equipment.sync(inventory, creative);
  graphics.shieldEquipped = !!equipment.offhand;
  if (heldItem() !== 'bow') bowCharge = 0;
  if (heldItem() !== 'fishingRod') fishing.clear();
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
    hotbar,
    selected,
    creative,
    hotbar.map((id) => inventory[id] || 0),
    equipment.wear,
  ]);
  if (hudSignature !== signature) {
    hudSignature = signature;
    $('#hotbar').innerHTML = hotbar
      .map(
        (id, i) =>
          `<button class="slot ${i === selected ? 'active' : ''} ${Object.keys(equipment.tags(id)).length ? 'enchanted' : ''}" data-slot="${i}" aria-label="${i + 1} ${ITEMS[id].name} ${creative ? '无限' : inventory[id] || 0} ${enchantLabel(equipment.wear[id]?.[0])}"><span class="slot-inner">${icon(id)}</span><span class="num">${i + 1}</span><span class="count">${creative ? '∞' : inventory[id] || 0}</span>${durabilityBar(id)}</button>`,
      )
      .join('');
  }
  const selectedEnchant = enchantLabel(equipment.wear[heldItem()]?.[0]);
  $('#selected-name').textContent =
    ITEMS[hotbar[selected]].name +
    (selectedEnchant ? ' · ' + selectedEnchant : '');
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
      ? `${equipment.remaining(held)} / ${ITEMS[held].durability}`
      : HELD_LIGHTS[held]
        ? '随身照明'
        : '';
  const a = worldToAxial(camera.position.x, camera.position.z),
    phase = time % 600;
  $('#world-info').textContent =
    `第 ${Math.floor(time / 600) + 1} 天 / ${phase < 270 ? '日光' : phase < 330 ? '黄昏' : phase < 570 ? '星夜' : '黎明'} · ${creative ? '创造' : '生存'}`;
  $('#location').innerHTML =
    `${DIMENSIONS[dimension].name} · 种子 ${world.seed}<br>Q ${a.q} / R ${a.r} / Y ${Math.floor(playerFeet())}<br>${creative ? '空格 ↑ · Shift ↓' : '按住 F 食用 · Shift 冲刺'}`;
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
  $('#biome-name').textContent = settlement?.name || world.biome(a.q, a.r);
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
  graphics.setHeld(foodUse?.item || heldItem());
  graphics.heldEnchanted =
    !foodUse && Object.keys(equipment.tags(heldItem())).length > 0;
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
  const taken = Math.min(
    n,
    creative
      ? (ITEMS[id]?.durability ? 256 : 1e6) - (inventory[id] || 0)
      : roomFor(inventory, id),
  );
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
  const n = Math.min(
    d.count,
    creative
      ? (ITEMS[d.item]?.durability ? 256 : 1e6) - (inventory[d.item] || 0)
      : roomFor(inventory, d.item),
  );
  if (capacityOnly || n <= 0) return Math.max(0, n);
  // Transfer from a copy: the entity slices its remaining durability after collection.
  transferWear(
    structuredClone(d.wear),
    equipment.wear,
    d.item,
    n,
    d.count,
    inventory[d.item] || 0,
  );
  inventory[d.item] = (inventory[d.item] || 0) + n;
  pickupNotice(d.item, n);
  beep(720 + Math.random() * 180, 0.06, 'sine', 0.025);
  updateHUD();
  return n;
}
function containInventory() {
  if (creative || usedSlots(inventory) <= INVENTORY_SLOTS) return;
  // Also covers crafting, trading and bucket swaps that change stack occupancy.
  let remaining = INVENTORY_SLOTS;
  for (const [id, count] of Object.entries(inventory)) {
    const keep = Math.min(count, remaining * stackSize(id));
    remaining -= Math.ceil(keep / stackSize(id));
    if (keep < count) {
      const wear = ITEMS[id]?.durability
        ? { [id]: (equipment.wear[id] || []).slice(keep) }
        : {};
      drops.spawn(
        id,
        count - keep,
        [camera.position.x, playerFeet() + 0.5, camera.position.z],
        wear,
      );
      inventory[id] = keep;
      if (equipment.wear[id])
        equipment.wear[id].length = Math.min(keep, equipment.wear[id].length);
    }
  }
  toast('背包容量不足，多余物品已落在脚边。');
}
function throwItem(wholeStack = false, explicitId = null, offset = 0) {
  const id = explicitId || heldItem();
  if (!id || !(inventory[id] > 0)) return;
  const n = Math.min(inventory[id] - offset, wholeStack ? stackSize(id) : 1),
    wear = {};
  if (n <= 0) return;
  if (ITEMS[id].durability) {
    const values = Array.from(
      { length: inventory[id] },
      (_, i) => equipment.wear[id]?.[i] ?? ITEMS[id].durability,
    );
    wear[id] = values.splice(offset, n);
    equipment.wear[id] = values;
  }
  inventory[id] -= n;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const p = camera.position.clone();
  drops.spawn(id, n, p.toArray(), wear, [
    direction.x * 5,
    direction.y * 3 + 2,
    direction.z * 5,
  ]);
  updateHUD();
  if (overlay === '#craft-overlay') renderCraft();
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
    stats = miningStats(target.type, held, equipment.tags(held));
  if (data.hardness === Infinity) {
    mining = 0;
    return;
  }
  if (!creative && (data.tool || 0) > stats.tier) {
    mining = 0;
    if (leftDown && miningKey !== key(target.q, target.y, target.r)) {
      toast(`开采${data.name}需要${ITEMS['pick' + data.tool].name}`);
      miningKey = key(target.q, target.y, target.r);
    }
    return;
  }
  const k = key(target.q, target.y, target.r);
  if (k !== miningKey) {
    mining = 0;
    miningKey = k;
  }
  mining += dt * (creative ? 12 : stats.speed);
  $('#mine-progress i').style.width =
    `${Math.min(100, (mining / data.hardness) * 100)}%`;
  if (mining < data.hardness) return;
  const { q, y, r, type } = target;
  const natural = !world.edits.has(k);
  if (BLOCKS[type].shape) {
    removeBuilding(q, y, r, !creative);
    wearItem(held);
    mining = 0;
    target = null;
    return;
  }
  if (type === 'chest') syncDecor();
  world.set(q, y, r, null);
  graphics.updateBlock(q, y, r);
  graphics.burst(q, y, r, data.color);
  soundFX.play('break', type);
  wearItem(held, ITEMS[held]?.kind === 'sword' ? 2 : 1);
  if (!creative) {
    dropAt(
      data.drop || type,
      type === 'lapisOre' ? 4 + Math.floor(Math.random() * 6) : 1,
      q,
      y,
      r,
    );
    if (natural) {
      const reward = {
        coal: [0, 2],
        diamond: [3, 7],
        lapisOre: [2, 5],
        crystal: [2, 5],
        spawner: [15, 43],
      }[type];
      if (reward)
        awardXP(
          reward[0] + Math.floor(Math.random() * (reward[1] - reward[0] + 1)),
          [axialToWorld(q, r).x, y + 0.5, axialToWorld(q, r).z],
        );
    }
    if (type === 'leaves') {
      if (Math.random() < 0.3) dropAt('apple', 1, q, y, r);
      if (Math.random() < 0.45) dropAt('seed', 1, q, y, r);
      if (Math.random() < 0.2) dropAt('sapling', 1, q, y, r);
    }
    if (type === 'grass' && Math.random() < 0.35) dropAt('seed', 1, q, y, r);
    survival.exhaust(0.02);
  }
  if (crops.has(k)) {
    harvestPlant(k, true);
  }
  spillChest(k);
  spillFurnace(k);
  mining = 0;
  target = null;
}
function useBucket() {
  const id = hotbar[selected],
    kind = ITEMS[id]?.bucket;
  if (!kind) return false;
  if (!target) {
    toast('对准液体源装桶，或对准方块倒出液体。');
    return true;
  }
  if (!creative && (inventory[id] || 0) < 1) {
    toast('背包里没有这个桶。');
    return true;
  }
  let next;
  if (kind === 'empty') {
    if (!target.fluid) {
      toast('空桶需要对准液体源。');
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
  if (!creative) {
    inventory[id]--;
    inventory[next] = (inventory[next] || 0) + 1;
    hotbar[selected] = next;
  } else if (kind === 'empty') hotbar[selected] = next;
  flushFluidChanges();
  graphics.fluidRenderer.sync(world, new Set(graphics.chunks.keys()), true);
  soundFX.play('splash');
  graphics.swing();
  updateHUD();
  saveGame();
  return true;
}
function flushFluidChanges() {
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
  if (keys.has('ControlLeft') || keys.has('ControlRight')) {
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
  if (heldItem() !== 'boat') return false;
  if (boats.riding) {
    toast('先下船，再放置另一艘船。');
    return true;
  }
  if (!target?.fluid || target.type !== 'water') {
    toast('对准水面右键 / E 放船。');
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
  if (!creative) inventory.boat--;
  soundFX.play('splash');
  graphics.swing();
  updateHUD();
  saveGame();
  toast('已放船 · 对准船按 E 乘坐 · Ctrl+E 收回');
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
  if (heldItem() !== 'fishingRod') return false;
  fishing.act(world, camera, weather.rain);
  graphics.swing();
  saveGame();
  return true;
}
function place() {
  if (!playing) return;
  if (combat.raised) return;
  if (foodUse) stopEating();
  if (useFishingRod() || useBoatItem()) return;
  if (
    target &&
    ['door', 'doorTop', 'gate'].includes(target.type) &&
    !keys.has('ControlLeft') &&
    !keys.has('ControlRight')
  ) {
    toggleBuilding(target.q, target.y, target.r);
    return;
  }
  if (interactCreature() || drinkMilk() || useGoldenApple()) return;
  if (heldItem() === 'boneMeal' && target) {
    interact();
    return;
  }
  if (plantForItem(heldItem()) && target) {
    interact();
    return;
  }
  if (FOODS[heldItem()]) {
    eat(foodInputs.has('mouse') ? 'mouse' : 'tap');
    return;
  }
  if (useBucket()) return;
  if (!target || !BLOCKS[hotbar[selected]]) return;
  if (BLOCKS[hotbar[selected]].shape) {
    placeBuilding(hotbar[selected], target.place);
    return;
  }
  const { q, y, r } = target.place,
    id = hotbar[selected];
  if (y < 1 || y >= WORLD_HEIGHT) {
    toast('建造高度为 1–63 格，水平方向可以一直探索。');
    return;
  }
  if (world.get(q, y, r)) return;
  if (!creative && (inventory[id] || 0) <= 0) {
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
  if (id === 'furnace' || id === 'chest') {
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
  if (!creative) inventory[id]--;
  graphics.updateBlock(q, y, r);
  if (id === 'chest') chests.set(key(q, y, r), newChest());
  soundFX.play('place', id);
  graphics.swing();
  updateHUD();
}
function fullSupport(q, y, r) {
  const type = world.get(q, y, r);
  return !!type && !BLOCKS[type].nonSolid && !BLOCKS[type].shape;
}
function placeBuilding(type, p) {
  const { q, y, r } = p;
  if (y < 1 || y >= 63 || (!creative && !(inventory[type] > 0))) return;
  let facing = facingFromDirection(-Math.sin(yaw), -Math.cos(yaw));
  if (type === 'door' && !fullSupport(q, y - 1, r)) {
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
  const cells =
    type === 'door'
      ? [
          [q, y, r, 'door'],
          [q, y + 1, r, 'doorTop'],
        ]
      : [[q, y, r, type]];
  if (
    cells.some(
      ([a, b, c]) => world.get(a, b, c) || world.fluids.get(a, b, c),
    ) ||
    (['fence', 'gate'].includes(type) &&
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
  world.setState(q, y, r, { facing, open: false });
  if (collides(camera.position.x, playerFeet(), camera.position.z)) {
    for (const [a, b, c] of cells) world.set(a, b, c, null, false);
    world.blockStates.delete(key(q, y, r));
    toast('这里会挡住你，退开一点再放置。');
    return;
  }
  for (const [a, b, c, t] of cells) world.set(a, b, c, t);
  if (crops.has(key(q, y - 1, r))) harvestPlant(key(q, y - 1, r), true, 3);
  if (!creative) inventory[type]--;
  graphics.updateBlock(q, y, r);
  graphics.swing();
  soundFX.play('place', 'wood');
  updateHUD();
}
function removeBuilding(q, y, r, drop = true) {
  const original = world.get(q, y, r);
  if (!BLOCKS[original]?.shape) return;
  if (original === 'doorTop' && world.get(q, y - 1, r) === 'door') y--;
  const type = world.get(q, y, r),
    item = type === 'doorTop' ? 'door' : type;
  world.set(q, y, r, null);
  if (type === 'door' && world.get(q, y + 1, r) === 'doorTop')
    world.set(q, y + 1, r, null);
  graphics.updateBlock(q, y, r);
  if (drop) dropAt(item, 1, q, y, r);
  soundFX.play('break', 'wood');
}
function toggleBuilding(q, y, r, open = null) {
  if (world.get(q, y, r) === 'doorTop') y--;
  const old = world.state(q, y, r),
    next = { ...old, open: open ?? !old.open };
  if (next.open === old.open) return;
  world.setState(q, y, r, next);
  const center = axialToWorld(q, r);
  const blocked =
    collides(camera.position.x, playerFeet(), camera.position.z) ||
    [...creatures, ...villagers.residents.values()].some(
      (m) =>
        Math.hypot(m.mesh.position.x - center.x, m.mesh.position.z - center.z) <
          3 &&
        [
          [0, 0],
          [0.25, 0],
          [-0.25, 0],
          [0, 0.25],
          [0, -0.25],
        ].some(([dx, dz]) =>
          world.pointSolid(
            m.mesh.position.x + dx,
            m.mesh.position.y + 0.3,
            m.mesh.position.z + dz,
          ),
        ),
    );
  if (blocked) {
    world.setState(q, y, r, old);
    toast('门口有人或动物，先让出空间。');
    return;
  }
  graphics.updateBlock(q, y, r);
  soundFX.play(next.open ? 'doorOpen' : 'doorClose', 'wood');
}
function maintainBuildings() {
  for (const k of [...world.buildings]) {
    const [q, y, r] = k.split(',').map(Number),
      type = world.get(q, y, r);
    if (
      type === 'door' &&
      (!fullSupport(q, y - 1, r) || world.get(q, y + 1, r) !== 'doorTop')
    )
      removeBuilding(q, y, r);
    else if (type === 'doorTop' && world.get(q, y - 1, r) !== 'door')
      removeBuilding(q, y, r);
    else if (type === 'ladder') {
      const [dq, dr] = DIRECTIONS[world.state(q, y, r).facing];
      if (!world.loaded(q + dq, r + dr)) continue;
      if (!fullSupport(q + dq, y, r + dr)) removeBuilding(q, y, r);
    }
  }
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
    if (world.get(a.q, y, a.r) !== 'ladder') continue;
    const angle = facingAngle(world.state(a.q, y, r).facing);
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
  const occupied = (a, b, c) => {
    const p = axialToWorld(a, c);
    if (
      Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 1.25 &&
      b < camera.position.y + 0.15 &&
      b + 1 > playerFeet()
    )
      return true;
    return creatures.some(
      (m) =>
        Math.hypot(p.x - m.mesh.position.x, p.z - m.mesh.position.z) < 1.3 &&
        b < m.mesh.position.y + MOBS[m.kind].height &&
        b + 1 > m.mesh.position.y,
    );
  };
  const cells = treePlan(world, q, y, r, occupied);
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
function interactPlant(k) {
  const [q, y, r] = k.split(',').map(Number),
    plant = crops.get(k);
  if (plant) {
    const def = PLANTS[plant.kind];
    if (heldItem() === 'boneMeal') {
      if (def.tree) {
        if (!growTree(k)) {
          toast('树苗上方需要六格高度、两格树冠空间，且不能挡住玩家或动物。');
          return true;
        }
      } else if (plant.age < def.seconds) {
        if (plantingIssue(world, plant.kind, q, y, r)) {
          toast('先恢复植物需要的土地和水。');
          return true;
        }
        plant.age = def.seconds;
        graphics.crop(k, plant);
      } else {
        toast('作物已成熟，换下骨粉后按 E 收获。');
        return true;
      }
      if (!creative) inventory.boneMeal--;
      updateHUD();
      toast(def.tree ? '树苗长成了橡树。' : def.name + '已成熟，按 E 收获。');
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
  const kind = plantForItem(heldItem());
  if (!kind) return false;
  const issue = plantingIssue(world, kind, q, y, r);
  if (issue) {
    toast(issue);
    return true;
  }
  crops.set(k, { kind, age: 0 });
  if (!creative) inventory[PLANTS[kind].seed]--;
  graphics.crop(k, crops.get(k));
  soundFX.play('place', 'grass');
  updateHUD();
  toast(
    '种下' + PLANTS[kind].name + ' · ' + cropConditions(k, crops.get(k)).reason,
  );
  return true;
}
function interact() {
  if (!playing) return;
  combat.reset();
  if (foodUse) stopEating();
  if (boats.riding && heldItem() === 'fishingRod') {
    useFishingRod();
    return;
  }
  if (interactBoat() || useFishingRod() || useBoatItem()) return;
  if (interactCreature()) return;
  const contextual =
    villagerTarget ||
    (target &&
      ([
        'door',
        'doorTop',
        'gate',
        'ladder',
        'portal',
        'endportal',
        'bed',
        'workbench',
        'furnace',
        'enchantingTable',
        'chest',
        'farmland',
      ].includes(target.type) ||
        (plantForItem(heldItem()) && ['grass', 'dirt'].includes(target.type))));
  if (FOODS[heldItem()] && !contextual) {
    eat(foodInputs.has('mouse') ? 'mouse' : 'tap');
    return;
  }
  if (villagerTarget) {
    tradingWith = villagerTarget;
    openOverlay('#station-overlay');
    renderTrade();
    return;
  }
  if (useBucket()) return;
  if (!target) return;
  const { q, y, r, type } = target,
    k = key(q, y, r);
  if (['door', 'doorTop', 'gate'].includes(type)) {
    toggleBuilding(q, y, r);
    return;
  }
  if (type === 'ladder') {
    toast('贴近梯子：W / 空格向上，Shift 向下，Ctrl 停住。');
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
  if (type === 'furnace') {
    stationKey = k;
    openOverlay('#station-overlay');
    renderFurnace();
    return;
  }
  if (type === 'enchantingTable') {
    if (world.solid(q, y + 1, r)) {
      toast('先清理附魔台上方的空间。');
      return;
    }
    stationKey = k;
    enchantState.id = ITEMS[heldItem()]?.durability ? heldItem() : null;
    enchantState.index = 0;
    enchantState.page = 0;
    openOverlay('#station-overlay');
    renderEnchanting();
    return;
  }
  if (type === 'spawner') {
    toast('在五格内放置火把或萤灯压制刷怪，也可用石镐拆除。');
    return;
  }
  if (type === 'chest') {
    if (world.solid(q, y + 1, r)) {
      toast('箱盖上方被挡住了，先清理上方一格。');
      return;
    }
    syncDecor();
    stationKey = k;
    chestState.page = 0;
    chestState.query = '';
    openOverlay('#station-overlay');
    graphics.chestModels.openKey = k;
    soundFX.play('chestOpen');
    renderChest();
    return;
  }
  if (interactPlant(k)) return;
  if (['grass', 'dirt', 'farmland'].includes(type)) {
    if (type === 'farmland') {
      toast('手持麦种、胡萝卜或马铃薯，按 E 或右键播种。');
      return;
    }
    if (!creative && ITEMS[heldItem()]?.kind !== 'hoe') {
      toast('手持锄头按 E 翻耕；树苗可直接种在泥土或草地上。');
      return;
    }
    if (world.get(q, y + 1, r) || world.fluids.get(q, y + 1, r)) {
      toast('先清理土地上方的空间。');
      return;
    }
    world.set(q, y, r, 'farmland');
    wearItem(heldItem());
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
function renderEnchanting() {
  if (
    !stationKey ||
    world.get(...stationKey.split(',').map(Number)) !== 'enchantingTable'
  )
    return;
  const [q, y, r] = stationKey.split(',').map(Number);
  const shelves = bookshelfPower(world, q, y, r);
  $('#station-title').textContent = '六棱附魔台';
  $('#station-content').innerHTML = enchantingPanel(
    inventory,
    equipment,
    experience,
    shelves,
    (experience.seed + world.seed) % 1e9,
    enchantState,
    creative,
  );
}
$('#station-content').addEventListener('click', (e) => {
  const page = e.target.closest('[data-enchant-page]');
  if (page && !page.disabled) {
    enchantState.page = Number(page.dataset.enchantPage);
    renderEnchanting();
    return;
  }
  const select = e.target.closest('[data-enchant-item]');
  if (select) {
    enchantState.id = select.dataset.enchantItem;
    enchantState.index = Number(select.dataset.enchantCopy);
    renderEnchanting();
  }
  const button = e.target.closest('[data-enchant-offer]');
  if (
    !button ||
    button.disabled ||
    !stationKey ||
    world.get(...stationKey.split(',').map(Number)) !== 'enchantingTable'
  )
    return;
  const { id, index } = enchantState;
  if (!(inventory[id] > index) || Object.keys(equipment.tags(id, index)).length)
    return;
  const [q, y, r] = stationKey.split(',').map(Number),
    shelves = bookshelfPower(world, q, y, r);
  const offer = enchantOffers(
    id,
    (experience.seed + world.seed) % 1e9,
    shelves,
  )[Number(button.dataset.enchantOffer)];
  if (
    !offer?.available ||
    (!creative &&
      (experience.level < offer.levels || (inventory.lapis || 0) < offer.cost))
  )
    return;
  if (!creative) {
    inventory.lapis -= offer.cost;
    experience.spend(offer.cost);
  } else experience.seed = (experience.seed + 1) % 1e9;
  equipment.enchant(id, index, offer.enchants);
  renderEnchanting();
  updateHUD();
  saveGame();
  soundFX.play('enchant');
  toast(ITEMS[id].name + ' · ' + enchantLabel(equipment.wear[id][index]));
});
function currentFurnace() {
  if (
    !stationKey ||
    world.get(...stationKey.split(',').map(Number)) !== 'furnace'
  )
    return null;
  if (!world.furnaces.has(stationKey))
    world.furnaces.set(stationKey, newFurnace());
  return world.furnaces.get(stationKey);
}
function renderFurnace() {
  const f = currentFurnace();
  if (!f) return;
  $('#station-title').textContent = '六棱熔炉';
  $('#station-content').innerHTML = furnacePanel(
    inventory,
    creative,
    furnaceAmount,
  );
  updateFurnacePanel(f);
}
function transferFurnace(slot, id = null) {
  const f = currentFurnace();
  if (!f || !['input', 'fuel', 'output'].includes(slot)) return;
  const old = f[slot];
  if (id) {
    if (
      slot === 'output' ||
      (slot === 'input' ? !smeltingRecipe(id) : !FUELS[id])
    )
      return;
    if (old && old.item !== id) {
      toast('先取出槽内的物品。');
      return;
    }
    const n = Math.min(
      furnaceAmount,
      id === 'lavaBucket' ? 1 : 64 - (old?.count || 0),
      creative ? Infinity : inventory[id] || 0,
    );
    if (n <= 0 || (id === 'lavaBucket' && old)) return;
    f[slot] = { item: id, count: (old?.count || 0) + n };
    if (!creative) inventory[id] -= n;
    if (slot === 'input' && !old) f.progress = 0;
  } else {
    if (!old) return;
    const n = Math.min(
      furnaceAmount,
      old.count,
      creative ? Infinity : roomFor(inventory, old.item),
    );
    if (!n) {
      toast('背包已满，先腾出空间。');
      return;
    }
    if (slot === 'output') {
      const share = ((f.xp || 0) * n) / old.count;
      f.xp = Math.max(0, (f.xp || 0) - share);
      awardXP(share, [
        camera.position.x,
        playerFeet() + 0.5,
        camera.position.z,
      ]);
    }
    inventory[old.item] = (inventory[old.item] || 0) + n;
    old.count -= n;
    if (!old.count) {
      f[slot] = null;
      if (slot === 'input') f.progress = 0;
    }
  }
  renderFurnace();
  updateHUD();
  saveGame();
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
    if (world.get(q, y, r) !== 'furnace') {
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
function closeChestLid() {
  if (!graphics.chestModels.openKey) return;
  graphics.chestModels.openKey = null;
  soundFX.play('chestClose');
}
function currentChest() {
  if (
    !stationKey ||
    world.get(...stationKey.split(',').map(Number)) !== 'chest'
  )
    return null;
  if (!chests.has(stationKey)) chests.set(stationKey, newChest());
  return chests.get(stationKey);
}
function renderChest() {
  const chest = currentChest();
  if (!chest) return;
  const active = document.activeElement;
  const searchFocus = active?.id === 'chest-search';
  const selection = searchFocus
    ? [active.selectionStart, active.selectionEnd]
    : null;
  const panel = $('#station-overlay .panel'),
    scroll = panel.scrollTop;
  $('#station-title').textContent = '六棱储物箱';
  $('#station-content').innerHTML = chestPanel(
    chest,
    inventory,
    equipment.wear,
    chestState,
    creative,
  );
  if (searchFocus) {
    $('#chest-search').focus({ preventScroll: true });
    $('#chest-search').setSelectionRange(...selection);
  } else if (active?.matches('[data-chest-side]')) {
    const next =
      $(
        '#station-content [data-chest-side="' +
          active.dataset.chestSide +
          '"][data-index="' +
          active.dataset.index +
          '"]',
      ) || $('[data-chest-action="take-all"]');
    next?.focus({ preventScroll: true });
  }
  panel.scrollTop = scroll;
}
function finishChestTransfer(moved) {
  equipment.sync(inventory, creative);
  renderChest();
  updateHUD();
  saveGame();
  if (moved) soundFX.play('pickup');
  else toast('空间不足，或没有可转移的物品。');
}
function transferChestButton(button, event, single = false) {
  const chest = currentChest();
  if (!chest) return;
  const count = Number(button.dataset.count);
  const mode = single ? 'one' : event.shiftKey ? 'stack' : chestState.amount;
  const requested =
    mode === 'one' ? 1 : mode === 'half' ? Math.ceil(count / 2) : count;
  const moved =
    button.dataset.chestSide === 'box'
      ? withdrawChest(
          chest,
          inventory,
          equipment.wear,
          Number(button.dataset.index),
          requested,
          creative,
        )
      : depositChest(
          chest,
          inventory,
          equipment.wear,
          button.dataset.item,
          Number(button.dataset.offset),
          requested,
        );
  finishChestTransfer(moved);
  if (moved)
    toast(
      ITEMS[button.dataset.item].name +
        ' ×' +
        moved +
        (button.dataset.chestSide === 'box' ? ' 已取出' : ' 已存入'),
    );
}
function chestAction(action) {
  const chest = currentChest();
  if (!chest) return;
  if (action === 'sort') {
    sortChest(chest);
    renderChest();
    saveGame();
    soundFX.play('pickup');
    return;
  }
  let moved = 0;
  if (action === 'take-all') {
    for (let i = 0; i < chest.length; i++)
      moved += withdrawChest(
        chest,
        inventory,
        equipment.wear,
        i,
        Infinity,
        creative,
      );
  } else if (action === 'matching') {
    const matching = new Set(chest.filter(Boolean).map((s) => s.item));
    const reserved = new Set([
      heldItem(),
      equipment.offhand,
      ...Object.values(equipment.armor),
    ]);
    for (const item of matching) {
      const offset = reserved.has(item) ? 1 : 0;
      moved += depositChest(
        chest,
        inventory,
        equipment.wear,
        item,
        offset,
        Math.max(0, (inventory[item] || 0) - offset),
      );
    }
  } else return;
  finishChestTransfer(moved);
  if (moved) toast('已转移 ' + moved + ' 件，放不下的物品留在原处。');
}
function spillChest(k) {
  const chest = chests.get(k);
  if (!chest) return;
  const [q, y, r] = k.split(',').map(Number);
  for (const slot of chest) {
    if (!slot) continue;
    const wear = ITEMS[slot.item].durability
      ? { [slot.item]: [slot.wear] }
      : {};
    dropAt(slot.item, slot.count, q, y, r, wear);
  }
  chests.delete(k);
}
$('#station-content').addEventListener('click', (e) => {
  const slot = e.target.closest('[data-chest-side]');
  if (slot) return transferChestButton(slot, e);
  const amount = e.target.closest('[data-chest-amount]');
  if (amount) {
    chestState.amount = amount.dataset.chestAmount;
    renderChest();
  }
  const page = e.target.closest('[data-chest-page]');
  if (page) {
    chestState.page += Number(page.dataset.chestPage);
    renderChest();
  }
  const action = e.target.closest('[data-chest-action]');
  if (action) chestAction(action.dataset.chestAction);
});
$('#station-content').addEventListener('contextmenu', (e) => {
  const slot = e.target.closest('[data-chest-side]');
  if (!slot) return;
  e.preventDefault();
  transferChestButton(slot, e, true);
});
$('#station-content').addEventListener('input', (e) => {
  if (e.target.id !== 'chest-search' || e.isComposing) return;
  chestState.query = e.target.value;
  chestState.page = 0;
  renderChest();
});
$('#station-content').addEventListener('compositionend', (e) => {
  if (e.target.id !== 'chest-search') return;
  chestState.query = e.target.value;
  chestState.page = 0;
  renderChest();
});

function stopEating(clearInputs = false) {
  foodUse = null;
  if (clearInputs) foodInputs.clear();
  if (graphics) {
    graphics.eating = 0;
    graphics.setHeld(heldItem());
  }
}
function canEat(item) {
  return (
    FOODS[item] &&
    (creative || inventory[item] > 0) &&
    (creative || hunger < 20 || FOODS[item].always)
  );
}
function eat(source = 'tap', chosen = null) {
  if (!playing || overlay || foodUse) return false;
  const item =
    chosen ||
    (FOODS[heldItem()]
      ? heldItem()
      : Object.keys(FOODS)
          .filter((id) => !FOODS[id].always && inventory[id] > 0)
          .sort((a, b) => FOODS[b].saturation - FOODS[a].saturation)[0]);
  if (!canEat(item)) {
    toast(
      item
        ? '已经吃饱了，等饥饿后再吃。'
        : '没有可食用的物品。可以采果、耕种、钓鱼或狩猎。',
    );
    return false;
  }
  foodUse = {
    item,
    source,
    elapsed: 0,
    sound: 0,
    selection: selected + ':' + hotbar[selected],
  };
  bowCharge = mining = 0;
  graphics.setHeld(item);
  return true;
}
function updateEating(dt) {
  if (!foodUse) return;
  const use = foodUse;
  if (
    use.selection !== selected + ':' + hotbar[selected] ||
    !canEat(use.item) ||
    leftDown ||
    (use.source !== 'tap' && !foodInputs.has(use.source))
  ) {
    stopEating();
    return;
  }
  use.elapsed += dt;
  use.sound -= dt;
  if (use.sound <= 0) {
    soundFX.play(use.item === 'milkBucket' ? 'drink' : 'eat');
    use.sound = 0.28;
  }
  graphics.eating = use.elapsed;
  if (use.elapsed < 1.6) return;
  if (!creative) inventory[use.item]--;
  const vitals = { health, hunger };
  survival.eat(use.item, vitals);
  hunger = vitals.hunger;
  if (FOODS[use.item].container && !creative) {
    addItem(FOODS[use.item].container);
    if (hotbar[selected] === use.item)
      hotbar[selected] = FOODS[use.item].container;
  }
  stopEating();
  updateHUD();
  saveGame();
  if (use.item === 'goldenApple')
    toast('金苹果 · 生命恢复 5 秒 · 伤害吸收 2 分钟');
  else if (use.item === 'milkBucket') toast('已喝下牛奶，清除状态效果。');
  if (use.source !== 'tap' && foodInputs.has(use.source) && canEat(use.item))
    eat(use.source, use.item);
}
function playerFluidAt(height) {
  const a = worldToAxial(camera.position.x, camera.position.z),
    y = Math.floor(height);
  const fluid = world.fluids.get(a.q, y, a.r);
  return fluid && height < y + fluidHeight(fluid) ? fluid : null;
}
function updateSurvival(dt) {
  if (creative) {
    survivalSubmerged = false;
    return;
  }
  const head = playerFluidAt(camera.position.y),
    feet = playerFluidAt(playerFeet() + 0.12);
  const a = worldToAxial(camera.position.x, camera.position.z);
  const column = weatherColumns.get(world, a.q, a.r);
  survivalSubmerged = !!head;
  const wet =
    [feet, head].some((fluid) => fluid && LIQUIDS[fluid.type].coolant) ||
    (dimension === 'overworld' &&
      weather.rain > 0.25 &&
      column.roof < camera.position.y &&
      !['沙漠', '雪原'].includes(column.biome));
  const vitals = { health, hunger };
  const owner = survival;
  const damage = owner.tick(dt, vitals, {
    submerged: survivalSubmerged,
    wet,
    lava:
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
    if (survival.regeneration > 0)
      effects.push('生命恢复 ' + Math.ceil(survival.regeneration) + 's');
    if (survival.absorptionTime > 0)
      effects.push('伤害吸收 ' + Math.ceil(survival.absorptionTime) + 's');
    if (hunger <= 0) effects.push('饥饿 · 需要食物');
  }
  $('#effect-list').textContent = effects.join(' · ');
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
      (foodUse.item === 'milkBucket' ? '饮用 ' : '食用 ') +
      ITEMS[foodUse.item].name;
    $('#use-progress').value = foodUse.elapsed / 1.6;
  }
}

function combatHUD() {
  const shieldStatus = $('#shield-status');
  shieldStatus.classList.toggle('hidden', !equipment.offhand);
  shieldStatus.classList.toggle('impact', combat.impact > 0.05);
  if (equipment.offhand) {
    $('#shield-label').textContent =
      (combat.raised
        ? combat.raiseTime < 0.25
          ? '举盾中'
          : '正面防御'
        : '按住 R 举盾') +
      ' · ' +
      (creative
        ? '∞'
        : equipment.remaining(equipment.offhand) +
          ' / ' +
          ITEMS[equipment.offhand].durability);
    $('#shield-ready').value = combat.raiseTime;
  }
  const charge = Math.max(0, Math.min(1, 1 - attackCooldown / attackPeriod));
  const meter = $('#attack-meter');
  meter.classList.toggle(
    'hidden',
    !!foodUse || ['bow', 'fishingRod'].includes(heldItem()),
  );
  meter.setAttribute('aria-valuenow', charge.toFixed(2));
  $('#mobile-shield').classList.toggle('hidden', !equipment.offhand);
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
    ['combat', 'projectile', 'explosion'].includes(cause) &&
    equipment.offhand &&
    combat.canBlock(camera.position, yaw, source)
  ) {
    blocked = true;
    combat.impact = 1;
    wearItem(equipment.offhand, 1 + Math.ceil(amount));
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
  if (['combat', 'projectile', 'explosion', 'burn'].includes(cause)) {
    const protection = equipment.protection();
    for (const id of Object.values(equipment.armor))
      wearItem(id, Math.max(1, Math.ceil(amount / 4)));
    amount *= 1 - protection * 0.04;
  }
  if (!['void', 'hunger'].includes(cause))
    amount *= 1 - enchantedProtection * 0.04;
  if (cause !== 'void') amount = survival.absorb(amount);
  if (source && !boats.riding && !blocked) {
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
    for (const [id, n] of Object.entries(inventory)) {
      const wear = ITEMS[id]?.durability
        ? { [id]: equipment.wear[id] || [] }
        : {};
      drops.spawn(id, n, lastDeath, wear, null, 600);
    }
    const lostXP = Math.min(100, experience.level * 7);
    experience.total = experience.fraction = 0;
    awardXP(lostXP, lastDeath);
    inventory = {};
    equipment = new Equipment();
    survival = new Survival({ saturation: 2 });
    combat.reset();
    safeSpawn();
    health = 20;
    hunger = 12;
    toast(
      (cause === 'drown'
        ? '你溺水了。'
        : cause === 'burn'
          ? '你被烧伤倒下了。'
          : '') + '已在出生点醒来。物资留在死亡地点，M 查看红色 × 标记。',
    );
    saveGame();
  }
  updateHUD();
}
function updateMobs(dt) {
  fauna.update(dt, time, camera, heldItem(), creative, weather);
}
function updateWeather(dt) {
  weather.update(dt, world.seed);
  weatherColumns.update(dt, world);
  weatherGrowthTimer += dt;
  if (weatherGrowthTimer < 1) return;
  updatePlants(weatherGrowthTimer);
  weatherGrowthTimer = 0;
}
function hitMob(mob, amount, direction) {
  const p = mob.mesh.position,
    a = worldToAxial(p.x, p.z);
  graphics.burst(a.q, p.y, a.r, MOBS[mob.kind].color);
  beep(140, 0.07, 'triangle');
  fauna.hit(mob, amount, direction);
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
  const action = fauna.interact(mob, heldItem());
  if (!action) return false;
  if (action.consume && !creative) inventory[action.consume]--;
  for (const [id, n] of Object.entries(action.give || {})) addItem(id, n);
  if (action.wear) wearItem(action.wear);
  if (action.replace) hotbar[selected] = action.replace;
  toast(action.message);
  graphics.swing();
  updateHUD();
  saveGame();
  return true;
}

function explode(center) {
  syncDecor();
  for (const b of [...boats.records])
    if (Math.hypot(...b.position.map((n, i) => n - center.getComponent(i))) < 4)
      boats.damage(b, 20);
  const origin = worldToAxial(center.x, center.z),
    changed = new Set();
  const distance = center.distanceTo(
    camera.position.clone().add(new THREE.Vector3(0, -0.8, 0)),
  );
  if (distance < 5)
    hurt(Math.max(1, 14 * (1 - distance / 5)), 'explosion', center);
  for (const mob of [...creatures])
    if (mob.mesh.position.distanceTo(center) < 4)
      fauna.hit(
        mob,
        12,
        mob.mesh.position.clone().sub(center).normalize(),
        false,
      );
  for (let dq = -2; dq <= 2; dq++)
    for (let dr = -2; dr <= 2; dr++) {
      const q = origin.q + dq,
        r = origin.r + dr,
        p = axialToWorld(q, r);
      for (
        let y = Math.max(1, Math.floor(center.y) - 2);
        y <= Math.min(63, Math.floor(center.y) + 2);
        y++
      ) {
        if (
          Math.hypot(p.x - center.x, y + 0.5 - center.y, p.z - center.z) > 2.7
        )
          continue;
        const type = world.get(q, y, r),
          k = key(q, y, r);
        if (!type || type === 'bedrock' || type === 'obsidian') continue;
        if (BLOCKS[type].shape) {
          removeBuilding(q, y, r, !creative && Math.random() < 0.6);
          continue;
        }
        world.set(q, y, r, null);
        if (!creative && Math.random() < 0.6)
          dropAt(BLOCKS[type].drop || type, 1, q, y, r);
        spillChest(k);
        spillFurnace(k);
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
  toast('轰！苦力怕炸开了周围的方块。');
  saveGame();
}
function attack() {
  graphics.ray.setFromCamera(new THREE.Vector2(), camera);
  const meshes = creatures.filter((m) => m.mesh.visible).map((m) => m.mesh);
  const hit = graphics.ray
    .intersectObjects(meshes, true)
    .find((h) => h.distance < 3.5);
  if (!hit || (target && hit.distance > target.distance)) return false;
  let obj = hit.object;
  while (obj.parent && !meshes.includes(obj)) obj = obj.parent;
  const mob = creatures.find((m) => m.mesh === obj);
  if (!mob) return false;
  if (attackCooldown > 0) return true;
  const held = heldItem(),
    item = ITEMS[held];
  attackCooldown = item?.cooldown || 0.45;
  attackPeriod = attackCooldown;
  if (!creative) survival.exhaust(0.1);
  const critical = !grounded && vy < -1 && !creative;
  graphics.swing();
  hitMob(
    mob,
    ((item?.damage || 2) +
      (equipment.rank(held, 'sharpness')
        ? 0.5 + equipment.rank(held, 'sharpness') * 0.5
        : 0)) *
      (critical ? 1.5 : 1),
    camera.getWorldDirection(new THREE.Vector3()),
  );
  wearItem(held, item?.kind === 'sword' ? 1 : 2);
  if (critical) toast('暴击！');
  return true;
}
function releaseBow() {
  const charge = bowCharge;
  bowCharge = 0;
  if (
    !playing ||
    overlay ||
    heldItem() !== 'bow' ||
    charge < 0.12 ||
    combat.raised ||
    attackCooldown > 0
  )
    return;
  if (!creative && !(inventory.arrow > 0)) {
    toast('需要箭矢：用石头、木材和纤维线制作。');
    return;
  }
  if (!creative) inventory.arrow--;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  projectiles.shoot(
    camera.position.clone(),
    direction,
    Math.min(charge / 1.1, 1),
    !creative,
    'player',
    1 + equipment.rank('bow', 'power') * 0.25,
  );
  attackCooldown = 0.25;
  attackPeriod = attackCooldown;
  if (!creative) survival.exhaust(0.1);
  graphics.swing();
  beep(240, 0.05, 'triangle');
  wearItem('bow');
}
function movePlayer(dt) {
  if (boats.riding) {
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
    camera.fov += (72 - camera.fov) * (1 - Math.exp(-dt * 8));
    camera.updateProjectionMatrix();
    vy = 0;
    grounded = true;
    moved = 0;
    $('#underwater').style.display = 'none';
    if (!creative) survival.exhaust(distance * 0.02);
    return;
  }
  const survivalBeforeMove = survival;
  const startX = camera.position.x,
    startZ = camera.position.z;
  const feetFluid = playerFluidAt(playerFeet() + 0.12),
    headFluid = playerFluidAt(camera.position.y);
  const swimming = !!feetFluid,
    fly = creative,
    climbing = !creative && onLadder();
  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const norm = Math.hypot(forward, side);
  if (norm) {
    forward /= norm;
    side /= norm;
  }
  const sneaking = keys.has('ControlLeft') || keys.has('ControlRight');
  const sprint =
      keys.has('ShiftLeft') &&
      forward > 0 &&
      hunger > 6 &&
      !fly &&
      !sneaking &&
      !combat.raised &&
      !foodUse,
    baseSpeed = fly
      ? 10
      : swimming
        ? LIQUIDS[feetFluid.type].speed
        : sneaking
          ? 2.1
          : sprint
            ? 7
            : 4.8;
  const speed = baseSpeed * (!fly && (foodUse || combat.raised) ? 0.35 : 1);
  const { dx, dz } = motion.update(
    dt,
    (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed,
    (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed,
    grounded,
    swimming,
    fly,
  );
  const fov = swimming ? 69 : sprint && norm ? 79 : 72;
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 8));
  camera.updateProjectionMatrix();
  moved = norm;
  if (fly) {
    camera.position.x += dx;
    camera.position.z += dz;
    camera.position.y +=
      ((keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') ? 1 : 0)) *
      speed *
      dt;
    camera.position.y = Math.max(-20, Math.min(85, camera.position.y));
    vy = 0;
  } else {
    const feet = playerFeet();
    const supported = (x, z) =>
      !sneaking ||
      !grounded ||
      swimming ||
      Math.hypot(motion.kickX, motion.kickZ) > 0.15 ||
      collides(x, feet - 0.16, z);
    if (
      !collides(camera.position.x + dx, feet, camera.position.z) &&
      supported(camera.position.x + dx, camera.position.z)
    )
      camera.position.x += dx;
    else motion.x = motion.kickX = 0;
    if (
      !collides(camera.position.x, feet, camera.position.z + dz) &&
      supported(camera.position.x, camera.position.z + dz)
    )
      camera.position.z += dz;
    else motion.z = motion.kickZ = 0;
    if (
      !swimming &&
      !climbing &&
      motion.takeJump(keys.has('Space'), grounded)
    ) {
      vy = 8.5;
      survival.exhaust(sprint ? 0.8 : 0.2);
      grounded = false;
      beep(180, 0.04, 'sine', 0.01);
    }
    if (climbing) {
      vy = sneaking
        ? 0
        : keys.has('ShiftLeft') || keys.has('ShiftRight')
          ? -2.8
          : keys.has('KeyW') || keys.has('Space')
            ? 3.2
            : -1.2;
    } else if (swimming) {
      vy = Math.max(-2, vy - dt * 4);
      if (keys.has('Space')) vy = 4;
    } else vy -= dt * DIMENSIONS[dimension].gravity;
    const dy = vy * dt,
      steps = Math.max(1, Math.ceil(Math.abs(dy) / 0.12));
    grounded = false;
    for (let i = 0; i < steps; i++) {
      const next = playerFeet() + dy / steps;
      if (collides(camera.position.x, next, camera.position.z)) {
        if (vy < 0) {
          grounded = true;
          if (vy < -13) hurt(Math.floor((-vy - 12) * 0.6), 'fall');
        }
        vy = 0;
        break;
      }
      camera.position.y += dy / steps;
    }
    if (survival === survivalBeforeMove)
      survival.exhaust(
        Math.hypot(camera.position.x - startX, camera.position.z - startZ) *
          (swimming ? 0.015 : sprint ? 0.06 : 0.006),
      );
  }
  const a = worldToAxial(camera.position.x, camera.position.z);
  if (camera.position.y < -12) {
    if (creative) safeSpawn();
    else {
      damageCooldown = 0;
      hurt(20, 'void');
    }
  }
  $('#underwater').style.display = headFluid ? 'block' : 'none';
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
  for (const s of world.structures(at.q, at.r, full ? 65 : 35)) {
    if (!world.discoveredStructures.has(s.id)) continue;
    const p = axialToWorld(s.q, s.r);
    ctx.fillStyle =
      s.kind === 'dungeon' || s.kind === 'mine' ? '#c9abe9' : '#e9b56b';
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
  if (b) {
    selectedRecipe = Number(b.dataset.recipe);
    renderCraft();
  }
};
$('#craft-button').onclick = doCraft;
$('#drop-held').onclick = () => throwItem();
$('#drop-mode').onclick = () => {
  discardMode = !discardMode;
  $('#drop-mode').textContent =
    '点击丢弃：' + (discardMode ? '开（每次 1 件）' : '关');
  $('#drop-mode').setAttribute('aria-pressed', String(discardMode));
};
$('#inventory').onclick = (e) => {
  const b = e.target.closest('[data-item]');
  if (b && (e.shiftKey || discardMode)) {
    throwItem(
      e.shiftKey,
      b.dataset.item,
      Number(b.dataset.index) * stackSize(b.dataset.item),
    );
    return;
  }
  if (b && (ITEMS[b.dataset.item].armorSlot || ITEMS[b.dataset.item].offhand)) {
    equipment.equip(
      b.dataset.item,
      inventory,
      creative,
      Number(b.dataset.index),
    );
    updateHUD();
    renderCraft();
    saveGame();
    return;
  }
  if (b && canEquip(b.dataset.item)) {
    if (!creative)
      equipment.selectCopy(b.dataset.item, Number(b.dataset.index), inventory);
    hotbar[selected] = b.dataset.item;
    updateHUD();
    renderCraft();
    beep(420, 0.03);
    saveGame();
  }
};
$('#armor-slots').onclick = (e) => {
  if (e.target.closest('[data-unequip-offhand]')) {
    if (equipment.offhand) equipment.offhand = null;
    else if (creative || inventory.shield > 0)
      equipment.equip('shield', inventory, creative);
    else {
      toast('先在工作台用 6 木板和 1 铁锭制作盾牌。');
      return;
    }
    combat.reset();
    updateHUD();
    renderCraft();
    saveGame();
    return;
  }
  const b = e.target.closest('[data-unequip]');
  if (b) {
    delete equipment.armor[b.dataset.unequip];
    updateHUD();
    renderCraft();
    saveGame();
  }
};
$('#hotbar').onclick = (e) => {
  const b = e.target.closest('[data-slot]');
  if (b) {
    selected = Number(b.dataset.slot);
    updateHUD();
  }
};
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeOverlay();
  const amount = e.target.closest('[data-furnace-amount]');
  if (amount) {
    furnaceAmount = Number(amount.dataset.furnaceAmount);
    renderFurnace();
  }
  const deposit = e.target.closest('[data-furnace-deposit]'),
    take = e.target.closest('[data-furnace-take]');
  if (deposit)
    transferFurnace(deposit.dataset.furnaceDeposit, deposit.dataset.item);
  if (take) transferFurnace(take.dataset.furnaceTake);
});
$('#mode-toggle').onclick = () => {
  creative = !creative;
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
  overlay = null;
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
  try {
    localStorage.setItem('hexwild-quality', e.target.value);
  } catch {
    /* Keep the selected quality for this session. */
  }
};
document.querySelectorAll('[data-dimension]').forEach(
  (b) =>
    (b.onclick = () => {
      if (creative && travel(b.dataset.dimension)) closeOverlay();
    }),
);
document.addEventListener('pointerdown', () => soundFX.unlock());
$('#recipe-search').oninput = () => {
  const query = $('#recipe-search').value.trim();
  document
    .querySelectorAll('[data-recipe]')
    .forEach((b) =>
      b.classList.toggle('hidden', !b.textContent.includes(query)),
    );
};
$('#sensitivity').oninput = (e) => (sensitivity = Number(e.target.value));
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
    bowCharge = 0;
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
  if (e.button === 2) {
    foodInputs.add('mouse');
    place();
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    foodInputs.delete('mouse');
    if (foodUse?.source === 'mouse') stopEating();
  }
  if (e.button !== 0) return;
  releaseBow();
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
  if (e.target.id === 'chest-search' && e.code === 'Escape') {
    closeOverlay();
    return;
  }
  if (
    overlay === '#station-overlay' &&
    (currentChest() ||
      (stationKey &&
        world.get(...stationKey.split(',').map(Number)) ===
          'enchantingTable')) &&
    (e.code === 'Tab' || (e.code === 'Space' && e.target.matches('button')))
  )
    return;
  if (e.target.matches('input')) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code))
    e.preventDefault();
  if (e.repeat) return;
  if (overlay) {
    if (['Escape', 'KeyB', 'Tab', 'KeyM'].includes(e.code)) closeOverlay();
    return;
  }
  if (!hasGame) return;
  if (e.code === 'Escape') {
    openOverlay('#pause-overlay');
    return;
  }
  if (e.code === 'KeyB' || e.code === 'Tab') {
    openOverlay('#craft-overlay');
    return;
  }
  if (e.code === 'KeyM') {
    openOverlay('#map-overlay');
    return;
  }
  if (e.code === 'KeyE') {
    interact();
    return;
  }
  if (e.code === 'KeyF') {
    foodInputs.add('key');
    eat('key');
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
  if (e.code === 'Space') motion.jump();
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyF') {
    foodInputs.delete('key');
    if (foodUse?.source === 'key') stopEating();
  }
});
window.addEventListener('blur', () => {
  keys.clear();
  bowCharge = 0;
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
      if (b.dataset.key === 'Space') motion.jump();
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
      else if (action === 'place') place();
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
      if (b.dataset.action === 'eat') {
        foodInputs.delete('touch');
        if (foodUse?.source === 'touch') stopEating();
      }
      if (b.dataset.action === 'mine') releaseBow();
      leftDown = false;
    };
    b.onpointercancel = () => {
      if (b.dataset.action === 'eat') {
        foodInputs.delete('touch');
        if (foodUse?.source === 'touch') stopEating();
      }
      bowCharge = 0;
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
    damageCooldown = Math.max(0, damageCooldown - dt);
    combat.update(dt, keys.has('KeyR') && !!equipment.offhand && !foodUse);
    if (combat.raised) bowCharge = 0;
    boats.update(dt, world, keys);
    const physicsSteps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < physicsSteps; i++) movePlayer(dt / physicsSteps);
    updateSurvival(dt);
    updateEating(dt);
    world.fluids.step(dt);
    flushFluidChanges();
    if (heldItem() !== 'fishingRod') fishing.clear();
    else {
      if (leftDown && fishing.active) {
        fishing.clear();
        leftDown = false;
        toast('已收起鱼线。');
      }
      fishing.update(dt, world, camera, weather.rain);
    }
    target = graphics.target(
      !!ITEMS[hotbar[selected]]?.bucket || heldItem() === 'boat',
    );
    boatTarget = boats.target(camera, target?.distance ?? Infinity);
    if (foodUse || combat.raised) {
      mining = bowCharge = 0;
      $('#mine-progress i').style.width = '0';
    } else if (leftDown && heldItem() === 'bow') {
      bowCharge = Math.min(1.1, bowCharge + dt);
      mining = 0;
      $('#mine-progress i').style.width = (bowCharge / 1.1) * 100 + '%';
    } else if (leftDown) {
      if (!attackBoat() && !attack()) mine(dt);
    } else {
      mining = 0;
      miningKey = '';
      $('#mine-progress i').style.width = '0';
    }
    $('#target').classList.toggle('hidden', !target?.type);
    $('#target').textContent = target?.type
      ? (target.fluid
          ? LIQUIDS[target.type].name +
            (target.source ? '源 · 右键/E 装桶' : '流 · 无法装桶')
          : BLOCKS[target.type].name) +
        ([
          'workbench',
          'furnace',
          'enchantingTable',
          'chest',
          'farmland',
          'bed',
          'portal',
          'endportal',
          'spawner',
          'door',
          'doorTop',
          'gate',
          'ladder',
        ].includes(target.type)
          ? ' · E 交互'
          : '')
      : '';
    if (target?.crop && crops.has(target.crop)) {
      const plant = crops.get(target.crop),
        def = PLANTS[plant.kind];
      $('#target').textContent =
        `${def.name} · ${Math.floor((plant.age / def.seconds) * 100)}% · E ${plant.age >= def.seconds && !def.tree ? '收获' : '查看 / 骨粉催熟'} · 左键拔除`;
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
        ROLES[villagerTarget.role].name +
        ' · E 交易';
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
        (m.kind === 'creeper' && m.fuse > 0
          ? ' · 即将爆炸！'
          : def.hostile
            ? ''
            : m.love > 0
              ? ' · ♥ 寻找伙伴'
              : m.kind === 'chicken' && m.eggs > 0
                ? ' · E 收集鸡蛋 ×' + m.eggs
                : ' · E 喂养 / 互动');
    }
    if (boatTarget && !creatureTarget && !villagerTarget) {
      $('#target').classList.remove('hidden');
      $('#target').textContent =
        '橡木船 · ' +
        Math.ceil(boatTarget.boat.health) +
        '/20 · E 上船 · Ctrl+E 收回';
    }
    updateMobs(dt);
    drops.update(dt, world, camera, collectDrop);
    experience.update(dt, world, camera, !creative);
    projectiles.update(
      dt,
      world,
      creatures,
      camera,
      hitMob,
      () => addItem('arrow'),
      (amount, source) => hurt(amount, 'projectile', source),
    );
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
    $('#combat-status').textContent =
      heldItem() === 'fishingRod'
        ? fishing.status
        : heldItem() === 'bow'
          ? (bowCharge > 0
              ? '拉弓 ' + Math.round((bowCharge / 1.1) * 100) + '% · 松开发射'
              : '按住左键拉弓') +
            ' · 箭矢 ' +
            (creative ? '∞' : inventory.arrow || 0)
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
    (playing || (overlay === '#station-overlay' && $('#furnace-progress')))
  ) {
    updateFurnaces(dt);
    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      saveGame();
    }
  }
  if (graphics.fishingTip) graphics.fishingTip.getWorldPosition(fishingTip);
  else fishingTip.copy(camera.position);
  fishing.render(camera, fishingTip, playing && heldItem() === 'fishingRod');
  graphics.bowDraw = bowCharge / 1.1;
  graphics.heldEnchanted =
    !foodUse && Object.keys(equipment.tags(heldItem())).length > 0;
  graphics.shieldEnchanted =
    !!equipment.offhand &&
    Object.keys(equipment.tags(equipment.offhand)).length > 0;
  graphics.blocking = combat.raised;
  graphics.shieldImpact = combat.impact;
  survivalHUD();
  updateExperienceHUD();
  combatHUD();
  graphics.frame(
    playing ? dt : 0,
    time,
    playing,
    moved > 0,
    leftDown && heldItem() !== 'bow',
    weather,
    weatherColumns,
    dt,
    foodUse?.item || heldItem(),
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
    selectRecipe: (i) => {
      selectedRecipe = i;
      renderCraft();
    },
    setTarget: (t) => (target = t),
    teleport: (q, y, r) => {
      const p = axialToWorld(q, r);
      world.ensureAround(q, r);
      graphics.sync(q, r, true);
      camera.position.set(p.x, y + 1.65, p.z);
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
    if (Number.isFinite(p.volume))
      soundFX.volume = Math.max(0, Math.min(1, p.volume));
    if (typeof p.sound === 'boolean') sound = soundFX.enabled = p.sound;
    if (typeof p.flashes === 'boolean')
      graphics.weatherEffects.flashes = p.flashes;
    $('#lightning-toggle').checked = graphics.weatherEffects.flashes;
    $('#sensitivity').value = sensitivity;
    $('#volume').value = soundFX.volume;
    $('#sound-toggle').textContent = sound ? '开启' : '关闭';
    if ([0.65, 1, 1.7].includes(p.quality)) $('#quality').value = p.quality;
    graphics.setQuality(Number($('#quality').value));
  } catch {}
}
function savePreferences() {
  try {
    localStorage.setItem(
      'hexwild-settings',
      JSON.stringify({
        sensitivity,
        volume: soundFX.volume,
        sound,
        flashes: graphics.weatherEffects.flashes,
        quality: Number($('#quality').value),
      }),
    );
  } catch {}
}
for (const id of ['sensitivity', 'volume', 'quality'])
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
