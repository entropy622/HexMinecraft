import { validFurnace } from './furnaces.js';
import { validBrewing } from './brewing.js';
import { validFalling } from './gravity.js';
import { isCampfire, validCampfire } from './campfire-data.js';
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
import { BLOCKS, DIRECTIONS } from './core.js';
import { isPiston, isPistonHead, pistonPartner } from './redstone-data.js';
import { DIMENSIONS, WORLD_HEIGHT } from './world.js';
export const SAVE_KEY = 'hexwild-save-v16';
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
    s.version !== 16 ||
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
    typeof s.creative !== 'boolean' ||
    typeof s.creativeFlying !== 'boolean' ||
    (s.creativeFlying && !s.creative)
  )
    throw Error('存档格式或玩家数据无效');
  if (!s.dimensions || !Object.hasOwn(s.dimensions, s.dimension))
    throw Error('维度数据缺失');
  if (!validSurvival(s.survival)) throw Error('生存状态数据无效');
  if (!validFlight(s.flight)) throw Error('飞行状态数据无效');
  if (s.weather !== undefined && !validWeather(s.weather))
    throw Error('天气数据无效');
  for (const [id, d] of Object.entries(s.dimensions)) {
    if (typeof d?.crouching !== 'boolean' || (d.crouching && d.crawling))
      throw Error('维度蹲伏姿态无效');
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
            e[1].facing > 7 ||
            typeof e[1].open !== 'boolean' ||
            (e[1].upper !== undefined && typeof e[1].upper !== 'boolean') ||
            (e[1].double !== undefined && typeof e[1].double !== 'boolean') ||
            (e[1].powered !== undefined && typeof e[1].powered !== 'boolean') ||
            (e[1].down !== undefined && typeof e[1].down !== 'boolean') ||
            (e[1].subtract !== undefined &&
              typeof e[1].subtract !== 'boolean') ||
            (e[1].output !== undefined &&
              (!Number.isInteger(e[1].output) ||
                e[1].output < 0 ||
                e[1].output > 15)) ||
            (e[1].delay !== undefined &&
              (!Number.isInteger(e[1].delay) ||
                e[1].delay < 1 ||
                e[1].delay > 4)) ||
            (e[1].mount !== undefined &&
              !['floor', 'wall', 'ceiling'].includes(e[1].mount)) ||
            (e[1].axis !== undefined &&
              (!Number.isInteger(e[1].axis) || e[1].axis < 0 || e[1].axis > 3)),
        ))
    )
      throw Error('建筑朝向或开关状态无效');
    {
      const edits = new Map(d.edits),
        states = new Map(d.blockStates || []);
      if (
        [...states].some(
          ([k, state]) =>
            (state.facing > 5 &&
              !['dropper', 'piston', 'pistonHead', 'observer'].includes(
                BLOCKS[edits.get(k)]?.shape,
              )) ||
            (state.delay !== undefined && edits.get(k) !== 'repeater') ||
            (state.down !== undefined && edits.get(k) !== 'hopper') ||
            ((state.output !== undefined || state.subtract !== undefined) &&
              edits.get(k) !== 'comparator') ||
            (edits.get(k) === 'comparator' && state.powered !== undefined) ||
            (edits.get(k) === 'redstoneTorch' && state.mount === 'ceiling') ||
            (['repeater', 'comparator'].includes(edits.get(k)) &&
              state.mount !== undefined &&
              state.mount !== 'floor'),
        )
      )
        throw Error('比较器或中继器状态无效');
      const view = {
        get: (...p) => edits.get(p.join(',')),
        state: (...p) => states.get(p.join(',')) || {},
      };
      for (const [k, type] of edits) {
        if (!isPistonHead(type) && !(isPiston(type) && states.get(k)?.open))
          continue;
        if (
          (isPistonHead(type) && states.get(k)?.open !== false) ||
          !pistonPartner(view, ...k.split(',').map(Number), DIRECTIONS)
        )
          throw Error('活塞头与底座不匹配');
      }
      if (
        d.hopperCooldowns !== undefined &&
        (!Array.isArray(d.hopperCooldowns) ||
          d.hopperCooldowns.length > 200000 ||
          d.hopperCooldowns.some(
            (e) =>
              !Array.isArray(e) ||
              e.length !== 2 ||
              !cell(e[0]) ||
              edits.get(e[0]) !== 'hopper' ||
              !Number.isFinite(e[1]) ||
              e[1] <= 0 ||
              e[1] > 0.4,
          ) ||
          new Set(d.hopperCooldowns.map((e) => e[0])).size !==
            d.hopperCooldowns.length)
      )
        throw Error('漏斗冷却记录无效');
      if (
        !Array.isArray(d.redstoneTimers) ||
        d.redstoneTimers.length > 200000 ||
        d.redstoneTimers.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            !cell(e[0]) ||
            !Number.isFinite(e[1]) ||
            e[1] <= 0 ||
            e[1] >
              ({
                stonePressurePlate: 0.5,
                stoneButton: 1,
                redstoneTorch: 0.1,
                repeater: 0.4,
                comparator: 0.1,
                observer: 0.1,
                dropper: 0.2,
                dispenser: 0.2,
                piston: 0.1,
                stickyPiston: 0.1,
              }[edits.get(e[0])] || 0) ||
            (['stoneButton', 'stonePressurePlate'].includes(edits.get(e[0])) &&
              states.get(e[0])?.powered !== true),
        ) ||
        new Set(d.redstoneTimers.map(([k]) => k)).size !==
          d.redstoneTimers.length
      )
        throw Error('红石延时记录无效');
      if (
        !Array.isArray(d.torchBurnouts) ||
        d.torchBurnouts.length > 200000 ||
        new Set(d.torchBurnouts.map((e) => (Array.isArray(e) ? e[0] : null)))
          .size !== d.torchBurnouts.length ||
        d.torchBurnouts.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            !cell(e[0]) ||
            edits.get(e[0]) !== 'redstoneTorch' ||
            !e[1] ||
            !Number.isFinite(e[1].cooldown) ||
            e[1].cooldown < 0 ||
            e[1].cooldown > 8 ||
            !Array.isArray(e[1].recent) ||
            e[1].recent.length > 8 ||
            (!e[1].recent.length && !e[1].cooldown) ||
            e[1].recent.some((t) => !Number.isFinite(t) || t <= 0 || t > 3) ||
            (e[1].cooldown > 0 && states.get(e[0])?.powered !== false),
        )
      )
        throw Error('红石火把冷却记录无效');
      const timed = new Set(d.redstoneTimers.map(([k]) => k));
      if (
        [...states].some(
          ([k, state]) =>
            state.powered &&
            ['stoneButton', 'stonePressurePlate', 'observer'].includes(
              edits.get(k),
            ) &&
            !timed.has(k),
        )
      )
        throw Error('红石按钮或压力板计时无效');
    }
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
    if (d.furnaces) {
      const edits = new Map(d.edits);
      if (
        new Set(d.furnaces.map(([k]) => k)).size !== d.furnaces.length ||
        d.furnaces.some(([k, f]) => edits.has(k) && edits.get(k) !== f.kind)
      )
        throw Error('炉具位置或类型无效');
    }
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
    if (d.campfires !== undefined) {
      const edits = new Map(d.edits);
      if (
        !Array.isArray(d.campfires) ||
        d.campfires.length > 200000 ||
        d.campfires.some(
          (e) =>
            !Array.isArray(e) ||
            e.length !== 2 ||
            !cell(e[0]) ||
            !validCampfire(e[1]) ||
            (edits.has(e[0]) && !isCampfire(edits.get(e[0]))),
        ) ||
        new Set(d.campfires.map((e) => e[0])).size !== d.campfires.length
      )
        throw Error('营火或烹饪进度无效');
    }
    if (d.falling !== undefined && !validFalling(d.falling))
      throw Error('坠落方块数据无效');
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
      !Array.isArray(d.persistentLeaves) ||
      d.persistentLeaves.length > 2e6 ||
      d.persistentLeaves.some(
        (k) => !cell(k) || !BLOCKS[editedTypes.get(k)]?.foliage,
      ) ||
      new Set(d.persistentLeaves).size !== d.persistentLeaves.length
    )
      throw Error('建筑树叶数据无效');
    if (
      !Array.isArray(d.leafDecay) ||
      d.leafDecay.length > 2e6 ||
      d.leafDecay.some(
        (entry) =>
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          !cell(entry[0]) ||
          !Number.isFinite(entry[1]) ||
          entry[1] <= 0 ||
          entry[1] > 20,
      ) ||
      new Set(d.leafDecay.map((entry) => entry[0])).size !== d.leafDecay.length
    )
      throw Error('树叶消散数据无效');
    if (
      d.chorus !== undefined &&
      (!Array.isArray(d.chorus) ||
        d.chorus.length > 4096 ||
        d.chorus.some(
          (entry) =>
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            !cell(entry[0]) ||
            editedTypes.get(entry[0]) !== 'chorusFlower' ||
            !entry[1] ||
            !Number.isInteger(entry[1].stage) ||
            entry[1].stage < 0 ||
            entry[1].stage > 4 ||
            !Number.isFinite(entry[1].time) ||
            entry[1].time < 0 ||
            entry[1].time >= 20,
        ) ||
        new Set(d.chorus.map((entry) => entry[0])).size !== d.chorus.length)
    )
      throw Error('紫颂花生长数据无效');
    if (
      !Array.isArray(d.chests) ||
      d.chests.length > 1e5 ||
      d.chests.some(
        (e) =>
          !Array.isArray(e) ||
          e.length !== 2 ||
          !cell(e[0]) ||
          !validChest(e[1], editedTypes.get(e[0]) || 'chest'),
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
