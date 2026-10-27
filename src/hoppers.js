import { DIRECTIONS, key } from './core.js';
import { blockSlots, insertionSlots } from './block-inventory.js';
import { insertSlot, takeSlot } from './container-actions.js';
import { isFurnace } from './processing-data.js';

const PERIOD = 0.4;
const coords = (k) => k.split(',').map(Number);

export class Hoppers {
  constructor(world) {
    this.world = world;
    this.cooldowns = new Map();
  }
  tick(dt, drops) {
    const w = this.world;
    const cells = [...w.circuitCells]
      .filter((k) => w.get(...coords(k)) === 'hopper')
      .sort();
    // Bound extraction to stock present at the start of this step. Receiving an
    // item cannot send that same item through an entire empty chain in one step.
    const stock = new Map(
      cells.map((k) => [
        k,
        Object.values(blockSlots(w, ...coords(k))).map(
          (s) => s.get()?.count || 0,
        ),
      ]),
    );
    for (const k of cells) {
      const left = (this.cooldowns.get(k) || 0) - dt;
      if (left > 1e-8) this.cooldowns.set(k, left);
      else this.cooldowns.delete(k);
    }
    const move = (from, to, sourceKey, targetKey) => {
      if (!from || !to) return false;
      const budget = stock.get(sourceKey),
        destinations = Object.values(to);
      const empty = stock.has(targetKey) && destinations.every((s) => !s.get());
      for (const [name, source] of Object.entries(from)) {
        const stack = source.get();
        if (!stack || (budget && !budget[Number(name)])) continue;
        for (const occupied of [true, false])
          for (const dest of destinations) {
            if (!!dest.get() !== occupied || !insertSlot(dest, stack, 1))
              continue;
            takeSlot(source, 1);
            if (budget) budget[Number(name)]--;
            if (empty) this.cooldowns.set(targetKey, PERIOD);
            return true;
          }
      }
      return false;
    };
    for (const k of cells) {
      const [q, y, r] = coords(k),
        state = w.state(q, y, r);
      if (state.powered || this.cooldowns.has(k)) continue;
      const own = blockSlots(w, q, y, r);
      const [dq, dr] = DIRECTIONS[state.facing || 0];
      const output = state.down !== false ? [q, y - 1, r] : [q + dq, y, r + dr];
      const target = insertionSlots(
        w,
        ...output,
        state.down !== false ? 'top' : 'side',
      );
      const pushed = move(own, target, k, key(...output));
      const above = [q, y + 1, r],
        aboveType = w.get(...above);
      let source = blockSlots(w, ...above);
      if (source && isFurnace(aboveType)) {
        source = {
          output: source.output,
          ...(source.fuel.get()?.item === 'bucket'
            ? { fuel: source.fuel }
            : {}),
        };
      }
      if (source && aboveType === 'brewingStand')
        source = { 0: source[0], 1: source[1], 2: source[2] };
      const pulled = move(source, own, key(...above), k);
      // A container above takes precedence over loose entities.
      const collected =
        !source && drops
          ? drops.collectHopper(w, q, y, r, Object.values(own))
          : 0;
      if (pushed || pulled || collected) this.cooldowns.set(k, PERIOD);
    }
  }
}
