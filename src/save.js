import { LIQUIDS } from './fluids.js';
import {
  ITEMS,
  BLOCKS,
  HOTBAR,
  canEquip,
  validateSave as validateLegacy,
} from './core.js';
import { DIMENSIONS, WORLD_HEIGHT } from './world.js';
export const SAVE_KEY = 'hexwild-save-v2';
const cell = (k) => {
  if (typeof k !== 'string' || !/^-?\d+,\d+,-?\d+$/.test(k)) return false;
  const [q, y, r] = k.split(',').map(Number);
  return (
    [q, y, r].every(Number.isSafeInteger) &&
    Math.abs(q) < 1e9 &&
    Math.abs(r) < 1e9 &&
    y >= 0 &&
    y < WORLD_HEIGHT
  );
};
const position = (p) =>
  Array.isArray(p) &&
  p.length === 3 &&
  p.every(Number.isFinite) &&
  Math.abs(p[0]) < 2e9 &&
  Math.abs(p[2]) < 2e9 &&
  p[1] >= -100 &&
  p[1] < 150;
const inventory = (inv) =>
  inv &&
  typeof inv === 'object' &&
  !Array.isArray(inv) &&
  Object.entries(inv).every(
    ([k, n]) =>
      Object.hasOwn(ITEMS, k) && Number.isInteger(n) && n >= 0 && n <= 1e6,
  );
export function migrateSave(s) {
  if (s?.version !== 1) return s;
  validateLegacy(s);
  return {
    ...s,
    version: 2,
    health: s.health ?? 20,
    hunger: s.hunger ?? 20,
    time: s.time ?? 105,
    hotbar: s.hotbar ?? [...HOTBAR],
    dimension: 'overworld',
    dimensions: {
      overworld: {
        edits: s.edits,
        legacy: true,
        crops: s.crops || [],
        chests: s.chests || [],
        respawn: s.respawn || null,
        position: s.position,
      },
    },
    settings: {},
  };
}
export function validateSave(input) {
  const s = migrateSave(input);
  if (
    !s ||
    s.version !== 2 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 999999 ||
    !Object.hasOwn(DIMENSIONS, s.dimension) ||
    !inventory(s.inventory) ||
    !position(s.position) ||
    ![0, 1, 2, 3, 4].includes(s.tool) ||
    typeof s.creative !== 'boolean'
  )
    throw Error('存档格式或玩家数据无效');
  if (!s.dimensions || !Object.hasOwn(s.dimensions, s.dimension))
    throw Error('维度数据缺失');
  for (const [id, d] of Object.entries(s.dimensions)) {
    if (
      !Object.hasOwn(DIMENSIONS, id) ||
      !d ||
      !Array.isArray(d.edits) ||
      d.edits.length > 2e6 ||
      d.edits.some(
        (e) =>
          !Array.isArray(e) ||
          e.length !== 2 ||
          !cell(e[0]) ||
          (e[1] !== null && !Object.hasOwn(BLOCKS, e[1])),
      )
    )
      throw Error('地形数据无效');
    if (
      d.fluids !== undefined &&
      (!Array.isArray(d.fluids) ||
        d.fluids.length > 2e6 ||
        d.fluids.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            !cell(e[0]) ||
            (e[1] !== null &&
              (!e[1] ||
                !Object.hasOwn(LIQUIDS, e[1].type) ||
                typeof e[1].source !== 'boolean' ||
                typeof e[1].falling !== 'boolean' ||
                !Number.isInteger(e[1].level) ||
                e[1].level < 0 ||
                e[1].level > LIQUIDS[e[1].type].range ||
                (e[1].source && (e[1].level !== 0 || e[1].falling)))),
        ))
    )
      throw Error('液体数据无效');
    if (
      (d.position && !position(d.position)) ||
      (d.respawn && !position(d.respawn))
    )
      throw Error('维度位置无效');
    if (d.legacy !== undefined && typeof d.legacy !== 'boolean')
      throw Error('旧世界数据无效');
    if (
      !Array.isArray(d.crops) ||
      d.crops.length > 1e5 ||
      d.crops.some(
        (e) =>
          !Array.isArray(e) ||
          !cell(e[0]) ||
          !Number.isFinite(e[1]) ||
          e[1] < 0,
      )
    )
      throw Error('农田数据无效');
    if (
      !Array.isArray(d.chests) ||
      d.chests.length > 1e5 ||
      d.chests.some((e) => !Array.isArray(e) || !cell(e[0]) || !inventory(e[1]))
    )
      throw Error('储物数据无效');
  }
  for (const field of ['health', 'hunger'])
    if (!Number.isFinite(s[field]) || s[field] < 0 || s[field] > 20)
      throw Error('生存状态无效');
  if (
    !Number.isFinite(s.time) ||
    s.time < 0 ||
    !Array.isArray(s.hotbar) ||
    s.hotbar.length !== 9 ||
    !s.hotbar.every((id) => canEquip(id) && id !== 'bedrock')
  )
    throw Error('时间或快捷栏无效');
  return s;
}
