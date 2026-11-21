import { BLOCKS, DIRECTIONS, hash, key } from './core.js';

const REACH = 6;
const neighbors = (q, y, r) => [
  ...DIRECTIONS.map(([dq, dr]) => [q + dq, y, r + dr]),
  [q, y - 1, r],
  [q, y + 1, r],
];

export function leafDrops(
  type,
  shears = false,
  random = Math.random,
  fortune = 0,
) {
  const block = BLOCKS[type];
  if (!block?.foliage) return [];
  if (shears) return [{ item: type, count: 1 }];
  const drops = [];
  const level = Math.min(3, Math.max(0, fortune));
  if (
    random() <
    (type === 'jungleLeaves'
      ? [0.025, 1 / 36, 1 / 32, 1 / 24]
      : [0.05, 0.0625, 1 / 12, 0.1])[level]
  )
    drops.push({ item: block.sapling, count: 1 });
  if (type === 'leaves' && random() < [0.02, 0.025, 1 / 30, 0.04][level])
    drops.push({ item: 'apple', count: 1 });
  return drops;
}

// Face-connected leaf distance on the hex grid. Unknown chunk edges act as
// possible support until loaded, so unloading a trunk cannot destroy its crown.
export class LeafDecay {
  constructor(world, saved = []) {
    this.world = world;
    this.pending = new Map(saved);
    this.revision = -1;
    this.distance = new Map();
    this.uncertain = new Map();
  }

  stream() {
    this.tiles = new Set(this.world.chunks.keys());
  }
  invalidate(cq, cr) {
    if (!this.tiles) return;
    for (let x = cq - 1; x <= cq + 1; x++)
      for (let z = cr - 1; z <= cr + 1; z++) {
        const k = x + ',' + z;
        if (this.world.chunks.has(k)) this.tiles.add(k);
      }
  }
  // A trunk can support leaves at most six faces away. A six-cell halo
  // therefore gives the exact same result for the middle tile as a world BFS.
  step() {
    if (!this.tiles?.size) return false;
    const tile = this.tiles.values().next().value;
    this.tiles.delete(tile);
    const world = this.world,
      dense = world.columns.get(tile);
    if (!dense) return true;
    const [cq, cr] = tile.split(',').map(Number),
      side = 8 + 2 * REACH,
      height = world.maxY,
      size = side * side * height,
      minQ = cq * 8 - REACH,
      minR = cr * 8 - REACH;
    const kind = new Uint8Array(size),
      boundary = new Uint8Array(side * side);
    for (let x = 0; x < side; x++)
      for (let z = 0; z < side; z++) {
        const q = minQ + x,
          r = minR + z,
          data = world.columns.get((q >> 3) + ',' + (r >> 3));
        if (!data) continue;
        const col = x * side + z,
          offset = ((q & 7) * 8 + (r & 7)) * height;
        boundary[col] = Number(
          DIRECTIONS.some(([a, b]) => !world.loaded(q + a, r + b)),
        );
        for (let y = 0; y < height; y++) {
          const b = BLOCKS[data[offset + y]];
          if (b?.log || b?.foliage) kind[col * height + y] = b.log ? 2 : 1;
        }
      }
    const queue = new Int32Array(size);
    const propagate = (unknown) => {
      const distance = new Uint8Array(size).fill(255);
      let end = 0;
      for (let i = 0; i < size; i++) {
        if (
          unknown
            ? kind[i] === 1 && boundary[Math.floor(i / height)]
            : kind[i] === 2
        ) {
          queue[end++] = i;
          distance[i] = unknown ? 1 : 0;
        }
      }
      for (let at = 0; at < end; at++) {
        const i = queue[at],
          n = distance[i] + 1;
        if (n > REACH) continue;
        const col = Math.floor(i / height),
          x = Math.floor(col / side),
          z = col % side,
          y = i % height;
        for (let d = 0; d < 8; d++) {
          let j;
          if (d < 6) {
            const [a, b] = DIRECTIONS[d];
            if (x + a < 0 || x + a >= side || z + b < 0 || z + b >= side)
              continue;
            j = i + (a * side + b) * height;
          } else {
            if (d === 6 ? y === 0 : y === height - 1) continue;
            j = i + (d === 6 ? -1 : 1);
          }
          if (kind[j] === 1 && distance[j] === 255) {
            distance[j] = n;
            queue[end++] = j;
          }
        }
      }
      return distance;
    };
    const supported = propagate(false),
      uncertain = propagate(true);
    for (let x = 0; x < 8; x++)
      for (let z = 0; z < 8; z++)
        for (let y = 0; y < height; y++) {
          const i = ((x + REACH) * side + z + REACH) * height + y;
          if (kind[i] !== 1) continue;
          const q = cq * 8 + x,
            r = cr * 8 + z,
            k = key(q, y, r);
          if (supported[i] <= REACH) this.distance.set(k, supported[i]);
          else this.distance.delete(k);
          if (uncertain[i] <= REACH) this.uncertain.set(k, uncertain[i]);
          else this.uncertain.delete(k);
          if (
            world.persistentLeaves.has(k) ||
            supported[i] <= REACH ||
            uncertain[i] <= REACH
          )
            this.pending.delete(k);
          else if (!this.pending.has(k))
            this.pending.set(k, 6 + hash(q, y + 131, r, world.seed) * 14);
        }
    return true;
  }
  spread(seeds) {
    const distance = new Map(),
      queue = [];
    const add = (q, y, r, steps) => {
      const k = key(q, y, r);
      if (!this.world.treeLeaves.has(k) || distance.has(k)) return;
      distance.set(k, steps);
      queue.push([q, y, r, steps]);
    };
    for (const [q, y, r] of seeds) add(q, y, r, 1);
    for (let i = 0; i < queue.length; i++) {
      const [q, y, r, steps] = queue[i];
      if (steps >= REACH) continue;
      for (const [a, b, c] of neighbors(q, y, r)) add(a, b, c, steps + 1);
    }
    return distance;
  }

