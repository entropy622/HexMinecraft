import './style.css';
import * as THREE from 'three';
import {
  BLOCKS,
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
import { Graphics, createCreature } from './graphics.js';
import { World, DIMENSIONS, WORLD_HEIGHT } from './world.js';
import { SAVE_KEY, validateSave, migrateSave } from './save.js';
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
  <footer class="landing-footer"><div class="tags"><span><b>⬡</b> 六棱世界</span><span><b>✧</b> 生存与创造</span><span><b>◈</b> 每一面，都有可能</span></div><div class="edition">AN EXPERIMENT IN SIX DIRECTIONS<br>v0.2 — BEYOND THE HORIZON</div></footer>
 </section>
 <div id="hud" class="hidden">
  <div class="hud-top"><div><div class="wordmark">HEXWILD <small>六野</small></div><div class="world-info" id="world-info"></div></div><div class="world-badge"><span id="dimension-name">主世界</span><strong id="biome-name">青翠平原</strong><div id="compass">N · NE · SE · S · SW · NW</div></div></div>
  <div id="crosshair"></div><div id="mine-progress"><i></i></div><div id="target" class="hidden"></div>
  <div class="bottom-hud"><div id="selected-name"></div><div class="vitals"><span class="health" id="health"></span><span class="tool" id="tool"></span><span class="hunger" id="hunger"></span></div><div id="hotbar"></div><div class="controls-hint"><span><kbd>WASD</kbd>移动</span><span><kbd>空格</kbd>跳跃</span><span><kbd>左 / 右键</kbd>采集 / 放置</span><span><kbd>E</kbd>交互</span><span><kbd>B</kbd>合成</span><span><kbd>M</kbd>地图</span><span><kbd>ESC</kbd>菜单</span></div></div>
  <div class="hud-left" id="location"></div><canvas id="minimap" width="200" height="220"></canvas>
  <div id="mobile-controls"><div class="mobile-top"><button data-action="craft" aria-label="合成">B</button><button data-action="map" aria-label="地图">M</button><button data-action="pause" aria-label="暂停">Ⅱ</button><button data-action="eat" aria-label="吃东西">F</button></div><div class="dpad"><button data-key="KeyW" aria-label="前进">↑</button><button data-key="KeyA" aria-label="左移">←</button><button data-key="KeyS" aria-label="后退">↓</button><button data-key="KeyD" aria-label="右移">→</button></div><div class="mobile-actions"><button data-action="mine" aria-label="采集">挖</button><button data-action="place" aria-label="放置">放</button><button data-key="Space" aria-label="跳跃">↟</button><button data-action="interact" aria-label="交互">E</button><button data-key="ShiftLeft" aria-label="下降或冲刺">⇣</button></div></div>
 </div>
 <div id="pickups" aria-live="polite"></div><div id="travel" aria-live="polite"><span>穿越维度</span></div><div id="underwater"></div><div id="damage"></div><div id="toast" role="status" aria-live="polite"></div>
 <section id="craft-overlay" class="overlay hidden"><div class="panel"><div class="panel-head"><div><div class="eyebrow">THE HONEYCOMB WORKSHOP</div><h2>蜂巢工坊</h2></div><button class="close" data-close aria-label="关闭合成">×</button></div><div class="craft-layout"><div class="recipe-sidebar"><input id="recipe-search" placeholder="搜索配方…" aria-label="搜索配方"><nav class="recipe-list" id="recipes" aria-label="合成配方"></nav></div><div class="craft-main"><h3 id="recipe-title"></h3><p id="recipe-desc"></p><div class="honeycomb" id="pattern"></div><div class="recipe-cost" id="recipe-cost"></div><button class="primary" id="craft-button">合成</button><p id="station-note"></p></div></div><div class="inventory-section"><div class="section-label">你的背包 <span class="tiny">/ 点击建筑材料，装入当前快捷栏</span></div><div class="inventory-grid" id="inventory"></div><p class="panel-note">工具会自动装备 · E 使用工作台 / 熔炉 / 箱子 / 耕种 · F 食用 · 鼠标滚轮或 1–9 切换方块</p></div></div></section>
 <section id="pause-overlay" class="overlay hidden"><div class="panel pause-panel"><div class="eyebrow">TAKE A BREATH</div><h2 id="pause-title">旷野会等你。</h2><p id="pause-description">旅途已暂歇。世界会记住你留下的每一块砖。</p><div class="pause-actions"><button class="primary" id="resume">回到旷野</button><div class="two-col"><button id="export">导出存档</button><button id="import">导入存档</button></div><div class="two-col"><button id="mode-toggle">切换自由建造</button><button id="respawn">返回出生点</button></div><button id="home">保存并返回首页</button></div><div class="settings-row"><label for="sensitivity">视角灵敏度</label><input id="sensitivity" type="range" min="0.5" max="2" step="0.1" value="1"></div><div class="settings-row"><span>游戏音效</span><button id="sound-toggle">开启</button></div><div class="settings-row"><label for="volume">音效音量</label><input id="volume" type="range" min="0" max="1" step="0.05" value="0.45"></div><div class="settings-row"><label for="quality">渲染精度</label><select id="quality"><option value="1">均衡</option><option value="0.65">流畅</option><option value="1.7">清晰</option></select></div><div class="dimension-controls" id="dimension-controls"><span>创造模式 · 维度旅行</span><div><button data-dimension="overworld">主世界</button><button data-dimension="nether">下界</button><button data-dimension="end">末地</button></div><p class="panel-note">生存模式中，在工坊制作传送门，放置后按 E 穿越。返回门自动生成。</p></div><div class="help-grid"><span><kbd>W A S D</kbd>移动 / Shift 冲刺</span><span><kbd>空格</kbd>跳跃 / 水中上浮</span><span><kbd>左键长按</kbd>采集 / 攻击</span><span><kbd>右键</kbd>放置方块</span><span><kbd>E</kbd>交互 / 耕种 / 收获</span><span><kbd>B / Tab</kbd>背包与蜂巢合成</span><span><kbd>F / M</kbd>吃东西 / 查看地图</span><span><kbd>创造模式</kbd>空格上升 / Shift 下降</span></div><div class="world-form"><label for="seed">新世界种子</label><input id="seed" type="number" min="0" max="999999" value="624"><button id="new-world">创建新世界</button></div><p class="panel-note">自动保存在本浏览器。创建新世界会替换当前存档，可先导出备份。手机：左侧方向键移动，拖动右半屏转动视角。</p><input class="hidden" type="file" id="save-file" accept=".json,application/json"></div></section>
 <section id="map-overlay" class="overlay hidden"><div class="panel map-panel"><div class="panel-head"><div><div class="eyebrow">FIELD NOTES / 无限旷野</div><h2>六野图志</h2></div><button class="close" data-close aria-label="关闭地图">×</button></div><canvas id="world-map" width="700" height="700"></canvas><p class="panel-note">▲ 你的位置　 ◈ 传送门<br>地图跟随玩家，显示周围已加载区域。不同维度分别保存地形与建筑。</p></div></section>
 <section id="station-overlay" class="overlay hidden"><div class="panel station-panel"><div class="eyebrow">A LITTLE PLACE OF YOUR OWN</div><button class="close" data-close style="float:right" aria-label="关闭交互">×</button><h2 id="station-title"></h2><div id="station-content"></div></div></section>
`;

let graphics;
try {
  graphics = new Graphics($('#world'));
} catch (error) {
  $('#loading').innerHTML =
    '<h2>世界还没能打开</h2><p>请使用支持 WebGL 的现代浏览器，并启用硬件加速。</p>';
  throw error;
}
const camera = graphics.camera;
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
  creatures = [],
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
  mobCenter = null;
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
  grounded = false;
  for (
    let n = 0;
    n < WORLD_HEIGHT &&
    collides(camera.position.x, playerFeet(), camera.position.z);
    n++
  )
    camera.position.y++;
}
function createMobs() {
  for (const m of creatures) {
    graphics.scene.remove(m.mesh);
    m.mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
  creatures = [];
  const center = worldToAxial(camera.position.x, camera.position.z);
  mobCenter = center;
  for (let i = 0; i < 15; i++) {
    const q =
        center.q + Math.round(hash(i, 52, center.q, world.seed) * 34 - 17),
      r = center.r + Math.round(hash(i, 78, center.r, world.seed) * 30 - 15),
      h = world.surface(q, r);
    if (h < 6 || h > 40) continue;
    const kind = dimension === 'overworld' && i < 10 ? 'sheep' : 'crawler',
      p = axialToWorld(q, r),
      mesh = createCreature(kind, dimension);
    mesh.position.set(p.x, h, p.z);
    graphics.scene.add(mesh);
    creatures.push({
      kind,
      mesh,
      hp: kind === 'sheep' ? 6 : 12,
      angle: hash(i, 12) * 6.28,
      think: 0,
      hit: 0,
    });
  }
}
function startGame(mode = false, save = null) {
  if (save) save = migrateSave(save);
  const seed = save?.seed ?? Number($('#seed').value || 624);
  dimension = save?.dimension || 'overworld';
  dimensionStates = save?.dimensions ? structuredClone(save.dimensions) : {};
  const data = dimensionStates[dimension] || {
    edits: [],
    crops: [],
    chests: [],
  };
  world = new World(seed, dimension, {
    legacy: data.legacy,
    edits: data.edits,
    load: false,
  });
  inventory = save ? { ...save.inventory } : { dirt: 12, apple: 3, seed: 3 };
  tool = save?.tool || 0;
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
  createMobs();
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
    crops: [...crops],
    chests: [...chests],
    respawn: respawnPoint,
    position: camera.position.toArray(),
  };
}
function syncDecor() {
  for (const [k, t] of crops) {
    const [q, , r] = k.split(',').map(Number);
    if (world.loaded(q, r)) graphics.crop(k, time - t);
  }
}
function travel(to) {
  if (!hasGame || !DIMENSIONS[to] || to === dimension) return false;
  refundJobs();
  captureDimension();
  const seed = world.seed;
  world.clearLoaded();
  dimension = to;
  const data = dimensionStates[to] || { edits: [], crops: [], chests: [] };
  world = new World(seed, to, {
    legacy: data.legacy,
    edits: data.edits,
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
  leftDown = false;
  keys.clear();
  mining = 0;
  graphics.build(world, a.q, a.r);
  if (collides(camera.position.x, playerFeet(), camera.position.z)) safeSpawn();
  createMobs();
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
    version: 2,
    dimension,
    dimensions: dimensionStates,
    seed: world.seed,
    inventory: savedInventory,
    tool,
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
    const raw =
      localStorage.getItem(SAVE_KEY) || localStorage.getItem('hexwild-save-v1');
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
  leftDown = false;
  keys.clear();
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
      : recipe.requires > tool && !creative
        ? '需要先制作上一等级的镐'
        : recipe.id.startsWith('pick') && tool >= Number(recipe.id.slice(-1))
          ? '已装备此等级或更好的工具'
          : station
            ? '六格环绕，一格居中。每次合成，都是新的可能。'
            : '随身合成 · 制作工作台以解锁更多配方';
  $('#inventory').innerHTML = Object.entries(ITEMS)
    .filter(
      ([id]) =>
        (creative && BLOCKS[id] && id !== 'bedrock') ||
        (inventory[id] || 0) > 0,
    )
    .map(
      ([id, item]) =>
        `<button class="inv-item ${hotbar[selected] === id ? 'selected' : ''}" data-item="${id}" title="${BLOCKS[id] ? '装入快捷栏 ' + (selected + 1) : item.name}">${icon(id)}<span>${item.name}</span><b>${creative && BLOCKS[id] ? '∞' : inventory[id] || 0}</b></button>`,
    )
    .join('');
}
function doCraft() {
  const recipe = RECIPES[selectedRecipe];
  if (creative)
    inventory[recipe.id] = (inventory[recipe.id] || 0) + recipe.count;
  else if (!craft(recipe, inventory, tool, nearbyType('workbench'))) return;
  if (recipe.id.startsWith('pick'))
    tool = Math.max(tool, Number(recipe.id.slice(-1)));
  if (BLOCKS[recipe.id] && !hotbar.includes(recipe.id))
    hotbar[selected] = recipe.id;
  soundFX.play('craft');
  graphics.swing();
  toast(`已制作 ${ITEMS[recipe.id].name} ×${recipe.count}`);
  renderCraft();
  updateHUD();
  saveGame();
}
function updateHUD() {
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
  ]);
  if (hudSignature !== signature) {
    hudSignature = signature;
    $('#hotbar').innerHTML = hotbar
      .map(
        (id, i) =>
          `<button class="slot ${i === selected ? 'active' : ''}" data-slot="${i}" aria-label="${i + 1} ${ITEMS[id].name} ${creative ? '无限' : inventory[id] || 0}"><span class="slot-inner">${icon(id)}</span><span class="num">${i + 1}</span><span class="count">${creative ? '∞' : inventory[id] || 0}</span></button>`,
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
  $('#tool').textContent = tool ? ITEMS['pick' + tool].name : '徒手';
  const a = worldToAxial(camera.position.x, camera.position.z),
    phase = time % 600;
  $('#world-info').textContent =
    `第 ${Math.floor(time / 600) + 1} 天 / ${phase < 270 ? '日光' : phase < 330 ? '黄昏' : phase < 570 ? '星夜' : '黎明'} · ${creative ? '创造' : '生存'}`;
  $('#location').innerHTML =
    `${DIMENSIONS[dimension].name} · 种子 ${world.seed}<br>Q ${a.q} / R ${a.r} / Y ${Math.floor(playerFeet())}<br>${creative ? '空格 ↑ · Shift ↓' : 'F 食用 · Shift 冲刺'}`;
  $('#dimension-name').textContent = DIMENSIONS[dimension].name;
  $('#biome-name').textContent = world.biome(a.q, a.r);
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
  graphics.setHeld(hotbar[selected], tool);
}
function addItem(id, n = 1) {
  const popup = document.createElement('div');
  popup.className = 'pickup';
  popup.innerHTML =
    icon(id) + '<span>' + ITEMS[id].name + '</span><b>+' + n + '</b>';
  $('#pickups').append(popup);
  while ($('#pickups').children.length > 4) $('#pickups').firstChild.remove();
  setTimeout(() => popup.remove(), 2400);
  inventory[id] = Math.min(1000000, (inventory[id] || 0) + n);
  updateHUD();
}
function mine(dt) {
  if (!target?.type) {
    mining = 0;
    return;
  }
  const data = BLOCKS[target.type];
  if (data.hardness === Infinity) {
    mining = 0;
    return;
  }
  if (!creative && (data.tool || 0) > tool) {
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
  mining += dt * (creative ? 12 : 1 + tool * 0.7);
  $('#mine-progress i').style.width =
    `${Math.min(100, (mining / data.hardness) * 100)}%`;
  if (mining < data.hardness) return;
  const { q, y, r, type } = target;
  world.set(q, y, r, null);
  graphics.updateBlock(q, y, r);
  graphics.burst(q, y, r, data.color);
  soundFX.play('break', type);
  if (!creative) {
    addItem(data.drop || type);
    if (type === 'leaves') {
      if (Math.random() < 0.3) addItem('apple');
      if (Math.random() < 0.45) addItem('seed');
    }
    if (type === 'grass' && Math.random() < 0.35) addItem('seed');
    hunger = Math.max(0, hunger - 0.022);
  }
  if (crops.has(k)) {
    crops.delete(k);
    graphics.removeCrop(k);
    addItem('seed');
  }
  if (chests.has(k)) {
    for (const [id, n] of Object.entries(chests.get(k))) addItem(id, n);
    chests.delete(k);
  }
  const job = furnaceJobs.get(k);
  if (job?.paid) {
    addItem(job.input);
    addItem('coal');
  }
  furnaceJobs.delete(k);
  mining = 0;
  target = null;
}
function place() {
  if (!playing || !target) return;
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
    crops.delete(cropBelow);
    graphics.removeCrop(cropBelow);
    if (!creative) inventory.seed = (inventory.seed || 0) + 1;
  }
  if (!creative) inventory[id]--;
  graphics.updateBlock(q, y, r);
  if (id === 'chest') chests.set(key(q, y, r), {});
  soundFX.play('place', id);
  graphics.swing();
  updateHUD();
}
function interact() {
  if (!playing) return;
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
    if (time % 600 > 300) {
      time = Math.floor(time / 600) * 600 + 675;
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
  if (type === 'chest') {
    stationKey = k;
    openOverlay('#station-overlay');
    renderChest();
    return;
  }
  if (crops.has(k)) {
    if (time - crops.get(k) < 90) {
      toast(
        `麦苗还在生长 · ${Math.min(99, Math.floor(((time - crops.get(k)) / 90) * 100))}%`,
      );
      return;
    }
    crops.delete(k);
    graphics.removeCrop(k);
    addItem('wheat', 2);
    addItem('seed', 2);
    beep(600, 0.12);
    toast('收获小麦 ×2、麦种 ×2');
    return;
  }
  if (['grass', 'dirt', 'farmland'].includes(type)) {
    if (!creative && !inventory.hoe) {
      toast('先在蜂巢工坊制作锄头，再对土地按 E。');
      return;
    }
    if (type !== 'farmland') {
      if (world.get(q, y + 1, r)) {
        toast('先清理土地上方的方块。');
        return;
      }
      world.set(q, y, r, 'farmland');
      graphics.updateBlock(q, y, r);
      toast('土地已翻耕。再次按 E 播种。');
      return;
    }
    if (!creative && (inventory.seed || 0) < 1) {
      toast('需要麦种。采集树叶和草地可以找到种子。');
      return;
    }
    if (world.get(q, y + 1, r)) return;
    if (!creative) inventory.seed--;
    crops.set(k, time);
    graphics.crop(k, 0);
    updateHUD();
    toast('已播种。约 90 秒后可按 E 收获小麦。');
    return;
  }
  openOverlay('#craft-overlay');
}
function renderFurnace() {
  const job = furnaceJobs.get(stationKey);
  $('#station-title').textContent = '六棱熔炉';
  $('#station-content').innerHTML =
    `<p>一份煤燃烧八秒，熔炼一份铁矿，或烤熟一份生肉。<br>铁矿 ${inventory.iron || 0} · 煤 ${inventory.coal || 0} · 生肉 ${inventory.meat || 0}<br>${job ? `炉火正旺：${ITEMS[job.output].name}，剩余 ${Math.ceil(job.remaining)} 秒（关闭面板后继续）` : '加入原料，让炉火亮起来。'}</p><button class="primary" data-smelt="ingot" ${job || (!creative && (!(inventory.iron > 0) || !(inventory.coal > 0))) ? 'disabled' : ''}>熔炼铁锭</button><button data-smelt="cooked" ${job || (!creative && (!(inventory.meat > 0) || !(inventory.coal > 0))) ? 'disabled' : ''}>烤制肉排</button><p class="panel-note">完成后自动收入背包。离开游戏或拆除熔炉时，未完成的材料会退回。</p>`;
}
function smelt(output) {
  if (furnaceJobs.has(stationKey)) return;
  const input = output === 'ingot' ? 'iron' : 'meat';
  if (!creative && (!(inventory[input] > 0) || !(inventory.coal > 0))) return;
  if (!creative) {
    inventory[input]--;
    inventory.coal--;
  }
  furnaceJobs.set(stationKey, { output, input, remaining: 8, paid: !creative });
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
    `<p>点击背包材料存入 10 个，点击箱内物品取出 10 个。</p><div class="section-label" style="margin-top:18px">背包 → 箱子</div><div class="inventory-grid">${
      Object.entries(inventory)
        .filter(
          ([id, n]) =>
            n > 0 && !['pick1', 'pick2', 'pick3', 'sword', 'hoe'].includes(id),
        )
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
    ['cooked', 9],
    ['bread', 7],
    ['apple', 4],
    ['meat', 2],
  ])
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
  toast('没有食物了。树叶会掉落苹果，也可以种麦、狩猎。');
}
function hurt(amount) {
  if (creative || damageCooldown > 0) return;
  health = Math.max(0, health - amount);
  damageCooldown = 0.8;
  $('#damage').style.opacity = '.6';
  setTimeout(() => ($('#damage').style.opacity = '0'), 250);
  soundFX.play('hurt');
  if (health <= 0) {
    safeSpawn();
    health = 20;
    hunger = 12;
    toast('你在出生点醒来。背包已保留，带点食物再出发吧。');
    saveGame();
  }
  updateHUD();
}
function updateMobs(dt) {
  const night = dimension !== 'overworld' || time % 600 > 310;
  for (let i = creatures.length - 1; i >= 0; i--) {
    const m = creatures[i];
    m.hit = Math.max(0, m.hit - dt);
    m.mesh.scale.setScalar(
      m.hit > 0 ? 1 + Math.sin((m.hit / 0.3) * Math.PI) * 0.13 : 1,
    );
    m.mesh.visible = m.kind === 'sheep' || night;
    if (!m.mesh.visible) continue;
    const p = m.mesh.position,
      dist = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
    m.think -= dt;
    if (m.kind === 'crawler' && dist < 17) {
      m.angle = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    } else if (m.think <= 0) {
      m.think = 2 + Math.random() * 4;
      m.angle += (Math.random() - 0.5) * 2.5;
    }
    const speed = m.kind === 'crawler' ? 1.55 : 0.45,
      dx = Math.sin(m.angle) * speed * dt,
      dz = Math.cos(m.angle) * speed * dt,
      a = worldToAxial(p.x + dx, p.z + dz),
      h = world.surface(a.q, a.r);
    if (h > 3 && h <= p.y + 1.1 && h >= p.y - 2 && world.loaded(a.q, a.r)) {
      p.x += dx;
      p.z += dz;
      p.y = THREE.MathUtils.lerp(p.y, h, Math.min(1, dt * 8));
    } else m.angle += Math.PI * 0.55;
    m.mesh.rotation.y = m.angle + Math.PI;
    m.mesh.children
      .slice(-4)
      .forEach(
        (leg, j) =>
          (leg.rotation.x = Math.sin(time * 6 + (j % 2) * Math.PI) * 0.2),
      );
    if (m.kind === 'crawler' && dist < 1.1 && Math.abs(p.y - playerFeet()) < 2)
      hurt(2);
  }
}
function attack() {
  if (attackCooldown > 0) return false;
  graphics.ray.setFromCamera(new THREE.Vector2(), camera);
  const meshes = creatures.filter((m) => m.mesh.visible).map((m) => m.mesh),
    hit = graphics.ray
      .intersectObjects(meshes, true)
      .find((h) => h.distance < 3.5);
  if (!hit || (target && hit.distance > target.distance)) return false;
  let obj = hit.object;
  while (obj.parent && !meshes.includes(obj)) obj = obj.parent;
  const mob = creatures.find((m) => m.mesh === obj);
  if (!mob) return false;
  attackCooldown = 0.45;
  graphics.swing();
  mob.hit = 0.3;
  mob.hp -= inventory.sword ? 7 : tool ? 3 : 2;
  mob.angle = yaw;
  beep(140, 0.07, 'triangle');
  const a = worldToAxial(mob.mesh.position.x, mob.mesh.position.z);
  graphics.burst(
    a.q,
    mob.mesh.position.y,
    a.r,
    mob.kind === 'sheep' ? '#ded1b0' : '#7db4a4',
  );
  if (mob.hp <= 0) {
    graphics.scene.remove(mob.mesh);
    mob.mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    creatures.splice(creatures.indexOf(mob), 1);
    addItem(
      mob.kind === 'sheep' ? 'meat' : 'crystal',
      mob.kind === 'sheep' ? 2 : 1,
    );
    if (mob.kind === 'sheep') addItem('wool', 3);
    else addItem(dimension === 'nether' ? 'ember' : 'pearl');
    toast(
      mob.kind === 'sheep'
        ? '获得生肉 ×2、羊毛 ×3 · 可以做床了'
        : dimension === 'nether'
          ? '烈焰余烬 · 萤晶 +1 · 烈焰粉 +1'
          : '夜行者消散了 · 萤晶 +1 · 末影珍珠 +1',
    );
  }
  return true;
}
function movePlayer(dt) {
  const liquid = DIMENSIONS[dimension].liquid;
  const swimming = liquid !== null && playerFeet() < liquid - 0.08,
    fly = creative;
  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const norm = Math.hypot(forward, side);
  if (norm) {
    forward /= norm;
    side /= norm;
  }
  const sprint = keys.has('ShiftLeft') && hunger > 2 && !fly,
    speed = fly ? 10 : swimming ? 3 : sprint ? 7 : 4.8;
  const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed * dt,
    dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed * dt;
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
    if (!collides(camera.position.x + dx, feet, camera.position.z))
      camera.position.x += dx;
    if (!collides(camera.position.x, feet, camera.position.z + dz))
      camera.position.z += dz;
    if (grounded && keys.has('Space')) {
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
          if (vy < -13) hurt(Math.floor((-vy - 12) * 0.6));
        }
        vy = 0;
        break;
      }
      camera.position.y += dy / steps;
    }
    if (swimming && camera.position.y < liquid)
      hunger = Math.max(0, hunger - dt * 0.12);
    hunger = Math.max(
      0,
      hunger - dt * (norm ? (sprint ? 0.024 : 0.012) : 0.003),
    );
    if (hunger > 14 && health < 20) health = Math.min(20, health + dt * 0.14);
    if (hunger <= 0) hurt(dt * 2);
  }
  const a = worldToAxial(camera.position.x, camera.position.z);
  if (swimming && dimension === 'nether') hurt(4);
  if (camera.position.y < -12) {
    safeSpawn();
    hurt(6);
  }
  $('#underwater').style.display =
    liquid !== null && camera.position.y < liquid ? 'block' : 'none';
  $('#underwater').style.background =
    dimension === 'nether' ? '#ed5c2670' : '#238fa94a';
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
$('#inventory').onclick = (e) => {
  const b = e.target.closest('[data-item]');
  if (b && BLOCKS[b.dataset.item]) {
    hotbar[selected] = b.dataset.item;
    updateHUD();
    renderCraft();
    beep(420, 0.03);
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
      n = Math.min(10, from[id] || 0);
    from[id] = (from[id] || 0) - n;
    to[id] = (to[id] || 0) + n;
    chests.set(stationKey, storage);
    renderChest();
    updateHUD();
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
$('#quality').onchange = (e) =>
  graphics.renderer.setPixelRatio(
    Math.min(devicePixelRatio, Number(e.target.value)),
  );
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
document.addEventListener('mouseup', () => {
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
  if (
    e.code.startsWith('Digit') &&
    Number(e.code.slice(5)) >= 1 &&
    Number(e.code.slice(5)) <= 9
  ) {
    selected = Number(e.code.slice(5)) - 1;
    updateHUD();
  }
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
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
    b.onpointerup = b.onpointercancel = () => (leftDown = false);
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
    if (
      !mobCenter ||
      Math.hypot(cell.q - mobCenter.q, cell.r - mobCenter.r) > 20
    )
      createMobs();
    ambienceTimer += dt;
    if (ambienceTimer > 18) {
      ambienceTimer = 0;
      soundFX.play('ambient', dimension);
    }
    attackCooldown = Math.max(0, attackCooldown - dt);
    damageCooldown = Math.max(0, damageCooldown - dt);
    const physicsSteps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < physicsSteps; i++) movePlayer(dt / physicsSteps);
    target = graphics.target();
    if (leftDown) {
      if (!attack()) mine(dt);
    } else {
      mining = 0;
      miningKey = '';
      $('#mine-progress i').style.width = '0';
    }
    $('#target').classList.toggle('hidden', !target?.type);
    $('#target').textContent = target?.type
      ? BLOCKS[target.type].name +
        ([
          'workbench',
          'furnace',
          'chest',
          'farmland',
          'bed',
          'portal',
          'endportal',
        ].includes(target.type)
          ? ' · E 交互'
          : '')
      : '';
    updateMobs(dt);
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
        toast(`${ITEMS[job.output].name}已完成，收入背包。`);
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
  graphics.frame(playing ? dt : 0, time, playing, moved > 0, leftDown);
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
    step: (dt) => {
      time += dt;
      for (const [k, t] of crops) graphics.crop(k, time - t);
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
    setTool: (t) => (tool = t),
    damage: hurt,
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
    $('#sensitivity').value = sensitivity;
    $('#volume').value = soundFX.volume;
    $('#sound-toggle').textContent = sound ? '开启' : '关闭';
    if ([0.65, 1, 1.7].includes(p.quality)) $('#quality').value = p.quality;
    graphics.renderer.setPixelRatio(
      Math.min(devicePixelRatio, Number($('#quality').value)),
    );
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
        quality: Number($('#quality').value),
      }),
    );
  } catch {}
}
for (const id of ['sensitivity', 'volume', 'quality'])
  $('#' + id).addEventListener('change', savePreferences);
$('#sound-toggle').addEventListener('click', savePreferences);
restorePreferences();
