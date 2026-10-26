import { BLOCKS, DIRECTIONS, axialToWorld, key } from './core.js';
import { isOpenable, doorUpper } from './building-data.js';
import { isCircuitInput, attachmentCell } from './redstone-data.js';

const coords = (k) => k.split(',').map(Number);
const neighbors = (q, y, r) => [
  [q, y - 1, r],
  [q, y + 1, r],
  ...DIRECTIONS.map(([dq, dr]) => [q + dq, y, r + dr]),
];

export class Redstone {
  constructor(world) {
    this.world = world;
    this.timers = new Map();
    this.levels = new Map();
    this.revision = -1;
    this.retry = false;
  }
  power(q, y, r) {
    return this.levels.get(key(q, y, r)) || 0;
  }
  conductive(q, y, r) {
    const type = this.world.get(q, y, r),
      block = BLOCKS[type];
    return (
      !!block &&
      !block.nonSolid &&
      !block.foliage &&
      type !== 'glass' &&
      (!block.shape ||
        (block.shape === 'slab' && this.world.state(q, y, r).double))
    );
  }
  connections(q, y, r) {
    const w = this.world,
      result = [];
    for (const [dq, dr] of DIRECTIONS) {
      const a = q + dq,
        c = r + dr;
      if (w.get(a, y, c) === 'redstoneWire') result.push([a, y, c]);
      else if (
        this.conductive(a, y, c) &&
        !w.solid(q, y + 1, r) &&
        w.get(a, y + 1, c) === 'redstoneWire'
      )
        result.push([a, y + 1, c]);
      else if (
        !w.solid(a, y, c) &&
        !w.get(a, y, c) &&
        w.get(a, y - 1, c) === 'redstoneWire'
      )
        result.push([a, y - 1, c]);
    }
    return result;
  }
  activate(q, y, r) {
    const w = this.world,
      type = w.get(q, y, r),
      state = w.state(q, y, r);
    if (!['lever', 'stoneButton'].includes(type)) return false;
    if (type === 'stoneButton' && state.powered) return false;
    w.setState(q, y, r, {
      ...state,
      powered: type === 'lever' ? !state.powered : true,
    });
    if (type === 'stoneButton') this.timers.set(key(q, y, r), 1);
    return true;
  }
  tick(dt, actors, operateDoor) {
    const w = this.world,
      changed = new Map(),
      occupied = new Set();
    const change = (q, y, r, powered) => {
      const state = w.state(q, y, r);
      if (!!state.powered === powered) return;
      w.setState(q, y, r, { ...state, powered });
      changed.set(key(q, y, r), [q, y, r]);
    };
    for (const k of w.circuitCells) {
      const [q, y, r] = coords(k),
        type = w.get(q, y, r);
      if (type !== 'stonePressurePlate') continue;
      const p = axialToWorld(q, r);
      if (
        actors.some(
          (a) =>
            Math.abs(a.y - y) < 0.16 &&
            Math.hypot(a.x - p.x, a.z - p.z) < 0.65 + (a.radius || 0),
        )
      ) {
        this.timers.set(k, 0.5);
        occupied.add(k);
        change(q, y, r, true);
      }
    }
    for (const [k, remaining] of this.timers) {
      const [q, y, r] = coords(k);
      if (!w.loaded(q, r)) continue;
      const type = w.get(q, y, r);
      if (!['stoneButton', 'stonePressurePlate'].includes(type)) {
        this.timers.delete(k);
        continue;
      }
      const time = remaining - dt;
      // An occupied plate keeps its full release delay.
      if (occupied.has(k)) continue;
      if (time > 1e-8) this.timers.set(k, time);
      else {
        this.timers.delete(k);
        change(q, y, r, false);
      }
    }
    if (this.revision === w.lightRevision && !this.retry)
      return [...changed.values()];
    const strong = new Set(),
      direct = new Set(),
      weak = new Set(),
      levels = new Map(),
      queue = [];
    const seed = (p, level) => {
      const k = key(...p);
      if (w.get(...p) === 'redstoneWire' && level > (levels.get(k) || 0)) {
        levels.set(k, level);
        queue.push(p);
      }
    };
    for (const k of w.circuitCells) {
      const p = coords(k);
      if (!isCircuitInput(w.get(...p)) || !w.state(...p).powered) continue;
      for (const n of neighbors(...p)) {
        direct.add(key(...n));
        seed(n, 15);
      }
      const support = attachmentCell(...p, w.state(...p), DIRECTIONS);
      if (this.conductive(...support)) strong.add(key(...support));
    }
    for (const k of strong)
      for (const n of neighbors(...coords(k))) seed(n, 15);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i],
        level = levels.get(key(...p));
      if (level > 1) for (const n of this.connections(...p)) seed(n, level - 1);
    }
    for (const [k, level] of levels) {
      if (!level) continue;
      for (const n of neighbors(...coords(k)))
        if (this.conductive(...n)) weak.add(key(...n));
    }
    const powered = (p) =>
      direct.has(key(...p)) ||
      strong.has(key(...p)) ||
      weak.has(key(...p)) ||
      neighbors(...p).some(
        (n) =>
          strong.has(key(...n)) || weak.has(key(...n)) || levels.has(key(...n)),
      );
    for (const k of new Set([...levels.keys(), ...this.levels.keys()]))
      if ((levels.get(k) || 0) !== (this.levels.get(k) || 0))
        changed.set(k, coords(k));
    this.levels = levels;
    this.retry = false;
    for (const k of w.circuitCells) {
      const p = coords(k),
        type = w.get(...p);
      if (type !== 'redstoneLamp' && !isOpenable(type)) continue;
      const on =
        powered(p) || (!!doorUpper(type) && powered([p[0], p[1] + 1, p[2]]));
      if (!!w.state(...p).powered === on) continue;
      if (isOpenable(type)) {
        // Opening a trapdoor may remove supported wires. Revisit the network
        // on the next physics step, including after a successful operation.
        this.retry = true;
        if (!operateDoor(...p, on)) continue;
      }
      change(...p, on);
    }
    this.revision = w.lightRevision;
    return [...changed.values()];
  }
}
