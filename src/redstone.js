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
    this.burnouts = new Map();
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
    if (type === 'repeater') {
      w.setState(q, y, r, { ...state, delay: ((state.delay || 1) % 4) + 1 });
      return true;
    }
    if (!['lever', 'stoneButton'].includes(type)) return false;
    if (type === 'stoneButton' && state.powered) return false;
    w.setState(q, y, r, {
      ...state,
      powered: type === 'lever' ? !state.powered : true,
    });
    if (type === 'stoneButton') this.timers.set(key(q, y, r), 1);
    return true;
  }
  emits(q, y, r, to) {
    const w = this.world,
      type = w.get(q, y, r),
      state = w.state(q, y, r);
    if (type === 'redstoneTorch')
      return (
        state.powered !== false &&
        key(...attachmentCell(q, y, r, state, DIRECTIONS)) !== key(...to)
      );
    if (!state.powered) return false;
    if (isCircuitInput(type)) return true;
    if (type !== 'repeater') return false;
    const [dq, dr] = DIRECTIONS[state.facing || 0];
    return to[0] === q + dq && to[1] === y && to[2] === r + dr;
  }
  locked(q, y, r) {
    const w = this.world,
      facing = w.state(q, y, r).facing || 0;
    return DIRECTIONS.some(
      ([dq, dr], i) =>
        i !== facing &&
        i !== (facing + 3) % 6 &&
        w.get(q + dq, y, r + dr) === 'repeater' &&
        this.emits(q + dq, y, r + dr, [q, y, r]),
    );
  }
  rearPowered(q, y, r, signals) {
    const [dq, dr] = DIRECTIONS[this.world.state(q, y, r).facing || 0],
      rear = [q - dq, y, r - dr],
      k = key(...rear);
    return (
      signals.levels.has(k) ||
      signals.strong.has(k) ||
      signals.weak.has(k) ||
      this.emits(...rear, [q, y, r])
    );
  }
  solve() {
    const w = this.world,
      strong = new Set(),
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
      const type = w.get(...p),
        state = w.state(...p);
      if (!(
        isCircuitInput(type) ||
        type === 'redstoneTorch' ||
        type === 'repeater'
      ))
        continue;
      for (const n of neighbors(...p)) {
        if (!this.emits(...p, n)) continue;
        direct.add(key(...n));
        seed(n, 15);
        if (this.conductive(...n)) weak.add(key(...n));
      }
      const support =
        type === 'redstoneTorch'
          ? [p[0], p[1] + 1, p[2]]
          : type === 'repeater'
            ? [
                p[0] + DIRECTIONS[state.facing || 0][0],
                p[1],
                p[2] + DIRECTIONS[state.facing || 0][1],
              ]
            : attachmentCell(...p, state, DIRECTIONS);
      if (this.emits(...p, support) && this.conductive(...support))
        strong.add(key(...support));
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
    return { strong, weak, direct, levels };
  }
  tick(dt, actors, operateDoor) {
    const w = this.world,
      changed = new Map(),
      occupied = new Set(),
      due = [];
    let cooled = false;
    const change = (q, y, r, powered) => {
      const state = w.state(q, y, r),
        on =
          w.get(q, y, r) === 'redstoneTorch'
            ? state.powered !== false
            : !!state.powered;
      if (on === powered) return;
      w.setState(q, y, r, { ...state, powered });
      changed.set(key(q, y, r), [q, y, r]);
    };
    for (const [k, heat] of this.burnouts) {
      const [q, , r] = coords(k);
      if (!w.loaded(q, r)) continue;
      heat.recent = heat.recent.map((t) => t - dt).filter((t) => t > 1e-8);
      const previous = heat.cooldown;
      heat.cooldown = Math.max(0, heat.cooldown - dt);
      if (previous && !heat.cooldown) cooled = true;
      if (!heat.recent.length && !heat.cooldown) this.burnouts.delete(k);
    }
    for (const k of w.circuitCells) {
      const [q, y, r] = coords(k);
      if (w.get(q, y, r) !== 'stonePressurePlate') continue;
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
      if (!w.loaded(q, r) || occupied.has(k)) continue;
      const type = w.get(q, y, r),
        time = remaining - dt;
      if (time > 1e-8) this.timers.set(k, time);
      else {
        this.timers.delete(k);
        if (type === 'repeater' || type === 'redstoneTorch') due.push(k);
        else change(q, y, r, false);
      }
    }
    if (
      this.revision === w.lightRevision &&
      !this.retry &&
      !due.length &&
      !cooled
    )
      return [...changed.values()];
    let signals = this.solve();
    // All due transitions observe the same pre-transition network. In
    // particular, a chain cannot consume several component delays at once.
    const transitions = due.map((k) => {
      const p = coords(k),
        type = w.get(...p),
        state = w.state(...p);
      if (type === 'repeater') {
        if (this.locked(...p)) return null;
        return !state.powered || !this.rearPowered(...p, signals)
          ? [p, !state.powered]
          : null;
      }
      const support = key(...attachmentCell(...p, state, DIRECTIONS));
      return [
        p,
        !(
          signals.strong.has(support) ||
          signals.weak.has(support) ||
          this.burnouts.get(k)?.cooldown
        ),
      ];
    });
    for (const transition of transitions)
      if (transition) {
        const [p, on] = transition,
          k = key(...p);
        if (
          w.get(...p) === 'redstoneTorch' &&
          w.state(...p).powered !== false &&
          !on
        ) {
          const heat = this.burnouts.get(k) || { recent: [], cooldown: 0 };
          heat.recent.push(3);
          if (heat.recent.length >= 8) heat.cooldown = 8;
          this.burnouts.set(k, heat);
        }
        change(...p, on);
      }
    if (transitions.some(Boolean)) signals = this.solve();
    const { direct, strong, weak, levels } = signals;
    for (const k of w.circuitCells) {
      const p = coords(k),
        type = w.get(...p),
        state = w.state(...p);
      if (type !== 'redstoneTorch' && type !== 'repeater') continue;
      if (type === 'repeater' && this.locked(...p)) {
        this.timers.delete(k);
        continue;
      }
      const support = key(...attachmentCell(...p, state, DIRECTIONS)),
        desired =
          type === 'repeater'
            ? this.rearPowered(...p, signals)
            : !(
                strong.has(support) ||
                weak.has(support) ||
                this.burnouts.get(k)?.cooldown
              ),
        on =
          type === 'redstoneTorch' ? state.powered !== false : !!state.powered;
      if (desired !== on && !this.timers.has(k))
        this.timers.set(
          k,
          type === 'repeater' ? (state.delay || 1) * 0.1 : 0.1,
        );
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