  rebuild(dt = 0) {
    const world = this.world,
      supported = [],
      boundary = [];
    for (const k of world.treeLogs)
      supported.push(...neighbors(...k.split(',').map(Number)));
    this.distance = this.spread(supported);
    for (const k of world.treeLeaves) {
      const [q, y, r] = k.split(',').map(Number);
      if (DIRECTIONS.some(([dq, dr]) => !world.loaded(q + dq, r + dr)))
        boundary.push([q, y, r]);
    }
    this.uncertain = this.spread(boundary);
    for (const k of world.treeLeaves) {
      if (
        world.persistentLeaves.has(k) ||
        this.distance.has(k) ||
        this.uncertain.has(k)
      ) {
        this.pending.delete(k);
        continue;
      }
      if (!this.pending.has(k)) {
        const [q, y, r] = k.split(',').map(Number);
        this.pending.set(k, dt + 6 + hash(q, y + 131, r, world.seed) * 14);
      }
    }
    this.revision = world.leafRevision;
  }

  update(dt) {
    const world = this.world;
    if (!this.tiles && this.revision !== world.leafRevision) this.rebuild(dt);
    const removed = [];
    for (const [k, remaining] of this.pending) {
      const [q, y, r] = k.split(',').map(Number);
      if (!world.loaded(q, r) || this.tiles?.has((q >> 3) + ',' + (r >> 3)))
        continue;
      const type = world.get(q, y, r);
      if (!BLOCKS[type]?.foliage || world.persistentLeaves.has(k)) {
        this.pending.delete(k);
        continue;
      }
      if (remaining > dt) {
        this.pending.set(k, remaining - dt);
        continue;
      }
      world.set(q, y, r, null);
      removed.push({ q, y, r, type });
    }
    return removed;
  }

  label(k) {
    if (this.world.persistentLeaves.has(k)) return '建筑叶块 · 不会自然消散';
    if (this.pending.has(k)) return '失去树干支撑 · 即将消散';
    if (this.uncertain.has(k) && !this.distance.has(k))
      return '等待远处区块加载';
    return '剪刀收叶块 · 普通采集可掉树苗';
  }
}
