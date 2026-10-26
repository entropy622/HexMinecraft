import { BLOCKS, axialToWorld, key } from './core.js';
import { granular } from './ignition-data.js';
import { pointedSupport, stalactiteImpactDamage } from './dripstone.js';

export const validFalling = (records) =>
  Array.isArray(records) &&
  records.length <= 256 &&
  records.every(
    (b) =>
      b &&
      (granular(b.type) || b.type === 'pointedDripstone') &&
      [b.q, b.r].every((n) => Number.isSafeInteger(n) && Math.abs(n) < 1e9) &&
      Number.isFinite(b.y) &&
      b.y >= -10 &&
      b.y < 64 &&
      Number.isFinite(b.velocity) &&
      b.velocity >= -40 &&
      b.velocity <= 0,
  );
export class Gravity {
  constructor(world, records = []) {
    this.world = world;
    this.active = structuredClone(records);
    this.pending = new Set();
  }
  serialize() {
    return structuredClone(this.active);
  }
  wake(q, y, r) {
    const immediate = [];
    for (const h of [y - 1, y, y + 1]) {
      const type = this.world.get(q, h, r);
      if (type === 'pointedDripstone') immediate.push(key(q, h, r));
      else if (h >= y && granular(type)) this.pending.add(key(q, h, r));
    }
    if (immediate.length)
      this.pending = new Set([...immediate, ...this.pending]);
  }
  index(q, y, r, type) {
    if (type === 'pointedDripstone') {
      this.pending.add(key(q, y, r));
      return;
    }
    if (!granular(type)) return;
    const below = this.world.get(q, y - 1, r);
    if (!below || BLOCKS[below].nonSolid || BLOCKS[below].shape)
      this.pending.add(key(q, y, r));
  }
  tick(dt, callbacks) {
    const world = this.world,
      changed = [];
    let budget = 32;
    while (this.pending.size && budget-- > 0 && this.active.length < 256) {
      const k = this.pending.values().next().value;
      this.pending.delete(k);
      const [q, y, r] = k.split(',').map(Number),
        type = world.get(q, y, r);
      if (
        !world.loaded(q, r) ||
        (!granular(type) && type !== 'pointedDripstone')
      )
        continue;
      const p = axialToWorld(q, r);
      const pointed = type === 'pointedDripstone',
        down = pointed && !!world.state(q, y, r).upper;
      if (pointed) {
        if (pointedSupport(world, q, y, r, down)) continue;
      } else {
        const support = world.groundAt(p.x, p.z, y - 1, y);
        if (support !== null && support > y - 0.01) continue;
      }
      world.set(q, y, r, null);
      changed.push([q, y, r]);
      if (pointed && !down) {
        callbacks.drop(type, q, y, r);
        continue;
      }
      this.active.push({ q, y, r, type, velocity: 0 });
    }
    this.active = this.active.filter((block) => {
      const { q, r } = block;
      if (!world.loaded(q, r)) return true;
      const p = axialToWorld(q, r);
      block.velocity = Math.max(-40, block.velocity - dt * 20);
      const next = block.y + block.velocity * dt;
      const support = world.groundAt(p.x, p.z, next, block.y + 0.001);
      if (support !== null) {
        if (block.type === 'pointedDripstone') {
          callbacks.impact?.(
            block,
            support,
            stalactiteImpactDamage(block.velocity),
          );
          callbacks.drop(block.type, q, support, r);
          return false;
        }
        const y = Math.round(support),
          old = world.get(q, y, r);
        if (
          Math.abs(support - y) > 0.01 ||
          y >= 63 ||
          (old && old !== 'portal') ||
          !callbacks.canPlace(q, y, r)
        ) {
          callbacks.drop(block.type, q, support, r);
        } else {
          world.set(q, y, r, block.type);
          changed.push([q, y, r]);
        }
        return false;
      }
      block.y = next;
      if (block.y < -5) {
        callbacks.drop(block.type, q, 0, r);
        return false;
      }
      return true;
    });
    return changed;
  }
}
