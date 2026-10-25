import { STRUCTURE_NAMES, structureLoot } from './structures.js';
import { SMELTING } from './exploration-data.js';
import { features as villageFeatures, ROLES, trade } from './villages.js';
import { Villagers } from './villagers.js';
import { LIQUIDS, fluidHeight } from './fluids.js';
import './style.css';
import * as THREE from 'three';
import {
  BLOCKS,
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
import { INVENTORY_SLOTS, usedSlots, roomFor, stackSize } from './inventory.js';
import { MOBS } from './mob-data.js';
import { Graphics } from './graphics.js';
import { World, DIMENSIONS, WORLD_HEIGHT } from './world.js';
import { SAVE_KEY, validateSave } from './save.js';
import { loadTexturePack } from './texture-pack.js';
import { Equipment, miningStats, transferWear } from './equipment.js';
import { ARMOR_SLOTS } from './gear-data.js';
import { Projectiles } from './projectiles.js';
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
  <footer class="landing-footer"><div class="tags"><span><b>⬡</b> 六棱世界</span><span><b>✧</b> 生存与创造</span><span><b>◈</b> 每一面，都有可能</span></div><div class="edition">AN EXPERIMENT IN SIX DIRECTIONS<br>v0.12 — ROOTS AND HARVESTS</div></footer>
 </section>
 <div id="hud" class="hidden">
  <div class="hud-top"><div><div class="wordmark">HEXWILD <small>六野</small></div><div class="world-info" id="world-info"></div></div><div class="world-badge"><span id="dimension-name">主世界</span><strong id="biome-name">青翠平原</strong><span id="weather-hud"></span><div id="compass">N · NE · SE · S · SW · NW</div></div></div>
  <div id="crosshair"></div><div id="mine-progress"><i></i></div><div id="target" class="hidden"></div>
  <div class="bottom-hud"><div id="combat-status"></div><div id="selected-name"></div><div class="vitals"><span class="health" id="health"></span><span class="tool" id="tool"></span><span class="hunger" id="hunger"></span><span id="armor-hud"></span></div><div id="hotbar"></div><div class="controls-hint"><span><kbd>WASD</kbd>移动</span><span><kbd>空格</kbd>跳跃</span><span><kbd>左 / 右键</kbd>采集 / 放置</span><span><kbd>E</kbd>交互</span><span><kbd>B</kbd>合成</span><span><kbd>M</kbd>地图</span><span><kbd>ESC</kbd>菜单</span></div></div>
  <div class="hud-left" id="location"></div><canvas id="minimap" width="200" height="220"></canvas>
  <div id="mobile-controls"><div class="mobile-top"><button data-action="craft" aria-label="合成">B</button><button data-action="map" aria-label="地图">M</button><button data-action="pause" aria-label="暂停">Ⅱ</button><button data-action="eat" aria-label="吃东西">F</button></div><div class="dpad"><button data-key="KeyW" aria-label="前进">↑</button><button data-key="KeyA" aria-label="左移">←</button><button data-key="KeyS" aria-label="后退">↓</button><button data-key="KeyD" aria-label="右移">→</button></div><div class="mobile-actions"><button data-action="mine" aria-label="采集">挖</button><button data-action="place" aria-label="放置">放</button><button data-key="Space" aria-label="跳跃">↟</button><button data-action="interact" aria-label="交互">E</button><button data-key="ShiftLeft" aria-label="下降或冲刺">⇣</button></div></div>
 </div>
 <div id="pickups" aria-live="polite"></div><div id="travel" aria-live="polite"><span>穿越维度</span></div><div id="underwater"></div><div id="damage"></div><div id="toast" role="status" aria-live="polite"></div>
 <section id="craft-overlay" class="overlay hidden"><div class="panel"><div class="panel-head"><div><div class="eyebrow">THE HONEYCOMB WORKSHOP</div><h2>蜂巢工坊</h2></div><button class="close" data-close aria-label="关闭合成">×</button></div><div class="craft-layout"><div class="recipe-sidebar"><input id="recipe-search" placeholder="搜索配方…" aria-label="搜索配方"><nav class="recipe-list" id="recipes" aria-label="合成配方"></nav></div><div class="craft-main"><h3 id="recipe-title"></h3><p id="recipe-desc"></p><div class="honeycomb" id="pattern"></div><div class="recipe-cost" id="recipe-cost"></div><button class="primary" id="craft-button">合成</button><p id="station-note"></p></div></div><div class="inventory-section"><div class="section-label">你的背包 <b id="pack-capacity"></b> <span class="tiny">/ 点击选择；点击护甲穿戴；Shift 点击丢出一组</span></div><div class="armor-slots" id="armor-slots"></div><div class="inventory-grid" id="inventory"></div><div class="pack-actions"><button id="drop-held">丢出手持物 ×1</button><button id="drop-mode" aria-pressed="false">点击丢弃：关</button></div><p class="panel-note">Q 丢出 1 件 / Ctrl+Q 丢出一组 · 靠近地面物品自动拾取 · 工具必须手持 · 弓：左键蓄力，松开发射 · 桶：右键/E 装取源或倒出 · E 使用工作台 / 熔炉 / 箱子 / 耕种 · F 食用 · 鼠标滚轮或 1–9 切换手持物</p></div></div></section>
 <section id="pause-overlay" class="overlay hidden"><div class="panel pause-panel"><div class="eyebrow">TAKE A BREATH</div><h2 id="pause-title">旷野会等你。</h2><p id="pause-description">旅途已暂歇。世界会记住你留下的每一块砖。</p><div class="pause-actions"><button class="primary" id="resume">回到旷野</button><div class="two-col"><button id="export">导出存档</button><button id="import">导入存档</button></div><div class="two-col"><button id="mode-toggle">切换自由建造</button><button id="respawn">返回出生点</button></div><button id="home">保存并返回首页</button></div><div class="settings-row"><label for="sensitivity">视角灵敏度</label><input id="sensitivity" type="range" min="0.5" max="2" step="0.1" value="1"></div><div class="settings-row"><span>游戏音效</span><button id="sound-toggle">开启</button></div><div class="settings-row"><label for="volume">音效音量</label><input id="volume" type="range" min="0" max="1" step="0.05" value="0.45"></div><div class="settings-row"><label for="lightning-toggle">雷电闪光</label><input id="lightning-toggle" type="checkbox" checked></div><div class="settings-row"><label for="quality">渲染精度</label><select id="quality"><option value="1">均衡</option><option value="0.65">流畅</option><option value="1.7">光影 · 泛光</option></select></div><div class="dimension-controls" id="dimension-controls"><span>创造模式 · 维度旅行</span><div><button data-dimension="overworld">主世界</button><button data-dimension="nether">下界</button><button data-dimension="end">末地</button></div><p class="panel-note">生存模式中，在工坊制作传送门，放置后按 E 穿越。返回门自动生成。</p></div><div class="help-grid"><span><kbd>W A S D</kbd>移动 / Shift 冲刺 / Ctrl 慢行防坠</span><span><kbd>空格</kbd>跳跃 / 水中上浮</span><span><kbd>左键长按</kbd>采集 / 攻击</span><span><kbd>右键</kbd>放置方块</span><span><kbd>E</kbd>交互 / 耕种 / 收获</span><span><kbd>B / Tab</kbd>背包与蜂巢合成</span><span><kbd>F / M</kbd>吃东西 / 查看地图</span><span><kbd>Q / Ctrl+Q</kbd>丢出一件 / 一组</span><span><kbd>创造模式</kbd>空格上升 / Shift 下降</span></div><div id="weather-controls" class="hidden"><span>创造模式 · 天气</span><div class="weather-buttons"><button data-weather="clear">晴朗</button><button data-weather="rain">雨 / 雪</button><button data-weather="storm">雷暴</button></div><p class="panel-note">天气会逐渐过渡，之后继续自动轮换。雪原降雪，沙漠只有阴云；雷电闪光可单独关闭。</p></div><div class="world-form"><label for="seed">新世界种子</label><input id="seed" type="number" min="0" max="999999" value="624"><button id="new-world">创建新世界</button></div><p class="panel-note">自动保存在本浏览器。创建新世界会替换当前存档，可先导出备份。手机：左侧方向键移动，拖动右半屏转动视角。</p><input class="hidden" type="file" id="save-file" accept=".json,application/json"></div></section>
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
let weather = new Weather();
const weatherColumns = new WeatherColumns();
let weatherGrowthTimer = 0;
let lastDeath = null;
let discardMode = false;
const fauna = new Fauna(graphics.scene, graphics.textures, {
  damage: (amount) => hurt(amount),
  drop: (id, n, position) => drops.spawn(id, n, position),
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
  chestWear = new Map(),
  bowCharge = 0;
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
  furnaceJobs = new Map(),
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
  const a = worldToAxial(x, z);
  return world.solid(a.q, Math.floor(y), a.r);
}
function collides(x, feet, z) {
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
  chestWear = new Map(data.chestWear || []);
  respawnPoint = data.respawn || null;
  furnaceJobs = new Map();
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
    lastDeath,
    crops: [...crops],
    chests: [...chests],
    chestWear: [...chestWear],
    respawn: respawnPoint,
    position: camera.position.toArray(),
  };
}
function syncDecor() {
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
        chests.set(k, { ...p.loot });
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
        chests.set(k, { ...p.loot });
    }
  }
  for (const [k, plant] of crops) {
    const [q, , r] = k.split(',').map(Number);
    if (world.loaded(q, r)) graphics.crop(k, plant);
  }
}
function travel(to) {
  if (!hasGame || !DIMENSIONS[to] || to === dimension) return false;
  refundJobs();
  projectiles.clear();
  bowCharge = 0;
  captureDimension();
  const seed = world.seed;
  world.clearLoaded();
  dimension = to;
  const data = dimensionStates[to] || { edits: [], crops: [], chests: [] };
  world = new World(seed, to, {
    edits: data.edits,
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
  chestWear = new Map(data.chestWear || []);
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
  for (const job of furnaceJobs.values())
    if (job.paid) {
      savedInventory[job.input] = (savedInventory[job.input] || 0) + 1;
      savedInventory.coal = (savedInventory.coal || 0) + 1;
    }
  captureDimension();
  return {
    version: 5,
    dimension,
    dimensions: dimensionStates,
    seed: world.seed,
    inventory: savedInventory,
    equipment: equipment.serialize(),
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
      return `<button data-unequip="${slot}" title="${id ? '点击卸下 ' + ITEMS[id].name : name}">${id ? icon(id) : '<span class="empty-armor">◇</span>'}<span>${id ? ITEMS[id].name : name}</span>${id ? durabilityBar(id) : ''}</button>`;
    })
    .join('');
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
        `<button class="inv-item ${hotbar[selected] === id ? 'selected' : ''}" data-item="${id}" data-index="${index}" title="${item.name} · 点击选择；Shift 点击丢出一组${item.durability ? ' · 耐久 ' + (equipment.wear[id]?.[index] ?? item.durability) + '/' + item.durability : ''}">${icon(id)}<span>${item.name}</span><b>${creative ? '∞' : Math.min(stackSize(id), inventory[id] - index * stackSize(id))}</b>${item.durability && !creative ? '<i class="durability"><i style="width:' + ((equipment.wear[id]?.[index] ?? item.durability) / item.durability) * 100 + '%;background:#82bd58"></i></i>' : ''}${index === 0 && item.armorSlot && equipment.armor[item.armorSlot] === id ? '<small>已穿戴</small>' : ''}</button>`,
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

  if (canEquip(recipe.id) && !hotbar.includes(recipe.id))
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
  if (heldItem() !== 'bow') bowCharge = 0;
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
          `<button class="slot ${i === selected ? 'active' : ''}" data-slot="${i}" aria-label="${i + 1} ${ITEMS[id].name} ${creative ? '无限' : inventory[id] || 0}"><span class="slot-inner">${icon(id)}</span><span class="num">${i + 1}</span><span class="count">${creative ? '∞' : inventory[id] || 0}</span>${durabilityBar(id)}</button>`,
      )
      .join('');
  }
  $('#selected-name').textContent = ITEMS[hotbar[selected]].name;
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
      : '';
  const a = worldToAxial(camera.position.x, camera.position.z),
    phase = time % 600;
  $('#world-info').textContent =
    `第 ${Math.floor(time / 600) + 1} 天 / ${phase < 270 ? '日光' : phase < 330 ? '黄昏' : phase < 570 ? '星夜' : '黎明'} · ${creative ? '创造' : '生存'}`;
  $('#location').innerHTML =
    `${DIMENSIONS[dimension].name} · 种子 ${world.seed}<br>Q ${a.q} / R ${a.r} / Y ${Math.floor(playerFeet())}<br>${creative ? '空格 ↑ · Shift ↓' : 'F 食用 · Shift 冲刺'}`;
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
  graphics.setHeld(heldItem());
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
    stats = miningStats(target.type, held);
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
  if (type === 'chest') syncDecor();
  world.set(q, y, r, null);
  graphics.updateBlock(q, y, r);
  graphics.burst(q, y, r, data.color);
  soundFX.play('break', type);
  wearItem(held, ITEMS[held]?.kind === 'sword' ? 2 : 1);
  if (!creative) {
    dropAt(data.drop || type, 1, q, y, r);
    if (type === 'leaves') {
      if (Math.random() < 0.3) dropAt('apple', 1, q, y, r);
      if (Math.random() < 0.45) dropAt('seed', 1, q, y, r);
      if (Math.random() < 0.2) dropAt('sapling', 1, q, y, r);
    }
    if (type === 'grass' && Math.random() < 0.35) dropAt('seed', 1, q, y, r);
    hunger = Math.max(0, hunger - 0.022);
  }
  if (crops.has(k)) {
    harvestPlant(k, true);
  }
  if (chests.has(k)) {
    for (const [id, n] of Object.entries(chests.get(k))) {
      const wear = ITEMS[id]?.durability
        ? { [id]: chestWear.get(k)?.[id] || [] }
        : {};
      dropAt(id, n, q, y, r, wear);
    }
    chestWear.delete(k);
    chests.delete(k);
  }
  const job = furnaceJobs.get(k);
  if (job?.paid) {
    dropAt(job.input, 1, q, y, r);
    dropAt('coal', 1, q, y, r);
  }
  furnaceJobs.delete(k);
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
function place() {
  if (!playing) return;
  if (interactCreature() || drinkMilk() || useGoldenApple()) return;
  if (heldItem() === 'boneMeal' && target) {
    interact();
    return;
  }
  if (plantForItem(heldItem()) && target) {
    interact();
    return;
  }
  if (heldItem() === 'cake') {
    eat();
    return;
  }
  if (useBucket()) return;
  if (!target || !BLOCKS[hotbar[selected]]) return;
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
  world.set(q, y, r, id, false);
  if (collides(camera.position.x, playerFeet(), camera.position.z)) {
    world.set(q, y, r, null, false);
    toast('这里会挡住你，换个位置试试。');
    return;
  }
  world.set(q, y, r, id);
  const cropBelow = key(q, y - 1, r);
  if (crops.has(cropBelow)) {
    harvestPlant(cropBelow, true, 2);
  }
  if (!creative) inventory[id]--;
  graphics.updateBlock(q, y, r);
  if (id === 'chest') chests.set(key(q, y, r), {});
  soundFX.play('place', id);
  graphics.swing();
  updateHUD();
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
  if (interactCreature() || drinkMilk() || useGoldenApple()) return;
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
  if (type === 'spawner') {
    toast('在五格内放置火把或萤灯压制刷怪，也可用石镐拆除。');
    return;
  }
  if (type === 'chest') {
    syncDecor();
    stationKey = k;
    openOverlay('#station-overlay');
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
    saveGame();
    renderTrade();
  }
});
function renderFurnace() {
  const job = furnaceJobs.get(stationKey);
  $('#station-title').textContent = '六棱熔炉';
  $('#station-content').innerHTML =
    '<p>每次消耗 1 份煤和 1 份原料。煤炭 ' +
    (inventory.coal || 0) +
    '</p>' +
    (job
      ? '<p>炉火正旺：' +
        ITEMS[job.output].name +
        ' · 剩余 ' +
        Math.ceil(job.remaining) +
        ' 秒</p>'
      : '<p>选择一种原料开始熔炼。</p>') +
    Object.entries(SMELTING)
      .map(
        ([output, recipe]) =>
          `<button class="smelting-recipe" data-smelt="${output}" ${job || (!creative && (!(inventory[recipe.input] > 0) || !(inventory.coal > 0))) ? 'disabled' : ''}>${icon(recipe.input)}${ITEMS[recipe.input].name} ${inventory[recipe.input] || 0} → ${icon(output)}${ITEMS[output].name}<small>${recipe.seconds} 秒</small></button>`,
      )
      .join('') +
    '<p class="panel-note">关闭面板后继续工作。完成后收入背包；离开游戏或拆除熔炉会退回未完成的材料。</p>';
}
function smelt(output) {
  const recipe = SMELTING[output];
  if (!recipe || furnaceJobs.has(stationKey)) return;
  const input = recipe.input;
  if (!creative && (!(inventory[input] > 0) || !(inventory.coal > 0))) return;
  if (!creative) {
    inventory[input]--;
    inventory.coal--;
  }
  furnaceJobs.set(stationKey, {
    output,
    input,
    remaining: recipe.seconds,
    paid: !creative,
  });
  beep(180, 0.2, 'sawtooth', 0.015);
  renderFurnace();
  updateHUD();
}
function refundJobs() {
  for (const job of furnaceJobs.values())
    if (job.paid) {
      inventory[job.input] = (inventory[job.input] || 0) + 1;
      inventory.coal = (inventory.coal || 0) + 1;
    }
  furnaceJobs.clear();
}
function renderChest() {
  const storage = chests.get(stationKey) || {};
  chests.set(stationKey, storage);
  $('#station-title').textContent = '储物箱';
  $('#station-content').innerHTML =
    `<p>点击存取最多 10 件；装备的耐久会随物品一起存取。</p><div class="section-label" style="margin-top:18px">背包 → 箱子</div><div class="inventory-grid">${
      Object.entries(inventory)
        .filter(([, n]) => n > 0)
        .map(
          ([id, n]) =>
            `<button class="inv-item" data-store="${id}">${icon(id)}${ITEMS[id].name}<b>${n}</b></button>`,
        )
        .join('') || '<p>背包空空如也。</p>'
    }</div><div class="section-label" style="margin-top:18px">箱子 → 背包</div><div class="inventory-grid">${
      Object.entries(storage)
        .filter(([, n]) => n > 0)
        .map(
          ([id, n]) =>
            `<button class="inv-item" data-take="${id}">${icon(id)}${ITEMS[id].name}<b>${n}</b></button>`,
        )
        .join('') || '<p>还没有存入物品。</p>'
    }</div>`;
}
function eat() {
  for (const [id, value] of [
    ['cake', 12],
    ['cooked', 9],
    ['bakedPotato', 6],
    ['carrot', 4],
    ['potato', 1],
    ['bread', 7],
    ['apple', 4],
    ['meat', 2],
  ].sort(([a], [b]) => Number(b === heldItem()) - Number(a === heldItem())))
    if ((inventory[id] || 0) > 0) {
      if (hunger >= 20 && health >= 20) {
        toast('你已经吃饱了。');
        return;
      }
      inventory[id]--;
      hunger = Math.min(20, hunger + value);
      health = Math.min(20, health + value * 0.35);
      beep(440, 0.13, 'triangle');
      toast(`吃了${ITEMS[id].name} · 饱食 +${value}`);
      updateHUD();
      return;
    }
  toast('没有食物了。树叶会掉落苹果，也可以种植蔬菜、烤马铃薯或狩猎。');
}
function hurt(amount, cause = 'combat') {
  if (creative || damageCooldown > 0) return;
  if (cause === 'combat' || cause === 'burn') {
    const protection = equipment.protection();
    for (const id of Object.values(equipment.armor))
      wearItem(id, Math.max(1, Math.ceil(amount / 4)));
    amount *= 1 - protection * 0.04;
  }
  health = Math.max(0, health - amount);
  damageCooldown = 0.8;
  $('#damage').style.opacity = '.6';
  setTimeout(() => ($('#damage').style.opacity = '0'), 250);
  soundFX.play('hurt');
  if (health <= 0) {
    refundJobs();
    lastDeath = [camera.position.x, playerFeet() + 0.4, camera.position.z];
    for (const [id, n] of Object.entries(inventory)) {
      const wear = ITEMS[id]?.durability
        ? { [id]: equipment.wear[id] || [] }
        : {};
      drops.spawn(id, n, lastDeath, wear, null, 600);
    }
    inventory = {};
    equipment = new Equipment();
    safeSpawn();
    health = 20;
    hunger = 12;
    toast('你在出生点醒来。物资留在死亡地点，M 查看红色 × 标记。');
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
function useGoldenApple() {
  if (heldItem() !== 'goldenApple') return false;
  if (health >= 20 && hunger >= 20) {
    toast('你现在状态很好，留着金苹果吧。');
    return true;
  }
  if (!creative) inventory.goldenApple--;
  health = Math.min(20, health + 8);
  hunger = Math.min(20, hunger + 8);
  toast('金苹果 · 生命 +8 · 饱食 +8');
  updateHUD();
  return true;
}
function drinkMilk() {
  if (heldItem() !== 'milkBucket') return false;
  if (!creative) {
    inventory.milkBucket--;
    addItem('bucket');
  }
  hotbar[selected] = 'bucket';
  hunger = Math.min(20, hunger + 4);
  health = Math.min(20, health + 2);
  toast('喝下牛奶 · 饱食 +4');
  updateHUD();
  return true;
}
function explode(center) {
  syncDecor();
  const origin = worldToAxial(center.x, center.z),
    changed = new Set();
  const distance = center.distanceTo(
    camera.position.clone().add(new THREE.Vector3(0, -0.8, 0)),
  );
  if (distance < 5) hurt(Math.max(1, 14 * (1 - distance / 5)));
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
        world.set(q, y, r, null);
        if (!creative && Math.random() < 0.6)
          dropAt(BLOCKS[type].drop || type, 1, q, y, r);
        for (const [id, n] of Object.entries(chests.get(k) || {})) {
          const wear = ITEMS[id]?.durability
            ? { [id]: chestWear.get(k)?.[id] || [] }
            : {};
          dropAt(id, n, q, y, r, wear);
        }
        const job = furnaceJobs.get(k);
        if (job?.paid) {
          dropAt(job.input, 1, q, y, r);
          dropAt('coal', 1, q, y, r);
        }
        chests.delete(k);
        world.structureFeatures.add('chest:' + k);
        chestWear.delete(k);
        furnaceJobs.delete(k);
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
  const critical = !grounded && vy < -1 && !creative;
  graphics.swing();
  hitMob(
    mob,
    (item?.damage || 2) * (critical ? 1.5 : 1),
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
  );
  attackCooldown = 0.25;
  graphics.swing();
  beep(240, 0.05, 'triangle');
  wearItem('bow');
}
function movePlayer(dt) {
  const fluidAt = (height) => {
    const a = worldToAxial(camera.position.x, camera.position.z),
      y = Math.floor(height),
      f = world.fluids.get(a.q, y, a.r);
    return f && height < y + fluidHeight(f) ? f : null;
  };
  const feetFluid = fluidAt(playerFeet() + 0.12),
    headFluid = fluidAt(camera.position.y);
  const swimming = !!feetFluid,
    fly = creative;
  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const norm = Math.hypot(forward, side);
  if (norm) {
    forward /= norm;
    side /= norm;
  }
  const sneaking = keys.has('ControlLeft') || keys.has('ControlRight');
  const sprint =
      keys.has('ShiftLeft') && forward > 0 && hunger > 2 && !fly && !sneaking,
    speed = fly
      ? 10
      : swimming
        ? LIQUIDS[feetFluid.type].speed
        : sneaking
          ? 2.1
          : sprint
            ? 7
            : 4.8;
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
      !sneaking || !grounded || swimming || collides(x, feet - 0.16, z);
    if (
      !collides(camera.position.x + dx, feet, camera.position.z) &&
      supported(camera.position.x + dx, camera.position.z)
    )
      camera.position.x += dx;
    else motion.x = 0;
    if (
      !collides(camera.position.x, feet, camera.position.z + dz) &&
      supported(camera.position.x, camera.position.z + dz)
    )
      camera.position.z += dz;
    else motion.z = 0;
    if (!swimming && motion.takeJump(keys.has('Space'), grounded)) {
      vy = 8.5;
      grounded = false;
      beep(180, 0.04, 'sine', 0.01);
    }
    if (swimming) {
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
    if (headFluid) hunger = Math.max(0, hunger - dt * 0.12);
    hunger = Math.max(
      0,
      hunger - dt * (norm ? (sprint ? 0.024 : 0.012) : 0.003),
    );
    if (hunger > 14 && health < 20) health = Math.min(20, health + dt * 0.14);
    if (hunger <= 0) hurt(dt * 2, 'hunger');
  }
  const a = worldToAxial(camera.position.x, camera.position.z);
  if (feetFluid && LIQUIDS[feetFluid.type].damage)
    hurt(LIQUIDS[feetFluid.type].damage, 'burn');
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
  if (b && ITEMS[b.dataset.item].armorSlot) {
    equipment.equip(b.dataset.item, inventory, creative);
    updateHUD();
    renderCraft();
    saveGame();
    return;
  }
  if (b && canEquip(b.dataset.item)) {
    hotbar[selected] = b.dataset.item;
    updateHUD();
    renderCraft();
    beep(420, 0.03);
  }
};
$('#armor-slots').onclick = (e) => {
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
  const sm = e.target.closest('[data-smelt]');
  if (sm) smelt(sm.dataset.smelt);
  const st = e.target.closest('[data-store]'),
    tk = e.target.closest('[data-take]');
  if (st || tk) {
    const storage = chests.get(stationKey) || {},
      id = st ? st.dataset.store : tk.dataset.take,
      from = st ? inventory : storage,
      to = st ? storage : inventory,
      n = Math.min(
        10,
        from[id] || 0,
        st || creative ? Infinity : roomFor(inventory, id),
        ITEMS[id]?.durability ? 256 - (to[id] || 0) : 1e6,
      );
    const storageWear = chestWear.get(stationKey) || {};
    transferWear(
      st ? equipment.wear : storageWear,
      st ? storageWear : equipment.wear,
      id,
      n,
      from[id] || 0,
      to[id] || 0,
    );
    chestWear.set(stationKey, storageWear);
    from[id] = (from[id] || 0) - n;
    to[id] = (to[id] || 0) + n;
    chests.set(stationKey, storage);
    equipment.sync(inventory, creative);
    renderChest();
    updateHUD();
    saveGame();
  }
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
  refundJobs();
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
  refundJobs();
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
$('#quality').onchange = (e) => graphics.setQuality(Number(e.target.value));
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
  if (e.button === 2) place();
});
document.addEventListener('mouseup', (e) => {
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
    eat();
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
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  bowCharge = 0;
  motion.reset();
  leftDown = false;
  if (hasGame && !overlay) openOverlay('#pause-overlay');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    refundJobs();
    saveGame();
    if (hasGame && !overlay) openOverlay('#pause-overlay');
  }
});
addEventListener('beforeunload', () => {
  refundJobs();
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
      else if (action === 'eat') eat();
      else
        openOverlay(
          action === 'craft'
            ? '#craft-overlay'
            : action === 'map'
              ? '#map-overlay'
              : '#pause-overlay',
        );
    };
    b.onpointerup = () => {
      if (b.dataset.action === 'mine') releaseBow();
      leftDown = false;
    };
    b.onpointercancel = () => {
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
    const physicsSteps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < physicsSteps; i++) movePlayer(dt / physicsSteps);
    world.fluids.step(dt);
    flushFluidChanges();
    target = graphics.target(!!ITEMS[hotbar[selected]]?.bucket);
    if (leftDown && heldItem() === 'bow') {
      bowCharge = Math.min(1.1, bowCharge + dt);
      mining = 0;
      $('#mine-progress i').style.width = (bowCharge / 1.1) * 100 + '%';
    } else if (leftDown) {
      if (!attack()) mine(dt);
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
          'chest',
          'farmland',
          'bed',
          'portal',
          'endportal',
          'spawner',
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
    villagerTarget = villagers.target(camera, target?.distance ?? Infinity);
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
    updateMobs(dt);
    drops.update(dt, world, camera, collectDrop);
    projectiles.update(
      dt,
      world,
      creatures,
      camera,
      hitMob,
      () => addItem('arrow'),
      (amount) => hurt(amount),
    );
    $('#combat-status').textContent =
      heldItem() === 'bow'
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
    for (const [k, job] of furnaceJobs) {
      job.remaining -= dt;
      if (job.remaining <= 0) {
        addItem(job.output);
        furnaceJobs.delete(k);
        toast(`${ITEMS[job.output].name}已完成；背包满时留在脚边。`);
        beep(600, 0.2);
      }
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
    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      saveGame();
    }
  }
  graphics.bowDraw = bowCharge / 1.1;
  graphics.frame(
    playing ? dt : 0,
    time,
    playing,
    moved > 0,
    leftDown && heldItem() !== 'bow',
    weather,
    weatherColumns,
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
