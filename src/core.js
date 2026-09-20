export const SQRT3 = Math.sqrt(3);
export const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];
export const BLOCKS = {
  grass: {
    name: '草地',
    color: '#7eaa62',
    side: '#8f7953',
    hardness: 0.42,
    drop: 'dirt',
  },
  dirt: { name: '泥土', color: '#a58b66', side: '#85684d', hardness: 0.35 },
  stone: { name: '岩石', color: '#a0aaa5', side: '#7a8785', hardness: 1.25 },
  sand: { name: '细沙', color: '#e6c98e', side: '#c9a975', hardness: 0.35 },
  wood: { name: '原木', color: '#c4a074', side: '#805f46', hardness: 0.65 },
  leaves: { name: '树叶', color: '#83ad6b', side: '#5d8b63', hardness: 0.18 },
  planks: { name: '木板', color: '#d7b47a', side: '#b58c59', hardness: 0.45 },
  crystal: {
    name: '萤晶',
    color: '#a5f5dc',
    side: '#51b8ad',
    hardness: 1.4,
    tool: 2,
  },
  coal: {
    name: '煤矿',
    color: '#566162',
    side: '#66726e',
    hardness: 1.2,
    tool: 1,
  },
  iron: {
    name: '铁矿',
    color: '#cda38a',
    side: '#8d8f86',
    hardness: 1.5,
    tool: 2,
  },
  brick: { name: '石砖', color: '#bcc4b7', side: '#8e9d94', hardness: 0.8 },
  glass: { name: '琥珀玻璃', color: '#edcc88', side: '#b89762', hardness: 0.3 },
  lantern: { name: '萤灯', color: '#ffdf92', side: '#e7b259', hardness: 0.3 },
  workbench: {
    name: '工作台',
    color: '#e0b87b',
    side: '#98704e',
    hardness: 0.6,
  },
  furnace: { name: '熔炉', color: '#727b7a', side: '#4a5759', hardness: 1 },
  chest: { name: '储物箱', color: '#dbaf69', side: '#9b724c', hardness: 0.6 },
  bed: { name: '野营床', color: '#d99175', side: '#aa795c', hardness: 0.45 },
  farmland: {
    name: '耕地',
    color: '#665244',
    side: '#85684d',
    hardness: 0.3,
    drop: 'dirt',
  },
  snow: { name: '雪块', color: '#e0eeee', side: '#b5ced5', hardness: 0.3 },
  netherrack: {
    name: '下界岩',
    color: '#965e61',
    side: '#713f47',
    hardness: 0.5,
  },
  basalt: { name: '玄武岩', color: '#625563', side: '#443e4d', hardness: 1.2 },
  crimsonwood: {
    name: '绯红菌柄',
    color: '#c08386',
    side: '#813f57',
    hardness: 0.65,
    drop: 'wood',
  },
  shroom: {
    name: '绯红菌盖',
    color: '#de696e',
    side: '#a33f5c',
    hardness: 0.2,
  },
  glowstone: {
    name: '萤石',
    color: '#ffe29d',
    side: '#d39955',
    hardness: 0.55,
    drop: 'crystal',
  },
  endstone: {
    name: '末地石',
    color: '#dedbb0',
    side: '#b5b294',
    hardness: 1.2,
  },
  obsidian: {
    name: '黑曜石',
    color: '#544d6d',
    side: '#302d44',
    hardness: 2.5,
    tool: 3,
  },
  diamond: {
    name: '钻石矿',
    color: '#86e4ee',
    side: '#548c99',
    hardness: 1.8,
    tool: 3,
  },
  portal: {
    name: '下界传送门',
    color: '#bd80ed',
    side: '#724298',
    hardness: 1,
    nonSolid: true,
  },
  endportal: {
    name: '末地传送门',
    color: '#85e7d3',
    side: '#387e81',
    hardness: 1,
    nonSolid: true,
  },
  bedrock: {
    name: '基岩',
    color: '#536463',
    side: '#3c4e4e',
    hardness: Infinity,
  },
};
export const ITEMS = {
  ...BLOCKS,
  bucket: { name: '铁桶', color: '#c8d1d5', bucket: 'empty' },
  waterBucket: { name: '水桶', color: '#62a6ee', bucket: 'water' },
  lavaBucket: { name: '岩浆桶', color: '#ff792b', bucket: 'lava' },
  glowBucket: { name: '萤晶液桶', color: '#7ef8cb', bucket: 'glow' },
  wool: { name: '羊毛', color: '#ede1c7' },
  pick1: { name: '木镐', color: '#cba16a' },
  pick2: { name: '石镐', color: '#a9b8b3' },
  pick3: { name: '铁镐', color: '#e5d8c5' },
  pick4: { name: '钻石镐', color: '#83dce7' },
  pearl: { name: '末影珍珠', color: '#77c4ba' },
  ember: { name: '烈焰粉', color: '#f5ad61' },
  sword: { name: '铁剑', color: '#c6d9dc' },
  hoe: { name: '锄头', color: '#bdbda4' },
  ingot: { name: '铁锭', color: '#e2d6c6' },
  seed: { name: '麦种', color: '#b7c071' },
  wheat: { name: '小麦', color: '#e3c170' },
  apple: { name: '苹果', color: '#d88666' },
  bread: { name: '面包', color: '#dcb17b' },
  meat: { name: '生肉', color: '#cf9786' },
  cooked: { name: '烤肉', color: '#bd875d' },
};
export const canEquip = (id) =>
  Object.hasOwn(BLOCKS, id) || (Object.hasOwn(ITEMS, id) && !!ITEMS[id].bucket);
