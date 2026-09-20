import { DIRECTIONS, key } from './core.js';

export const LIQUIDS = {
  water: {
    name: '水',
    bucket: 'waterBucket',
    color: '#62a6ee',
    range: 7,
    delay: 1,
    opacity: 0.7,
    speed: 3,
    coolant: true,
  },
  lava: {
    name: '岩浆',
    bucket: 'lavaBucket',
    color: '#ff792b',
    range: 3,
    delay: 4,
    opacity: 0.98,
    speed: 1.8,
    damage: 4,
  },
  glow: {
    name: '萤晶液',
    bucket: 'glowBucket',
    color: '#7ef8cb',
    range: 5,
    delay: 2,
    opacity: 0.8,
    speed: 2.4,
    coolant: true,
  },
};
export const fluidHeight = (f) => (f.falling ? 1 : 0.92 - f.level * 0.085);
const chunk = (q, r) => `${Math.floor(q / 8)},${Math.floor(r / 8)}`;
const equal = (a, b) =>
  a?.type === b?.type &&
  a?.source === b?.source &&
  a?.level === b?.level &&
  a?.falling === b?.falling;

// Discrete source-fed flow. Only loaded cells simulate; unloaded snapshots freeze.
// A bounded work queue propagates changes, including removal and solidification.
export class Fluids {
  constructor(world, edits = []) {
    this.world = world;
    this.chunks = new Map();
    this.edits = new Map(edits);
    this.editChunks = new Map();
    this.active = new Set();
    this.dirty = new Set();
    this.blockChanges = new Set();
    this.clock = 0;
    this.tick = 0;
    for (const [k, f] of edits) {
      const [q, , r] = k.split(',').map(Number),
        ck = chunk(q, r);
      if (!this.editChunks.has(ck)) this.editChunks.set(ck, new Map());
      this.editChunks.get(ck).set(k, f);
    }
  }
  get(q, y, r) {
    return this.chunks.get(chunk(q, r))?.get(key(q, y, r));
  }
  open(q, y, r) {
    return (
      y >= 1 && y < 64 && this.world.loaded(q, r) && !this.world.get(q, y, r)
    );
  }
  wake(q, y, r) {
    for (const [a, b, c] of [
      [q, y, r],
      [q, y - 1, r],
      [q, y + 1, r],
      ...DIRECTIONS.map(([a, b]) => [q + a, y, r + b]),
    ])
      if (b >= 1 && b < 64 && this.world.loaded(a, c))
        this.active.add(key(a, b, c));
  }
  write(q, y, r, f, record = true) {
    const ck = chunk(q, r),
      k = key(q, y, r),
      cells = this.chunks.get(ck);
    if (!cells) return;
    if (equal(cells.get(k), f)) return;
    if (f) cells.set(k, { ...f });
    else cells.delete(k);
    if (record) {
      this.edits.set(k, f ? { ...f } : null);
      if (!this.editChunks.has(ck)) this.editChunks.set(ck, new Map());
      this.editChunks.get(ck).set(k, f ? { ...f } : null);
    }
    this.dirty.add(ck);
    this.wake(q, y, r);
    if (
      q % 8 === 0 ||
      ((q % 8) + 8) % 8 === 7 ||
      r % 8 === 0 ||
      ((r % 8) + 8) % 8 === 7
    )
      for (const [a, b] of DIRECTIONS) this.dirty.add(chunk(q + a, r + b));
  }
  load(cq, cr) {
    const ck = `${cq},${cr}`,
      cells = new Map();
    this.chunks.set(ck, cells);
    const type =
      this.world.dimension === 'overworld'
        ? 'water'
        : this.world.dimension === 'nether'
          ? 'lava'
          : null;
    if (type)
      for (let q = cq * 8; q < cq * 8 + 8; q++)
        for (let r = cr * 8; r < cr * 8 + 8; r++)
          if (this.world.terrainHeight(q, r) <= 5)
            for (let y = 1; y <= 5; y++)
              if (!this.world.get(q, y, r))
                cells.set(key(q, y, r), {
                  type,
                  source: true,
                  level: 0,
                  falling: false,
                });
    for (const p of this.world.villageSources(cq, cr))
      if (this.open(p.q, p.y, p.r))
        cells.set(key(p.q, p.y, p.r), {
          type: 'water',
          source: true,
          level: 0,
          falling: false,
        });
    for (const [k, f] of this.editChunks.get(ck) || []) {
      const [q, y, r] = k.split(',').map(Number);
      if (f && this.open(q, y, r)) cells.set(k, { ...f });
      else cells.delete(k);
      this.wake(q, y, r);
    }
    // Reconnect only wet border cells; a distant pristine sea needs no updates.
    for (const [k] of cells) {
      const [q, y, r] = k.split(',').map(Number);
      if (q === cq * 8 || q === cq * 8 + 7 || r === cr * 8 || r === cr * 8 + 7)
        this.wake(q, y, r);
    }
    // New dry chunks must wake the old wet edge too, including a pending
    // empty frontier cell whose source is one more cell inside the old chunk.
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        for (const k of this.chunks.get(`${cq + a},${cr + b}`)?.keys() || []) {
          const [q, y, r] = k.split(',').map(Number);
          if (
            q >= cq * 8 - 2 &&
            q <= cq * 8 + 9 &&
            r >= cr * 8 - 2 &&
            r <= cr * 8 + 9
          )
            this.wake(q, y, r);
        }
      }
    this.dirty.add(ck);
    for (const [a, b] of DIRECTIONS) this.dirty.add(`${cq + a},${cr + b}`);
  }
  unload(cq, cr) {
    const ck = `${cq},${cr}`;
    this.chunks.delete(ck);
    this.dirty.delete(ck);
    for (const k of this.active) {
      const [q, , r] = k.split(',').map(Number);
      if (chunk(q, r) === ck) this.active.delete(k);
    }
  }
  changedBlock(q, y, r) {
    if (this.world.get(q, y, r) && this.get(q, y, r)) this.write(q, y, r, null);
    this.wake(q, y, r);
  }
  source(q, y, r, type) {
    if (!Object.hasOwn(LIQUIDS, type) || !this.open(q, y, r)) return false;
    const old = this.get(q, y, r);
    if (old?.source && old.type === type) return false;
    if (old && old.type !== type) {
      if (this.react(q, y, r, old, { type, source: true })) return true;
      return false;
    }
    this.write(q, y, r, { type, source: true, level: 0, falling: false });
    // Bucket placement reacts immediately, even while a large waterfall settles.
    const placed = this.get(q, y, r);
    for (const [a, b, c] of [
      [q, y - 1, r],
      [q, y + 1, r],
      ...DIRECTIONS.map(([a, b]) => [q + a, y, r + b]),
    ]) {
      const other = this.get(a, b, c);
      if (!other) continue;
      if (type === 'lava' && this.react(q, y, r, placed, other)) break;
      if (other.type === 'lava') this.react(a, b, c, other, placed);
    }
    return true;
  }
  scoop(q, y, r) {
    const f = this.get(q, y, r);
    if (!f?.source) return null;
    this.write(q, y, r, null);
    return f.type;
  }
  react(q, y, r, a, b) {
    if (!(
      (a.type === 'lava' && LIQUIDS[b.type].coolant) ||
      (b.type === 'lava' && LIQUIDS[a.type].coolant)
    ))
      return false;
    const lava = a.type === 'lava' ? a : b,
      coolant = a.type === 'lava' ? b : a;
    const solid =
      coolant.type === 'glow'
        ? 'glowstone'
        : lava.source
          ? 'obsidian'
          : 'stone';
    this.write(q, y, r, null);
    this.world.set(q, y, r, solid);
    this.blockChanges.add(key(q, y, r));
    return true;
  }
  update(q, y, r) {
    let current = this.get(q, y, r);
    if (!this.open(q, y, r)) {
      if (current) this.write(q, y, r, null);
      return;
    }
    const around = [
      [q, y + 1, r],
      [q, y - 1, r],
      ...DIRECTIONS.map(([a, b]) => [q + a, y, r + b]),
    ];
    if (current?.type === 'lava')
      for (const [a, b, c] of around) {
        const other = this.get(a, b, c);
        if (other && this.react(q, y, r, current, other)) return;
      }
    if (current?.source) return;
    // A boundary cannot know whether its feeder was removed while unloaded.
    if (DIRECTIONS.some(([a, b]) => !this.world.loaded(q + a, r + b))) return;
    const above = this.get(q, y + 1, r);
    let next = above
      ? { type: above.type, source: false, level: 0, falling: true }
      : null;
    if (!next)
      for (const [a, b] of DIRECTIONS) {
        const n = this.get(q + a, y, r + b);
        if (!n) continue;
        const supported =
          !!this.world.get(q + a, y - 1, r + b) ||
          !!this.get(q + a, y - 1, r + b)?.source;
        if (!supported) continue;
        const level = n.level + 1;
        if (level > LIQUIDS[n.type].range) continue;
        if (!next || level < next.level)
          next = { type: n.type, source: false, level, falling: false };
      }
    if (
      current &&
      next &&
      current.type !== next.type &&
      this.react(q, y, r, current, next)
    )
      return;
    this.write(q, y, r, next);
  }
  step(dt, budget = 320) {
    this.clock += dt;
    if (this.clock < 0.12) return 0;
    this.clock = Math.min(this.clock - 0.12, 0.24);
    this.tick++;
    const batch = [];
    for (const k of this.active) {
      batch.push(k);
      if (batch.length >= budget) break;
    }
    for (const k of batch) {
      this.active.delete(k);
      const [q, y, r] = k.split(',').map(Number);
      if (!this.world.loaded(q, r)) continue;
      const f = this.get(q, y, r);
      const neighbors = [
        f,
        this.get(q, y + 1, r),
        ...DIRECTIONS.map(([a, b]) => this.get(q + a, y, r + b)),
      ].filter(Boolean);
      const delay = Math.max(1, ...neighbors.map((n) => LIQUIDS[n.type].delay));
      if (this.tick % delay) {
        this.active.add(k);
        continue;
      }
      this.update(q, y, r);
    }
    return batch.length;
  }
  clear() {
    this.chunks.clear();
    this.active.clear();
    this.dirty.clear();
    this.blockChanges.clear();
  }
  serialize() {
    return [...this.edits];
  }
}
