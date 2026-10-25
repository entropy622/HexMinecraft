import { structuresNear, stampStructure } from './structures.js';
import { villagesNear, villageAt, stampVillage, features } from './villages.js';
import { Fluids } from './fluids.js';
import { END_FLOOR } from './end-data.js';
import { stampEndArena } from './end-arena.js';
import { FIRST_END_SHIP } from './flight-data.js';
import { FIRST_END_CITY } from './end-city-data.js';
import { stampChorus } from './chorus.js';
import { isChorus } from './chorus-data.js';
import { treeCells } from './tree-layout.js';
import { LeafDecay } from './leaves.js';
import { Gravity } from './gravity.js';
import { isCampfire, newCampfire } from './campfire-data.js';
import { isDoorTop, isFence, isGate, isOpenable } from './building-data.js';
import {
  BLOCKS,
  DIRECTIONS,
  noise,
  hash,
  hexDistance,
  key,
  worldToAxial,
  axialToWorld,
} from './core.js';
import { buildingParts, insidePart } from './building-shapes.js';
import { partSpan } from './shape-columns.js';

export const CHUNK_SIZE = 8;
export const WORLD_HEIGHT = 64;
export const VIEW_RADIUS = 3;
export const DIMENSIONS = {
  overworld: {
    name: '主世界',
    subtitle: '风、森林与远方',
    color: '#8dcc98',
    fog: '#b5d9cf',
    liquid: 5.15,
    liquidColor: '#59a9ae',
    gravity: 24,
  },
  nether: {
    name: '下界',
    subtitle: '余烬之海',
    color: '#f39c75',
    fog: '#602c35',
    liquid: 5.15,
    liquidColor: '#fa6027',
    gravity: 24,
  },
  end: {
    name: '末地',
    subtitle: '虚空中的群岛',
    color: '#c4abe7',
    fog: '#221d3c',
    liquid: null,
    liquidColor: '#221d3c',
    gravity: 18,
  },
};
export const chunkKey = (q, r) =>
  `${Math.floor(q / CHUNK_SIZE)},${Math.floor(r / CHUNK_SIZE)}`;