export const HOTBAR = [
  'dirt',
  'stone',
  'wood',
  'planks',
  'sand',
  'brick',
  'leaves',
  'glass',
  'lantern',
];
export const RECIPES = [
  {
    id: 'planks',
    count: 8,
    title: '从一棵树开始',
    desc: '轻巧温暖的建筑材料。',
    pattern: [null, 'wood', null, 'wood', null, null, null],
    cost: { wood: 2 },
  },
  {
    id: 'workbench',
    count: 1,
    title: '六向工坊',
    desc: '放置后靠近它，解锁进阶合成。',
    pattern: ['planks', 'planks', 'planks', null, 'planks', 'planks', 'planks'],
    cost: { planks: 6 },
  },
  {
    id: 'pick1',
    count: 1,
    title: '第一把工具',
    desc: '自动装备。开采岩石与煤矿。',
    pattern: ['planks', 'planks', 'planks', 'wood', null, 'wood', null],
    cost: { planks: 3, wood: 2 },
  },
  {
    id: 'pick2',
    count: 1,
    title: '深入岩层',
    desc: '自动装备。可以开采萤晶和铁矿。',
    pattern: ['stone', 'stone', 'stone', 'wood', 'stone', 'wood', 'stone'],
    cost: { stone: 5, wood: 2 },
    requires: 1,
    station: true,
  },
  {
    id: 'furnace',
    count: 1,
    title: '炉火初燃',
    desc: '放置后按 E，将煤和矿石变成铁锭。',
    pattern: ['stone', 'stone', 'stone', null, 'stone', 'stone', 'stone'],
    cost: { stone: 6 },
    station: true,
  },
  {
    id: 'chest',
    count: 1,
    title: '安一个家',
    desc: '放置后按 E，存取建筑材料。',
    pattern: [
      'planks',
      'planks',
      'planks',
      'wood',
      'planks',
      'planks',
      'planks',
    ],
    cost: { planks: 6, wood: 1 },
  },
  {
    id: 'hoe',
    count: 1,
    title: '播下第一粒种子',
    desc: '自动使用。对泥土或草地按 E 耕种。',
    pattern: ['stone', 'stone', null, 'wood', null, 'wood', null],
    cost: { stone: 2, wood: 2 },
  },
  {
    id: 'bed',
    count: 1,
    title: '今晚，住在这里',
    desc: '按 E 设置重生点，夜晚可睡到黎明。狩猎绵羊获得羊毛。',
    pattern: ['wool', 'wool', 'wool', null, 'planks', 'planks', 'planks'],
    cost: { wool: 3, planks: 3 },
  },
  {
    id: 'pick3',
    count: 1,
    title: '铁器时代',
    desc: '自动装备。开采速度进一步提升。',
    pattern: ['ingot', 'ingot', 'ingot', 'wood', null, 'wood', null],
    cost: { ingot: 3, wood: 2 },
    requires: 2,
    station: true,
  },
  {
    id: 'sword',
    count: 1,
    title: '守护漫长夜晚',
    desc: '自动装备。左键攻击生物，伤害提升。',
    pattern: [null, 'ingot', null, 'ingot', null, 'wood', null],
    cost: { ingot: 2, wood: 1 },
    station: true,
  },
  {
    id: 'bread',
    count: 2,
    title: '田野的馈赠',
    desc: '按 F 食用，恢复饱食度和生命。',
    pattern: ['wheat', 'wheat', 'wheat', null, null, null, null],
    cost: { wheat: 3 },
  },
  {
    id: 'brick',
    count: 6,
    title: '砌出你的城堡',
    desc: '经过打磨的六棱石砖。',
    pattern: ['stone', null, 'stone', 'stone', null, 'stone', null],
    cost: { stone: 4 },
  },
  {
    id: 'glass',
    count: 4,
    title: '留住一缕日光',
    desc: '蜂蜜色的装饰方块。',
    pattern: ['sand', 'sand', null, 'crystal', null, 'sand', 'sand'],
    cost: { sand: 4, crystal: 1 },
  },
  {
    id: 'lantern',
    count: 3,
    title: '把星光带回家',
    desc: '放置后会发出温暖的光。',
    pattern: [null, 'planks', null, 'crystal', null, 'planks', null],
    cost: { planks: 2, crystal: 1 },
  },
];
RECIPES.push(
  {
    id: 'obsidian',
    count: 4,
    title: '凝固的余烬',
    desc: '六向工坊将岩石、煤与萤晶烧结成黑曜石。',
    pattern: ['stone', 'coal', 'stone', 'crystal', 'stone', 'coal', null],
    cost: { stone: 3, coal: 2, crystal: 1 },
    station: true,
  },
  {
    id: 'portal',
    count: 1,
    title: '通往下界',
    desc: '放置后按 E 穿越。目的地自动生成返回门。',
    pattern: [
      'obsidian',
      'obsidian',
      'obsidian',
      'crystal',
      'obsidian',
      'obsidian',
      'obsidian',
    ],
    cost: { obsidian: 6, crystal: 1 },
    station: true,
  },
  {
    id: 'endportal',
    count: 1,
    title: '越过虚空',
    desc: '末影珍珠来自夜行者，烈焰粉来自下界生物。放置后按 E。',
    pattern: ['pearl', 'ember', 'pearl', 'crystal', 'ember', 'pearl', 'ember'],
    cost: { pearl: 3, ember: 3, crystal: 1 },
    station: true,
  },
  {
    id: 'pick4',
    count: 1,
    title: '钻石时代',
    desc: '自动装备。最快的开采工具。',
    pattern: ['diamond', 'diamond', 'diamond', 'wood', null, 'wood', null],
    cost: { diamond: 3, wood: 2 },
    requires: 3,
    station: true,
  },
);
RECIPES.push(
  {
    id: 'bucket',
    count: 1,
    title: '携带一片水源',
    desc: '右键或 E 对准液体源装桶，再对准地形倒出。流动液体不能装桶。',
    pattern: ['ingot', null, 'ingot', null, 'ingot', null, null],
    cost: { ingot: 3 },
    station: true,
  },
  {
    id: 'glowBucket',
    count: 1,
    title: '流淌的星光',
    desc: '水桶融入萤晶，得到发光的萤晶液。与岩浆接触会凝成萤石。',
    pattern: ['crystal', null, 'waterBucket', null, 'crystal', null, null],
    cost: { waterBucket: 1, crystal: 2 },
    station: true,
  },
);
export function axialToWorld(q, r) {
  return { x: SQRT3 * (q + r / 2), z: 1.5 * r };
}
export function worldToAxial(x, z) {
  const q = x / SQRT3 - z / 3,
    r = (2 * z) / 3,
    s = -q - r;
  let rq = Math.round(q),
    rr = Math.round(r),
    rs = Math.round(s);
  const dq = Math.abs(rq - q),
    dr = Math.abs(rr - r),
    ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
export const hexDistance = (q, r) =>
  Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
export const key = (q, y, r) => `${q},${y},${r}`;
export function hash(x, y, z = 0, seed = 1) {
  let n =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 2147483647) ^
    Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x, z, seed) {
  const a = Math.floor(x),
    b = Math.floor(z),
    u = x - a,
    v = z - b,
    f = u * u * (3 - 2 * u),
    g = v * v * (3 - 2 * v);
  return (
    (hash(a, b, 0, seed) * (1 - f) + hash(a + 1, b, 0, seed) * f) * (1 - g) +
    (hash(a, b + 1, 0, seed) * (1 - f) + hash(a + 1, b + 1, 0, seed) * f) * g
  );
}
export const WORLD_RADIUS = 32;
export const BEACON_SITES = [
  { q: 3, r: -12, name: '林间信标' },
  { q: -17, r: 8, name: '潮汐信标' },
  { q: 16, r: 5, name: '云脊信标' },
];
export class World {
  constructor(seed = 624) {
    this.seed = seed;
    this.blocks = new Map();
    this.edits = new Map();
    this.heights = new Map();
    this.generate();
  }
  get(q, y, r) {
    return this.blocks.get(key(q, y, r));
  }
  set(q, y, r, type, record = true) {
    const k = key(q, y, r);
    if (type) this.blocks.set(k, type);
    else this.blocks.delete(k);
    if (record) this.edits.set(k, type || null);
  }
  terrainHeight(q, r) {
    const d = hexDistance(q, r) / WORLD_RADIUS,
      n = noise(q * 0.095, r * 0.095, this.seed),
      detail = noise(q * 0.29, r * 0.29, this.seed + 19);
    return Math.max(
      1,
      Math.floor(4 + n * 10 + detail * 2 - Math.pow(d, 3) * 11),
    );
  }
  generate() {
    for (let q = -WORLD_RADIUS; q <= WORLD_RADIUS; q++)
      for (let r = -WORLD_RADIUS; r <= WORLD_RADIUS; r++) {
        if (hexDistance(q, r) > WORLD_RADIUS) continue;
        const h = this.terrainHeight(q, r);
        this.heights.set(`${q},${r}`, h);
        for (let y = 0; y < h; y++) {
          let type =
            y === 0
              ? 'bedrock'
              : y === h - 1
                ? h <= 4
                  ? 'sand'
                  : h >= 12
                    ? 'stone'
                    : 'grass'
                : y > h - 4
                  ? 'dirt'
                  : 'stone';
          const ore = hash(q, y, r, this.seed);
          if (type === 'stone' && y > 1) {
            if (ore > 0.965) type = 'crystal';
            else if (ore > 0.92) type = 'iron';
            else if (ore > 0.85) type = 'coal';
          }
          if (
            y > 2 &&
            y < h - 2 &&
            noise(q * 0.23 + y * 0.3, r * 0.23, this.seed + 41) > 0.79
          )
            continue;
          this.set(q, y, r, type, false);
        }
      }
    for (const [k, h] of this.heights) {
      const [q, r] = k.split(',').map(Number);
      if (
        h < 6 ||
        h > 11 ||
        hexDistance(q, r) < 4 ||
        hash(q, 17, r, this.seed) < 0.962 ||
        BEACON_SITES.some((b) => hexDistance(q - b.q, r - b.r) < 4)
      )
        continue;
      const trunk = 3 + Math.floor(hash(q, 2, r, this.seed) * 2);
      for (let y = h; y < h + trunk; y++) this.set(q, y, r, 'wood', false);
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++)
          for (let dy = -1; dy <= 1; dy++) {
            if (
              hexDistance(dq, dr) > (dy === 1 ? 1 : 2) ||
              (!dq && !dr && dy < 0)
            )
              continue;
            this.set(q + dq, h + trunk + dy, r + dr, 'leaves', false);
          }
    }
    this.beacons = BEACON_SITES.map((b, index) => {
      const h = Math.max(5, this.terrainHeight(b.q, b.r));
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++)
          if (hexDistance(dq, dr) <= 2) {
            for (let y = 0; y < h; y++)
              this.set(
                b.q + dq,
                y,
                b.r + dr,
                y === h - 1 ? 'brick' : 'stone',
                false,
              );
            for (let y = h; y < 22; y++)
              this.set(b.q + dq, y, b.r + dr, null, false);
          }
      for (const [dq, dr] of DIRECTIONS)
        if ((dq + dr + index) % 2 === 0)
          for (let y = h; y < h + 2; y++)
            this.set(b.q + dq * 2, y, b.r + dr * 2, 'brick', false);
      return { ...b, y: h, index };
    });
    const h = this.terrainHeight(3, 0);
    for (let y = h; y < h + 4; y++) this.set(3, y, 0, 'wood', false);
    for (const [dq, dr] of [[0, 0], ...DIRECTIONS])
      this.set(3 + dq, h + 4, dr, 'leaves', false);
    for (const b of this.beacons)
      for (let i = 0; i < 4; i++)
        this.set(b.q - 3, b.y - 1 - i, b.r, 'crystal', false);
  }
  surface(q, r) {
    for (let y = 35; y >= 0; y--) if (this.get(q, y, r)) return y + 1;
    return 0;
  }
  applyEdits(edits) {
    for (const [k, type] of edits) {
      const [q, y, r] = k.split(',').map(Number);
      this.set(q, y, r, type);
    }
  }
}
export function canCraft(recipe, inventory, tool = 0, station = true) {
  return (
    tool >= (recipe.requires || 0) &&
    (!recipe.station || station) &&
    Object.entries(recipe.cost).every(([id, n]) => (inventory[id] || 0) >= n) &&
    !(recipe.id.startsWith('pick') && tool >= Number(recipe.id.slice(-1)))
  );
}
export function craft(recipe, inventory, tool = 0, station = true) {
  if (!canCraft(recipe, inventory, tool, station)) return false;
  for (const [id, n] of Object.entries(recipe.cost)) inventory[id] -= n;
  inventory[recipe.id] = (inventory[recipe.id] || 0) + recipe.count;
  return true;
}
export const SAVE_KEY = 'hexwild-save-v1';
export function validateSave(s) {
  if (
    !s ||
    s.version !== 1 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 999999 ||
    !Array.isArray(s.edits) ||
    s.edits.length > 200000
  )
    throw new Error('存档格式不兼容');
  if (
    !s.inventory ||
    typeof s.inventory !== 'object' ||
    Array.isArray(s.inventory) ||
    !Object.entries(s.inventory).every(
      ([k, n]) =>
        Object.hasOwn(ITEMS, k) &&
        Number.isInteger(n) &&
        n >= 0 &&
        n <= 1000000,
    )
  )
    throw new Error('背包数据无效');
  for (const e of s.edits)
    if (
      !Array.isArray(e) ||
      e.length !== 2 ||
      typeof e[0] !== 'string' ||
      !/^[-\d]+,\d+,[-\d]+$/.test(e[0]) ||
      (e[1] !== null && !Object.hasOwn(BLOCKS, e[1]))
    )
      throw new Error('地形数据无效');
  for (const [k] of s.edits) {
    const [q, y, r] = k.split(',').map(Number);
    if (
      ![q, y, r].every(Number.isInteger) ||
      hexDistance(q, r) > WORLD_RADIUS + 3 ||
      y < 1 ||
      y > 32
    )
      throw new Error('方块超出世界范围');
  }
  if (
    !Array.isArray(s.position) ||
    s.position.length !== 3 ||
    !s.position.every(Number.isFinite) ||
    Math.abs(s.position[0]) > 120 ||
    Math.abs(s.position[2]) > 100 ||
    s.position[1] < -10 ||
    s.position[1] > 60
  )
    throw new Error('位置数据无效');
  if (
    !Array.isArray(s.activated) ||
    !s.activated.every((n) => Number.isInteger(n) && n >= 0 && n < 3) ||
    new Set(s.activated).size !== s.activated.length
  )
    throw new Error('信标数据无效');
  if (![0, 1, 2, 3].includes(s.tool) || typeof s.creative !== 'boolean')
    throw new Error('模式数据无效');
  if (
    s.health !== undefined &&
    (!Number.isFinite(s.health) || s.health < 0 || s.health > 20)
  )
    throw new Error('生命数据无效');
  if (
    s.hunger !== undefined &&
    (!Number.isFinite(s.hunger) || s.hunger < 0 || s.hunger > 20)
  )
    throw new Error('饱食度无效');
  if (s.time !== undefined && (!Number.isFinite(s.time) || s.time < 0))
    throw new Error('时间数据无效');
  if (
    s.hotbar !== undefined &&
    (!Array.isArray(s.hotbar) ||
      s.hotbar.length !== 9 ||
      !s.hotbar.every((id) => Object.hasOwn(BLOCKS, id) && id !== 'bedrock'))
  )
    throw new Error('快捷栏无效');
  if (
    s.respawn !== undefined &&
    s.respawn !== null &&
    (!Array.isArray(s.respawn) ||
      s.respawn.length !== 3 ||
      !s.respawn.every(Number.isFinite) ||
      Math.abs(s.respawn[0]) > 100 ||
      Math.abs(s.respawn[2]) > 100 ||
      s.respawn[1] < 1 ||
      s.respawn[1] > 35)
  )
    throw new Error('重生点无效');
  for (const field of ['crops', 'chests'])
    if (
      s[field] !== undefined &&
      (!Array.isArray(s[field]) || s[field].length > 10000)
    )
      throw new Error('附加数据无效');
  if (s.crops)
    for (const [k, t] of s.crops)
      if (
        typeof k !== 'string' ||
        !/^[-\d]+,\d+,[-\d]+$/.test(k) ||
        !Number.isFinite(t) ||
        t < 0
      )
        throw new Error('农田数据无效');
  if (s.chests)
    for (const [k, inv] of s.chests)
      if (
        typeof k !== 'string' ||
        !inv ||
        !Object.entries(inv).every(
          ([id, n]) =>
            Object.hasOwn(ITEMS, id) &&
            Number.isInteger(n) &&
            n >= 0 &&
            n <= 1000000,
        )
      )
        throw new Error('储物数据无效');
  return s;
}
