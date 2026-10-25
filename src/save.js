import { validFurnace } from './furnaces.js';
import { validBrewing } from './brewing.js';
import { validChest } from './chests.js';
import { validSurvival } from './survival.js';
import { validExperience, validOrbs } from './experience.js';
import { validBoats } from './boats.js';
import { validFauna } from './fauna.js';
import { validDrops } from './item-drops.js';
import { validWeather } from './weather.js';
import { validPlant } from './farming-data.js';
import { validPlayerInventory } from './inventory.js';
import { validCraftingGrid } from './crafting.js';
import { validWorkstationItems } from './workstation-items.js';
import { validDragonFight } from './end-data.js';
import { validFlight } from './glider.js';
import { LIQUIDS } from './fluids.js';
import { BLOCKS } from './core.js';
import { DIMENSIONS, WORLD_HEIGHT } from './world.js';
export const SAVE_KEY = 'hexwild-save-v10';
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
  p[1] < 512;
export function validateSave(s) {
  if (
    !s ||
    s.version !== 10 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 999999 ||
    !Object.hasOwn(DIMENSIONS, s.dimension) ||
    !validPlayerInventory(s.inventory) ||
    !validCraftingGrid(s.crafting) ||
    !validWorkstationItems(s.workstations) ||
    !Number.isInteger(s.selected) ||
    s.selected < 0 ||
    s.selected > 8 ||
    !validExperience(s.experience) ||
    !position(s.position) ||
    typeof s.creative !== 'boolean'
  )
    throw Error('存档格式或玩家数据无效');
  if (!s.dimensions || !Object.hasOwn(s.dimensions, s.dimension))
    throw Error('维度数据缺失');
  if (!validSurvival(s.survival)) throw Error('生存状态数据无效');
  if (!validFlight(s.flight)) throw Error('飞行状态数据无效');
  if (s.weather !== undefined && !validWeather(s.weather))
    throw Error('天气数据无效');
  for (const [id, d] of Object.entries(s.dimensions)) {
    if (d?.crawling !== undefined && typeof d.crawling !== 'boolean')
      throw Error('维度姿态无效');
    if (
      d?.dragon !== undefined &&
      (id !== 'end' || !validDragonFight(d.dragon))
    )
      throw Error('末影龙进度无效');
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
      d.blockStates !== undefined &&
      (!Array.isArray(d.blockStates) ||
        d.blockStates.length > 2e6 ||
        d.blockStates.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            !cell(e[0]) ||
            !e[1] ||
            !Number.isInteger(e[1].facing) ||
            e[1].facing < 0 ||
            e[1].facing > 5 ||
            typeof e[1].open !== 'boolean' ||
            (e[1].upper !== undefined && typeof e[1].upper !== 'boolean') ||
            (e[1].double !== undefined && typeof e[1].double !== 'boolean'),
        ))
    )
      throw Error('建筑朝向或开关状态无效');
    if (
      d.furnaces !== undefined &&
      (!Array.isArray(d.furnaces) ||
        d.furnaces.length > 200000 ||
        d.furnaces.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            !cell(e[0]) ||
            !validFurnace(e[1]),
        ))
    )
      throw Error('熔炉数据无效');
    if (
      !Array.isArray(d.brewing) ||
      d.brewing.length > 200000 ||
      d.brewing.some(
        (e) =>
          !Array.isArray(e) ||
          e.length !== 2 ||
          !cell(e[0]) ||
          !validBrewing(e[1]),
      )
    )
      throw Error('酿造台数据无效');
    for (const field of ['structureFeatures', 'discoveredStructures']) {
      if (
        d[field] !== undefined &&
        (!Array.isArray(d[field]) ||
          d[field].length > 200000 ||
          d[field].some((v) => typeof v !== 'string' || v.length > 120))
      )
        throw Error('遗迹数据无效');
    }
    if (d.fauna !== undefined && !validFauna(d.fauna))
      throw Error('动物存档无效');
    if (d.boats !== undefined && !validBoats(d.boats, d.mountedBoat ?? null))
      throw Error('船只存档无效');
    if (!validOrbs(d.experienceOrbs)) throw Error('经验光球数据无效');
    if (
      !validDrops(d.drops) ||
      (d.lastDeath !== null && !position(d.lastDeath))
    )
      throw Error('掉落物数据无效');
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
    for (const field of ['villageExclusions', 'villageFeatures'])
      if (
        d[field] !== undefined &&
        (!Array.isArray(d[field]) ||
          d[field].length > 200000 ||
          d[field].some((x) => typeof x !== 'string' || x.length > 100))
      )
        throw Error('村庄数据无效');
    if (
      d.villageTrades !== undefined &&
      (!Array.isArray(d.villageTrades) ||
        d.villageTrades.length > 200000 ||
        d.villageTrades.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            typeof e[0] !== 'string' ||
            e[0].length > 100 ||
            !e[1] ||
            !Number.isInteger(e[1].day) ||
            e[1].day < 0 ||
            !Number.isInteger(e[1].used) ||
            e[1].used < 0 ||
            e[1].used > 4,
        ))
    )
      throw Error('交易记录无效');
    if (
      !Array.isArray(d.crops) ||
      d.crops.length > 1e5 ||
      d.crops.some((e) => !Array.isArray(e) || !cell(e[0]) || !validPlant(e[1]))
    )
      throw Error('农田数据无效');
    const editedTypes = new Map(d.edits);
    if (
      !Array.isArray(d.chests) ||
      d.chests.length > 1e5 ||
      d.chests.some(
        (e) =>
          !Array.isArray(e) ||
          e.length !== 2 ||
          !cell(e[0]) ||
          !validChest(e[1], !!BLOCKS[editedTypes.get(e[0])]?.portable),
      ) ||
      new Set(d.chests.map((e) => e[0])).size !== d.chests.length
    )
      throw Error('储物数据无效');
  }
  for (const field of ['health', 'hunger'])
    if (!Number.isFinite(s[field]) || s[field] < 0 || s[field] > 20)
      throw Error('生存状态无效');
  if (!Number.isFinite(s.time) || s.time < 0) throw Error('时间数据无效');
  return s;
}
