import {
  World as LegacyWorld,
  BLOCKS,
  DIRECTIONS,
  noise,
  hash,
  hexDistance,
  key,
} from './core.js';

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
    this.heights = new Map();
    this.chunks = new Map();
    this.edits = new Map();
    this.editChunks = new Map();
    this.center = null;
    this.legacy = options.legacy ? new LegacyWorld(seed) : null;
    this.legacyMode = !!options.legacy;
    this.maxY = WORLD_HEIGHT;
    this.beacons = [];
    if (options.edits) this.applyEdits(options.edits);
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
    return wet > 0.53 ? '森林' : '青翠平原';
  }
  terrainHeight(q, r) {
    if (this.legacy && hexDistance(q, r) <= 32)
      return this.legacy.terrainHeight(q, r);
    const n = noise(q * 0.055, r * 0.055, this.seed),
      detail = noise(q * 0.18, r * 0.18, this.seed + 19);
    if (this.dimension === 'nether') return Math.floor(4 + n * 15 + detail * 3);
    if (this.dimension === 'end') {
      const island = noise(q * 0.032, r * 0.032, this.seed + 941);
      if (hexDistance(q, r) > 12 && island < 0.43) return 0;
      return Math.floor(17 + n * 9 + detail * 3);
    }
    if (hexDistance(q, r) < 5) return 11;
    return Math.max(2, Math.floor(3 + n * 18 + detail * 3));
  }
  tree(q, r) {
    if (this.dimension === 'end' || hexDistance(q, r) < 5)
      return q === 3 && r === 0 && this.dimension === 'overworld';
    const b = this.biome(q, r),
      h = this.terrainHeight(q, r);
    return (
      h > 6 &&
      !['沙漠', '玄武岩荒地'].includes(b) &&
      hash(q, 17, r, this.seed) > (b === '森林' ? 0.948 : 0.981)
    );
  }
  get(q, y, r) {
    return this.blocks.get(key(q, y, r));
  }
  loaded(q, r) {
    return this.chunks.has(chunkKey(q, r));
  }
  solid(q, y, r) {
    const t = this.get(q, y, r);
    return !!t && !BLOCKS[t]?.nonSolid;
  }
  set(q, y, r, type, record = true) {
    const k = key(q, y, r);
    if (this.loaded(q, r)) {
      if (type) this.blocks.set(k, type);
      else this.blocks.delete(k);
    }
    if (record) {
      this.edits.set(k, type || null);
      const ck = chunkKey(q, r);
      if (!this.editChunks.has(ck)) this.editChunks.set(ck, new Map());
      this.editChunks.get(ck).set(k, type || null);
    }
  }
  generateChunk(cq, cr) {
    const ck = `${cq},${cr}`;
    if (this.chunks.has(ck)) return;
    this.chunks.set(ck, true);
    const put = (q, y, r, t) => {
      if (y >= 0 && y < WORLD_HEIGHT) this.blocks.set(key(q, y, r), t);
    };
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++) {
        const h = this.terrainHeight(q, r);
        this.heights.set(`${q},${r}`, h);
        if (this.legacy && hexDistance(q, r) <= 32) {
          for (let y = 0; y < 64; y++) {
            const t = this.legacy.get(q, y, r);
            if (t) put(q, y, r, t);
          }
          continue;
        }
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
                    : 'stone';
          const ore = hash(q, y, r, this.seed);
          if (
            y > 1 &&
            y < h - 3 &&
            noise(q * 0.15 + y * 0.26, r * 0.15 - y * 0.17, this.seed + 41) >
              0.76
          )
            continue;
          if (t === 'stone' && y > 1) {
            if (ore > 0.992 && y < 12) t = 'diamond';
            else if (ore > 0.967) t = 'crystal';
            else if (ore > 0.927) t = 'iron';
            else if (ore > 0.865) t = 'coal';
          }
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
        if (this.dimension === 'end' && h && hash(q, 54, r, this.seed) > 0.993)
          for (let y = h; y < h + 7; y++) put(q, y, r, 'obsidian');
      }
    // Generate trees from a two-cell halo, clipping writes to this chunk.
    // The result is independent of chunk load order, including negative seams.
    for (let tq = cq * 8 - 2; tq < cq * 8 + 10; tq++)
      for (let tr = cr * 8 - 2; tr < cr * 8 + 10; tr++)
        if (this.tree(tq, tr)) {
          const h = this.terrainHeight(tq, tr),
            trunk = 4;
          for (let dq = -2; dq <= 2; dq++)
            for (let dr = -2; dr <= 2; dr++) {
              const q = tq + dq,
                r = tr + dr;
              if (
                chunkKey(q, r) !== ck ||
                (this.legacy && hexDistance(q, r) <= 32)
              )
                continue;
              if (!dq && !dr)
                for (let y = h; y < h + trunk; y++)
                  put(
                    q,
                    y,
                    r,
                    this.dimension === 'nether' ? 'crimsonwood' : 'wood',
                  );
              if (hexDistance(dq, dr) <= 2)
                for (let dy = 0; dy < 2; dy++)
                  if (!dy || hexDistance(dq, dr) <= 1)
                    put(
                      q,
                      h + trunk + dy,
                      r,
                      this.dimension === 'nether' ? 'shroom' : 'leaves',
                    );
            }
        }
    for (const [k, t] of this.editChunks.get(ck) || []) {
      if (t) this.blocks.set(k, t);
      else this.blocks.delete(k);
    }
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
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++) {
        this.heights.delete(`${q},${r}`);
        for (let y = 0; y < 64; y++) this.blocks.delete(key(q, y, r));
      }
    this.chunks.delete(`${cq},${cr}`);
  }
  clearLoaded() {
    this.blocks.clear();
    this.heights.clear();
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
    return { edits: [...this.edits], legacy: this.legacyMode };
  }
}
