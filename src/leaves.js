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
  if (random() < [0.05, 0.0625, 1 / 12, 0.1][level])
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
    if (this.revision !== world.leafRevision) this.rebuild(dt);
    const removed = [];
    for (const [k, remaining] of this.pending) {
      const [q, y, r] = k.split(',').map(Number);
      if (!world.loaded(q, r)) continue;
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
