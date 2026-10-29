import { BLOCKS, DIRECTIONS, axialToWorld, key } from './core.js';
import { isOpenable, doorUpper } from './building-data.js';
import { isCircuitInput, attachmentCell, isPiston } from './redstone-data.js';
import { actuatePiston } from './pistons.js';
import { isGlass } from './dye-data.js';
import { dropperOffset } from './droppers.js';
import { stackSize } from './inventory.js';
import { blockSlots } from './block-inventory.js';
import { storageLidClear } from './chests.js';
import { CAULDRON_BLOCKS } from './cauldron-data.js';

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
    this.signals = {
      levels: new Map(),
      strong: new Map(),
      weak: new Map(),
      direct: new Map(),
    };
    this.revision = -1;
    this.retry = false;
  }
  power(q, y, r) {
    return this.signals.levels.get(key(q, y, r)) || 0;
  }
  blockChanged(q, y, r) {
    const w = this.world;
    if (!w.loaded(q, r)) return;
    for (const p of neighbors(q, y, r)) {
      const k = key(...p);
      if (!w.circuitCells.has(k) || w.get(...p) !== 'observer') continue;
      const state = w.state(...p),
        d = dropperOffset(state.facing);
      if (p[0] + d[0] !== q || p[1] + d[1] !== y || p[2] + d[2] !== r) continue;
      // Coalesce while waiting or pulsing; a later change cannot stretch a pulse.
      if (!state.powered && !this.timers.has(k)) this.timers.set(k, 0.1);
    }
  }
  conductive(q, y, r) {
    const type = this.world.get(q, y, r),
      block = BLOCKS[type];
    return (
      !!block &&
      !block.nonSolid &&
      !block.foliage &&
      !isGlass(type) &&
      (!block.shape ||
        block.shape === 'dropper' ||
        (block.shape === 'piston' && !this.world.state(q, y, r).open) ||
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
    if (type === 'comparator') {
      w.setState(q, y, r, { ...state, subtract: !state.subtract });
      return true;
    }
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
  outputTo(q, y, r, to) {
    const w = this.world,
      type = w.get(q, y, r),
      state = w.state(q, y, r);
    if (type === 'redstoneTorch')
      return state.powered !== false &&
        key(...attachmentCell(q, y, r, state, DIRECTIONS)) !== key(...to)
        ? 15
        : 0;
    if (isCircuitInput(type)) return state.powered ? 15 : 0;
    if (type === 'observer') {
      const d = dropperOffset(state.facing);
      return state.powered && to.every((v, i) => v === [q, y, r][i] - d[i])
        ? 15
        : 0;
    }
    if (type !== 'repeater' && type !== 'comparator') return 0;
    const [dq, dr] = DIRECTIONS[state.facing || 0];
    if (to[0] !== q + dq || to[1] !== y || to[2] !== r + dr) return 0;
    return type === 'comparator' ? state.output || 0 : state.powered ? 15 : 0;
  }
  locked(q, y, r) {
    const w = this.world,
      facing = w.state(q, y, r).facing || 0;
    return DIRECTIONS.some(
      ([dq, dr], i) =>
        i !== facing &&
        i !== (facing + 3) % 6 &&
        w.get(q + dq, y, r + dr) === 'repeater' &&
        this.outputTo(q + dq, y, r + dr, [q, y, r]) > 0,
    );
  }
  levelAt(p, to, signals) {
    const k = key(...p);
    return Math.max(
      signals.levels.get(k) || 0,
      signals.strong.get(k) || 0,
      signals.weak.get(k) || 0,
      this.outputTo(...p, to),
    );
  }
  rearLevel(q, y, r, signals) {
    const [dq, dr] = DIRECTIONS[this.world.state(q, y, r).facing || 0];
    return this.levelAt([q - dq, y, r - dr], [q, y, r], signals);
  }
  containerLevel(q, y, r) {
    const w = this.world,
      type = w.get(q, y, r);
    if (CAULDRON_BLOCKS[type]) return CAULDRON_BLOCKS[type].cauldronLevel;
    if (type === 'chest' && !storageLidClear(w, q, y, r)) return 0;
    const endpoints = blockSlots(w, q, y, r);
    if (!endpoints) return BLOCKS[type]?.storage ? 0 : null;
    const slots = Object.values(endpoints).map((s) => s.get());
    const fullness = slots.reduce(
      (n, slot) => n + (slot ? slot.count / stackSize(slot.item) : 0),
      0,
    );
    return fullness > 0 ? Math.floor(1 + (14 * fullness) / slots.length) : 0;
  }
  comparatorLevel(q, y, r, signals) {
    const state = this.world.state(q, y, r),
      facing = state.facing || 0,
      [dq, dr] = DIRECTIONS[facing],
      rear = [q - dq, y, r - dr];
    let back = this.rearLevel(q, y, r, signals);
    const reading = this.containerLevel(...rear);
    if (reading !== null) back = reading;
    else if (back < 15 && this.conductive(...rear)) {
      const through = this.containerLevel(q - 2 * dq, y, r - 2 * dr);
      if (through !== null) back = through;
    }
    let side = 0;
    DIRECTIONS.forEach(([a, b], i) => {
      if (i === facing || i === (facing + 3) % 6) return;
      const p = [q + a, y, r + b],
        type = this.world.get(...p);
      if (type === 'redstoneWire')
        side = Math.max(side, signals.levels.get(key(...p)) || 0);
      else if (type === 'repeater' || type === 'comparator')
        side = Math.max(side, this.outputTo(...p, [q, y, r]));
    });
    return state.subtract ? Math.max(0, back - side) : back >= side ? back : 0;
  }
  pistonPowered(q, y, r, signals) {
    const d = dropperOffset(this.world.state(q, y, r).facing),
      front = key(q + d[0], y + d[1], r + d[2]);
    return neighbors(q, y, r).some(
      (p) => key(...p) !== front && this.levelAt(p, [q, y, r], signals) > 0,
    );
  }
  solve() {
    const w = this.world,
      strong = new Map(),
      direct = new Map(),
      weak = new Map(),
      levels = new Map(),
      queue = [];
    const supply = (map, p, level) => {
      const k = key(...p);
      if (level > (map.get(k) || 0)) map.set(k, level);
    };
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
        type === 'repeater' ||
        type === 'observer' ||
        type === 'comparator'
      ))
        continue;
      for (const n of neighbors(...p)) {
        const level = this.outputTo(...p, n);
        if (!level) continue;
        supply(direct, n, level);
        seed(n, level);
        if (this.conductive(...n)) supply(weak, n, level);
      }
      const support =
        type === 'redstoneTorch'
          ? [p[0], p[1] + 1, p[2]]
          : type === 'observer'
            ? p.map((v, i) => v - dropperOffset(state.facing)[i])
            : type === 'repeater' || type === 'comparator'
              ? [
                  p[0] + DIRECTIONS[state.facing || 0][0],
                  p[1],
                  p[2] + DIRECTIONS[state.facing || 0][1],
                ]
              : attachmentCell(...p, state, DIRECTIONS);
      if (this.conductive(...support))
        supply(strong, support, this.outputTo(...p, support));
    }
    for (const [k, level] of strong)
      for (const n of neighbors(...coords(k))) seed(n, level);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i],
        level = levels.get(key(...p));
      if (level > 1) for (const n of this.connections(...p)) seed(n, level - 1);
    }
    for (const [k, level] of levels) {
      if (!level) continue;
      for (const n of neighbors(...coords(k)))
        if (this.conductive(...n)) supply(weak, n, level);
    }
    return { strong, weak, direct, levels };
  }
  tick(dt, actors, operateDoor, dispense) {
    const w = this.world,
      changed = new Map(),
      occupied = new Set(),
      due = [],
      comparators = [],
      broken = [],
      motions = [];
    const result = () => ({ changed: [...changed.values()], broken, motions });
    let cooled = false;
    const change = (q, y, r, powered) => {
      const state = w.state(q, y, r),
        type = w.get(q, y, r),
        on =
          type === 'comparator'
            ? state.output || 0
            : type === 'redstoneTorch'
              ? state.powered !== false
              : !!state.powered;
      if (on === powered) return;
      w.setState(q, y, r, {
        ...state,
        ...(type === 'comparator' ? { output: powered } : { powered }),
      });
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
      if (w.get(q, y, r) === 'comparator') comparators.push([q, y, r]);
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
    for (const [k, remaining] of [...this.timers]) {
      const [q, y, r] = coords(k);
      if (!w.loaded(q, r) || occupied.has(k)) continue;
      const type = w.get(q, y, r),
        time = remaining - dt;
      if (time > 1e-8) this.timers.set(k, time);
      else {
        this.timers.delete(k);
        if (BLOCKS[type]?.shape === 'dropper') dispense(q, y, r);
        else if (
          isPiston(type) ||
          ['repeater', 'redstoneTorch', 'comparator', 'observer'].includes(type)
        )
          due.push(k);
        else change(q, y, r, false);
      }
    }
    const scheduleComparators = (signals) => {
      for (const p of comparators) {
        const k = key(...p);
        if (
          this.comparatorLevel(...p, signals) !== (w.state(...p).output || 0) &&
          !this.timers.has(k)
        )
          this.timers.set(k, 0.1);
      }
    };
    if (
      this.revision === w.blockRevision &&
      !this.retry &&
      !due.length &&
      !cooled
    ) {
      // Inventory slots can change without topology/light revisions. Reuse the
      // current network and sample actual containers; no UI invalidation API.
      scheduleComparators(this.signals);
      return result();
    }
    let signals = this.solve();
    const pistonDue = due
      .filter((k) => isPiston(w.get(...coords(k))))
      .map((k) => {
        const p = coords(k);
        return [p, this.pistonPowered(...p, signals)];
      });
    // All due transitions observe the same pre-transition network. In
    // particular, a chain cannot consume several component delays at once.
    const transitions = due.map((k) => {
      const p = coords(k),
        type = w.get(...p),
        state = w.state(...p);
      if (isPiston(type)) return null;
      if (type === 'observer') return [p, !state.powered];
      if (type === 'comparator')
        return [p, this.comparatorLevel(...p, signals)];
      if (type === 'repeater') {
        if (this.locked(...p)) return null;
        return !state.powered || !this.rearLevel(...p, signals)
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
        if (w.get(...p) === 'observer' && on) this.timers.set(k, 0.1);
        change(...p, on);
      }
    if (transitions.some(Boolean)) signals = this.solve();
    const { direct, strong, weak, levels } = signals;
    scheduleComparators(signals);
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
            ? this.rearLevel(...p, signals) > 0
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
    for (const k of new Set([...levels.keys(), ...this.signals.levels.keys()]))
      if ((levels.get(k) || 0) !== (this.signals.levels.get(k) || 0)) {
        changed.set(k, coords(k));
        if (w.get(...coords(k)) === 'redstoneWire')
          this.blockChanged(...coords(k));
      }
    this.signals = signals;
    this.retry = false;
    for (const k of w.circuitCells) {
      const p = coords(k),
        type = w.get(...p);
      if (
        type !== 'redstoneLamp' &&
        type !== 'hopper' &&
        type !== 'dropper' &&
        type !== 'dispenser' &&
        !isPiston(type) &&
        !isOpenable(type)
      )
        continue;
      const on = isPiston(type)
        ? this.pistonPowered(...p, signals)
        : powered(p) || (!!doorUpper(type) && powered([p[0], p[1] + 1, p[2]]));
      if (
        isPiston(type) &&
        !!w.state(...p).open !== on &&
        !this.timers.has(k) &&
        !due.includes(k)
      )
        this.timers.set(k, 0.1);
      if (!!w.state(...p).powered === on) continue;
      if (isOpenable(type)) {
        // Opening a trapdoor may remove supported wires. Revisit the network
        // on the next physics step, including after a successful operation.
        this.retry = true;
        if (!operateDoor(...p, on)) continue;
      }
      change(...p, on);
      if (BLOCKS[type]?.shape === 'dropper' && on && !this.timers.has(k))
        this.timers.set(k, 0.2);
    }
    for (const [p, on] of pistonDue) {
      const movement = actuatePiston(w, ...p, on);
      const current = this.pistonPowered(...p, signals),
        k = key(...p);
      // A diode may produce a new edge while this older request expires.
      // Preserve that edge's delay without polling an unchanged blocked piston.
      if (
        isPiston(w.get(...p)) &&
        current !== on &&
        !!w.state(...p).open !== current &&
        !this.timers.has(k)
      )
        this.timers.set(k, 0.1);
      if (!movement) continue;
      for (const cell of movement.changed) changed.set(key(...cell), cell);
      broken.push(...movement.broken);
      motions.push(movement.motion);
      // Moving a conductor or support changes the next physics step's network.
      this.retry = true;
    }
    this.revision = w.blockRevision;
    return result();
  }
}