export class World {
  constructor(seed = 624, dimension = 'overworld', options = {}) {
    this.seed = seed;
    this.dimension = dimension;
    this.blocks = new Map();
    this.lightRevision = 0;
    this.leafRevision = 0;
    this.treeLeaves = new Set();
    this.treeLogs = new Set();
    this.persistentLeaves = new Set();
    this.heights = new Map();
    this.chunks = new Map();
    this.edits = new Map();
    this.editChunks = new Map();
    this.center = null;
    this.spawners = new Set();
    this.buildings = new Set();
    this.portalCells = new Set();
    this.blockStates = new Map();
    this.naturalStates = new Map();
    this.shapeCache = new Map();
    this.chorus = new Map(options.chorus || []);
    this.chorusPending = new Set();
    this.structureFeatures = new Set(options.structureFeatures || []);
    this.discoveredStructures = new Set(options.discoveredStructures || []);
    this.villageExclusions = new Set(options.villageExclusions || []);
    this.villageFeatures = new Set(options.villageFeatures || []);
    this.villageTrades = new Map(options.villageTrades || []);
    this.maxY = WORLD_HEIGHT;
    this.beacons = [];
    this.fluids = new Fluids(this, options.fluids);
    this.campfires = new Map(options.campfires || []);
    this.gravity = new Gravity(this, options.falling);
    if (options.edits) this.applyEdits(options.edits);
    this.persistentLeaves = new Set(options.persistentLeaves || []);
    this.leafDecay = new LeafDecay(this, options.leafDecay);
    this.blockStates = new Map(options.blockStates || []);
    this.furnaces = new Map(options.furnaces || []);
    this.brewing = new Map(options.brewing || []);
    if (options.load !== false) this.ensureAround(0, 0);
  }
  biome(q, r) {
    if (this.dimension === 'nether')
      return noise(q * 0.026, r * 0.026, this.seed + 70) > 0.58
        ? '玄武岩荒地'
        : '绯红菌林';
    if (this.dimension === 'end')
      return this.terrainHeight(q, r) ? '末地浮岛' : '虚空';
    if (hexDistance(q, r) < 8) return '青翠平原';
    const heat = noise(q * 0.017, r * 0.017, this.seed + 140),
      wet = noise(q * 0.019, r * 0.019, this.seed + 76);
    if (heat > 0.67) return '沙漠';
    if (heat < 0.3) return '雪原';
    return wet > 0.53
      ? noise(q * 0.023, r * 0.023, this.seed + 319) > 0.5
        ? '白桦林'
        : '森林'
      : '青翠平原';
  }
  villages(q, r, range = 32) {
    return villagesNear(this, q, r, range);
  }
  structures(q, r, range = 32) {
    return structuresNear(this, q, r, range);
  }
  villageSources(cq, cr) {
    return this.villages(cq * 8 + 4, cr * 8 + 4, 8)
      .flatMap((v) => features(v).water)
      .filter((p) => Math.floor(p.q / 8) === cq && Math.floor(p.r / 8) === cr);
  }
  terrainHeight(q, r) {
    const h = this.naturalHeight(q, r);
    const v = villageAt(this, q, r, 7);
    if (!v) return h;
    const d = hexDistance(q - v.q, r - v.r);
    return d <= 12
      ? v.h
      : Math.round(v.h + (h - v.h) * Math.min(1, (d - 12) / 7));
  }
  naturalHeight(q, r) {
    const n = noise(q * 0.055, r * 0.055, this.seed),
      detail = noise(q * 0.18, r * 0.18, this.seed + 19);
    if (this.dimension === 'nether') return Math.floor(4 + n * 15 + detail * 3);
    if (this.dimension === 'end') {
      const outer = hexDistance(q - FIRST_END_SHIP.q, r - FIRST_END_SHIP.r);
      const city = hexDistance(q - FIRST_END_CITY.q, r - FIRST_END_CITY.r);
      const shipHeight =
        outer <= 10
          ? FIRST_END_SHIP.h
          : outer <= 14
            ? FIRST_END_SHIP.h - (outer - 10) * 2
            : 0;
      const cityHeight =
        city <= 16
          ? FIRST_END_CITY.h
          : city <= 20
            ? FIRST_END_CITY.h - (city - 16) * 2
            : 0;
      if (shipHeight || cityHeight) return Math.max(shipHeight, cityHeight);
      const distance = hexDistance(q, r);
      if (distance <= 16) return END_FLOOR;
      if (distance <= 21) return END_FLOOR - (distance - 16);
      const island = noise(q * 0.032, r * 0.032, this.seed + 941);
      if (hexDistance(q, r) > 12 && island < 0.43) return 0;
      return Math.floor(17 + n * 9 + detail * 3);
    }
    if (hexDistance(q, r) < 5) return 11;
    return Math.max(2, Math.floor(3 + n * 18 + detail * 3));
  }
  tree(q, r) {
    if (villageAt(this, q, r, 3)) return false;
    if (this.structures(q, r, 0).some((s) => hexDistance(q - s.q, r - s.r) < 8))
      return false;
    if (this.dimension === 'end' || hexDistance(q, r) < 5)
      return q === 3 && r === 0 && this.dimension === 'overworld';
    const b = this.biome(q, r),
      h = this.terrainHeight(q, r);
    return (
      h > 6 &&
      !['沙漠', '玄武岩荒地'].includes(b) &&
      hash(q, 17, r, this.seed) >
        (['森林', '白桦林'].includes(b) ? 0.948 : b === '雪原' ? 0.97 : 0.981)
    );
  }
  treeKind(q, r) {
    if (this.dimension === 'nether') return 'crimson';
    const biome = this.biome(q, r);
    return biome === '雪原' ? 'spruce' : biome === '白桦林' ? 'birch' : 'oak';
  }
  get(q, y, r) {
    return this.blocks.get(key(q, y, r));
  }
  loaded(q, r) {
    return this.chunks.has(chunkKey(q, r));
  }
  solid(q, y, r) {
    const t = this.get(q, y, r);
    if (isOpenable(t)) return !this.state(q, y, r).open;
    const below = this.get(q, y - 1, r);
    if (isFence(below) || (isGate(below) && !this.state(q, y - 1, r).open))
      return true;
    return !!t && !BLOCKS[t]?.nonSolid;
  }
  state(q, y, r) {
    if (isDoorTop(this.get(q, y, r))) y--;
    const k = key(q, y, r);
    return (
      this.blockStates.get(k) ||
      this.naturalStates.get(k) || { facing: 0, open: false }
    );
  }
  setState(q, y, r, state) {
    this.lightRevision++;
    if (isDoorTop(this.get(q, y, r))) y--;
    this.blockStates.set(key(q, y, r), {
      facing: state.facing,
      open: state.open,
      upper: state.upper === true,
      double: state.double === true,
      axis: state.axis ?? 0,
    });
    this.shapeCache.clear();
  }
  pointSolid(x, y, z) {
    const cell = worldToAxial(x, z),
      h = Math.floor(y),
      type = this.get(cell.q, h, cell.r);
    if (type && !BLOCKS[type].shape && !BLOCKS[type].nonSolid) return true;
    // Open leaves and connecting rails can extend across a hex boundary.
    for (const [dq, dr] of [[0, 0], ...DIRECTIONS])
      for (const b of [h, h - 1]) {
        const q = cell.q + dq,
          r = cell.r + dr,
          t = this.get(q, b, r);
        if (!BLOCKS[t]?.shape || t === 'ladder') continue;
        const k = key(q, b, r),
          p = axialToWorld(q, r);
        if (!this.shapeCache.has(k))
          this.shapeCache.set(k, buildingParts(this, q, b, r, true));
        if (
          this.shapeCache
            .get(k)
            .some((part) => insidePart(x - p.x, y - b, z - p.z, part))
        )
          return true;
      }
    return false;
  }
  groundAt(x, z, minY, maxY) {
    const cell = worldToAxial(x, z);
    let highest = null;
    for (
      let y = Math.max(0, Math.floor(minY) - 2);
      y <= Math.min(63, Math.floor(maxY));
      y++
    ) {
      const type = this.get(cell.q, y, cell.r);
      if (
        type &&
        !BLOCKS[type].shape &&
        !BLOCKS[type].nonSolid &&
        y + 1 >= minY - 1e-6 &&
        y + 1 <= maxY + 1e-6
      )
        highest = Math.max(highest ?? -Infinity, y + 1);
      for (const [dq, dr] of [[0, 0], ...DIRECTIONS]) {
        const q = cell.q + dq,
          r = cell.r + dr,
          shaped = this.get(q, y, r);
        if (!BLOCKS[shaped]?.shape || shaped === 'ladder') continue;
        const k = key(q, y, r),
          p = axialToWorld(q, r);
        if (!this.shapeCache.has(k))
          this.shapeCache.set(k, buildingParts(this, q, y, r, true));
        for (const part of this.shapeCache.get(k)) {
          const span = partSpan(x - p.x, z - p.z, part);
          if (!span) continue;
          const top = y + span[1];
          if (top < minY - 1e-6 || top > maxY + 1e-6) continue;
          highest = Math.max(highest ?? -Infinity, top);
        }
      }
    }
    return highest;
  }
  columnSolid(x, z, low, high) {
    const cell = worldToAxial(x, z);
    for (
      let y = Math.max(0, Math.floor(low) - 1);
      y <= Math.min(63, Math.floor(high));
      y++
    ) {
      const type = this.get(cell.q, y, cell.r);
      if (
        type &&
        !BLOCKS[type].shape &&
        !BLOCKS[type].nonSolid &&
        y + 1 > low &&
        y < high
      )
        return true;
      for (const [dq, dr] of [[0, 0], ...DIRECTIONS]) {
        const q = cell.q + dq,
          r = cell.r + dr,
          shaped = this.get(q, y, r);
        if (!BLOCKS[shaped]?.shape || shaped === 'ladder') continue;
        const k = key(q, y, r),
          p = axialToWorld(q, r);
        if (!this.shapeCache.has(k))
          this.shapeCache.set(k, buildingParts(this, q, y, r, true));
        for (const part of this.shapeCache.get(k)) {
          const span = partSpan(x - p.x, z - p.z, part);
          if (span && y + span[1] > low + 1e-7 && y + span[0] < high - 1e-7)
            return true;
        }
      }
    }
    return false;
  }
  set(q, y, r, type, record = true) {
    const k = key(q, y, r);
    const previous = this.get(q, y, r);
    if (previous !== type) this.lightRevision++;
    if (
      previous !== type &&
      (BLOCKS[previous]?.foliage ||
        BLOCKS[previous]?.log ||
        BLOCKS[type]?.foliage ||
        BLOCKS[type]?.log)
    ) {
      this.leafRevision++;
      if (record) this.persistentLeaves.delete(k);
    }
    if (record && !BLOCKS[type]?.foliage) this.leafDecay?.pending.delete(k);
    this.shapeCache.clear();
    if (record && previous !== type) this.blockStates.delete(k);
    if (this.loaded(q, r)) {
      this.indexTreeCell(k, type);
      if (type === 'portal') this.portalCells.add(k);
      else this.portalCells.delete(k);
      if (BLOCKS[type]?.shape) this.buildings.add(k);
      else this.buildings.delete(k);
      if (type === 'spawner') this.spawners.add(k);
      else this.spawners.delete(k);
      if (type) this.blocks.set(k, type);
      else this.blocks.delete(k);
    }
    if (record && this.loaded(q, r)) this.fluids.changedBlock(q, y, r);
    if (record && this.loaded(q, r)) this.gravity.wake(q, y, r);
    if (type !== 'chorusFlower') this.chorus.delete(k);
    if (this.loaded(q, r) && previous !== type) {
      for (const [a, b, c] of [
        [q, y, r],
        [q, y - 1, r],
        [q, y + 1, r],
        ...DIRECTIONS.map(([dq, dr]) => [q + dq, y, r + dr]),
      ])
        if (isChorus(this.get(a, b, c))) this.chorusPending.add(key(a, b, c));
    }
    if (record) {
      if (isCampfire(type)) {
        if (!this.campfires.has(k)) this.campfires.set(k, newCampfire());
      } else this.campfires.delete(k);
      this.edits.set(k, type || null);
      const ck = chunkKey(q, r);
      if (!this.editChunks.has(ck)) this.editChunks.set(ck, new Map());
      this.editChunks.get(ck).set(k, type || null);
    }
  }
  indexTreeCell(k, type) {
    this.treeLeaves.delete(k);
    this.treeLogs.delete(k);
    if (BLOCKS[type]?.foliage) this.treeLeaves.add(k);
    if (BLOCKS[type]?.log) this.treeLogs.add(k);
  }
  keepLeaf(q, y, r) {
    if (!BLOCKS[this.get(q, y, r)]?.foliage) return;
    this.persistentLeaves.add(key(q, y, r));
    this.leafRevision++;
  }
  generateChunk(cq, cr) {
    const ck = `${cq},${cr}`;
    if (this.chunks.has(ck)) return;
    this.lightRevision++;
    this.leafRevision++;
    this.chunks.set(ck, true);
    const put = (q, y, r, t) => {
      if (y >= 0 && y < WORLD_HEIGHT) this.blocks.set(key(q, y, r), t);
    };
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++) {
        const h = this.terrainHeight(q, r);
        this.heights.set(`${q},${r}`, h);
        const biome = this.biome(q, r);
        for (let y = 0; y < h; y++) {
          if (this.dimension === 'end') {
            if (
              y >=
              Math.max(
                3,
                h - 7 - Math.floor(noise(q * 0.1, r * 0.1, this.seed + 8) * 7),
              )
            )
              put(q, y, r, 'endstone');
            continue;
          }
          let t =
            y === 0
              ? 'bedrock'
              : this.dimension === 'nether'
                ? biome === '玄武岩荒地'
                  ? 'basalt'
                  : 'netherrack'
                : y === h - 1
                  ? h <= 6 || biome === '沙漠'
                    ? 'sand'
                    : biome === '雪原'
                      ? 'snow'
                      : 'grass'
                  : y > h - 4
                    ? biome === '沙漠'
                      ? 'sand'
                      : 'dirt'
                    : y < 6
                      ? 'deepslate'
                      : 'stone';
          const ore = hash(q, y, r, this.seed);
          if (
            y > 1 &&
            y < h - 3 &&
            noise(q * 0.15 + y * 0.26, r * 0.15 - y * 0.17, this.seed + 41) >
              0.76
          )
            continue;
          if (['stone', 'deepslate'].includes(t) && y > 1) {
            if (ore > 0.994 && y < 10) t = 'diamondOre';
            else if (ore > 0.981 && y < 11) t = 'goldOre';
            else if (ore > 0.967) t = 'crystal';
            else if (ore > 0.951 && y < 12) t = 'lapisOre';
            else if (ore > 0.94 && y < 10) t = 'redstoneOre';
            else if (ore > 0.927) t = 'ironOre';
            else if (ore > 0.89) t = 'copperOre';
            else if (ore > 0.835) t = 'coalOre';
          }
          if (
            this.dimension === 'overworld' &&
            ((h <= 7 &&
              y >= h - 3 &&
              y > 0 &&
              noise(q * 0.17, r * 0.17, this.seed + 763) > 0.54) ||
              (t === 'stone' &&
                noise(q * 0.19 + y * 0.08, r * 0.19, this.seed + 764) > 0.73))
          )
            t = 'gravel';
          if (
            this.dimension === 'nether' &&
            y === h - 1 &&
            noise(q * 0.12, r * 0.12, this.seed + 121) > 0.65
          )
            t = 'soulSand';
          if (this.dimension === 'nether' && y > 1 && ore > 0.97)
            t = 'glowstone';
          put(q, y, r, t);
        }
        if (this.dimension === 'nether')
          for (
            let y =
              48 + Math.floor(noise(q * 0.13, r * 0.13, this.seed + 9) * 5);
            y <= 55;
            y++
          )
            put(q, y, r, y === 55 ? 'bedrock' : 'netherrack');
        if (
          this.dimension === 'end' &&
          hexDistance(q, r) > 22 &&
          h &&
          hash(q, 54, r, this.seed) > 0.993
        )
          for (let y = h; y < h + 7; y++) put(q, y, r, 'obsidian');
      }
    // Generate trees from a two-cell halo, clipping writes to this chunk.
    // The result is independent of chunk load order, including negative seams.
    for (let tq = cq * 8 - 2; tq < cq * 8 + 10; tq++)
      for (let tr = cr * 8 - 2; tr < cr * 8 + 10; tr++)
        if (this.tree(tq, tr)) {
          for (const [q, y, r, type] of treeCells(
            this.treeKind(tq, tr),
            tq,
            this.terrainHeight(tq, tr),
            tr,
            this.seed,
          )) {
            if (chunkKey(q, r) !== ck) continue;
            const previous = this.get(q, y, r);
            // Crowns may overlap each other, but never erase trunks or hillsides.
            if (
              !BLOCKS[type].log &&
              previous &&
              !BLOCKS[previous]?.foliage &&
              previous !== 'shroom'
            )
              continue;
            put(q, y, r, type);
          }
        }
    stampChorus(this, cq, cr);
    for (const v of this.villages(cq * 8 + 4, cr * 8 + 4, 8))
      stampVillage(this, v, cq, cr);
    for (const s of this.structures(cq * 8 + 4, cr * 8 + 4, 8))
      stampStructure(this, s, cq, cr);
    stampEndArena(this, cq, cr);
    for (const [k, t] of this.editChunks.get(ck) || []) {
      if (isChorus(t)) this.chorusPending.add(k);
      if (BLOCKS[t]?.shape) this.buildings.add(k);
      else this.buildings.delete(k);
      if (t === 'spawner') this.spawners.add(k);
      else this.spawners.delete(k);
      if (t) this.blocks.set(k, t);
      else this.blocks.delete(k);
    }
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++)
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const k = key(q, y, r);
          this.indexTreeCell(k, this.blocks.get(k));
          this.gravity.index(q, y, r, this.blocks.get(k));
          if (this.blocks.get(k) === 'portal') this.portalCells.add(k);
          if (isCampfire(this.blocks.get(k)) && !this.campfires.has(k))
            this.campfires.set(k, newCampfire());
        }
    this.fluids.load(cq, cr);
    this.shapeCache.clear();
  }
  ensureAround(q, r, radius = VIEW_RADIUS + 1) {
    const cq = Math.floor(q / 8),
      cr = Math.floor(r / 8),
      next = `${cq},${cr},${radius}`;
    if (this.center === next) return false;
    this.center = next;
    for (let dq = -radius; dq <= radius; dq++)
      for (let dr = -radius; dr <= radius; dr++)
        this.generateChunk(cq + dq, cr + dr);
    for (const ck of this.chunks.keys()) {
      const [a, b] = ck.split(',').map(Number);
      if (Math.abs(a - cq) > radius || Math.abs(b - cr) > radius)
        this.unloadChunk(a, b);
    }
    return true;
  }
  unloadChunk(cq, cr) {
    this.lightRevision++;
    this.leafRevision++;
    this.fluids.unload(cq, cr);
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++) {
        this.heights.delete(`${q},${r}`);
        for (let y = 0; y < 64; y++) {
          const k = key(q, y, r);
          this.blocks.delete(k);
          this.treeLeaves.delete(k);
          this.treeLogs.delete(k);
          this.spawners.delete(k);
          this.buildings.delete(k);
          this.portalCells.delete(k);
          this.naturalStates.delete(k);
          this.chorusPending.delete(k);
        }
      }
    this.chunks.delete(`${cq},${cr}`);
    this.shapeCache.clear();
  }
  clearLoaded() {
    this.lightRevision++;
    this.leafRevision++;
    this.treeLeaves.clear();
    this.treeLogs.clear();
    this.fluids.clear();
    this.blocks.clear();
    this.spawners.clear();
    this.buildings.clear();
    this.portalCells.clear();
    this.gravity.pending.clear();
    this.naturalStates.clear();
    this.shapeCache.clear();
    this.heights.clear();
    this.chorusPending.clear();
    this.chunks.clear();
    this.center = null;
  }
  surface(q, r) {
    if (!this.loaded(q, r)) return this.terrainHeight(q, r);
    for (let y = 63; y >= 0; y--) {
      const t = this.get(q, y, r);
      if (t && !BLOCKS[t]?.nonSolid && (this.dimension !== 'nether' || y < 40))
        return y + 1;
    }
    return 0;
  }
  applyEdits(edits) {
    for (const [k, t] of edits) {
      const [q, y, r] = k.split(',').map(Number);
      this.set(q, y, r, t);
    }
  }
  serialize() {
    return {
      edits: [...this.edits],
      blockStates: [...this.blockStates],
      persistentLeaves: [...this.persistentLeaves],
      leafDecay: [...this.leafDecay.pending],
      furnaces: [...this.furnaces],
      brewing: [...this.brewing],
      campfires: [...this.campfires],
      falling: this.gravity.serialize(),
      chorus: [...this.chorus],
      structureFeatures: [...this.structureFeatures],
      discoveredStructures: [...this.discoveredStructures],
      fluids: this.fluids.serialize(),
      villageExclusions: [...this.villageExclusions],
      villageFeatures: [...this.villageFeatures],
      villageTrades: [...this.villageTrades],
    };
  }
}
