import { copyStack, sameStack, stackSize } from './inventory.js';

export const slotLimit = (slot, stack) =>
  slot && stack && (!slot.accepts || slot.accepts(stack))
    ? Math.min(stackSize(stack.item), slot.limit ?? Infinity)
    : 0;

// Every container provides the same small endpoint: get, set, accepts and taken.
// taken runs before mutation so furnace experience can use the original count.
export function takeSlot(slot, count) {
  const stack = slot?.get();
  if (!stack) return null;
  if (slot.whole && count < stack.count) return null;
  const n = Math.min(stack.count, count);
  if (n <= 0) return null;
  slot.taken?.(stack, n);
  const result = copyStack(stack, n);
  slot.set(n === stack.count ? null : copyStack(stack, stack.count - n));
  return result;
}
export function insertSlot(slot, stack, requested = stack?.count) {
  if (!stack) return 0;
  const old = slot?.get(),
    limit = slotLimit(slot, stack);
  if (!limit || (old && !sameStack(old, stack))) return 0;
  const n = Math.min(requested, stack.count, limit - (old?.count || 0));
  if (n <= 0) return 0;
  slot.set(copyStack(stack, (old?.count || 0) + n));
  return n;
}
export function moveSlot(source, destinations) {
  const stack = source?.get();
  if (!stack) return 0;
  if (source.whole) {
    const capacity = destinations.reduce((n, dest) => {
      const old = dest.get();
      return (
        n +
        (!old || sameStack(old, stack)
          ? Math.max(0, slotLimit(dest, stack) - (old?.count || 0))
          : 0)
      );
    }, 0);
    if (capacity < stack.count) return 0;
  }
  let moved = 0;
  // Fill compatible stacks before occupying an empty slot.
  for (const occupied of [true, false])
    for (const dest of destinations) {
      if (!!dest.get() !== occupied) continue;
      const n = insertSlot(dest, stack, stack.count - moved);
      moved += n;
      if (moved === stack.count) break;
    }
  if (moved) takeSlot(source, moved);
  return moved;
}
export class ContainerSession {
  constructor(resolve) {
    this.resolve = resolve;
    this.cursor = null;
    this.origin = null;
  }
  click(ref, right = false) {
    const slot = this.resolve(ref),
      old = slot?.get();
    if (!slot) return false;
    if (!this.cursor) {
      if (!old) return false;
      this.cursor = takeSlot(
        slot,
        right && !slot.whole ? Math.ceil(old.count / 2) : old.count,
      );
      this.origin = ref;
      return true;
    }
    const n = insertSlot(slot, this.cursor, right ? 1 : this.cursor.count);
    if (n) {
      this.cursor.count -= n;
      if (!this.cursor.count) this.cursor = null;
      return true;
    }
    // A full matching stack does nothing; a different stack exchanges hands.
    if (
      old &&
      !sameStack(old, this.cursor) &&
      slotLimit(slot, this.cursor) >= this.cursor.count
    ) {
      const held = this.cursor;
      this.cursor = takeSlot(slot, old.count);
      slot.set(held);
      this.origin = ref;
      return true;
    }
    // Output slots reject deposits, but can still top up an existing cursor.
    if (old && sameStack(old, this.cursor) && slot.output) {
      const room = stackSize(old.item) - this.cursor.count;
      const taken = takeSlot(slot, room);
      if (taken) {
        this.cursor.count += taken.count;
        return true;
      }
    }
    return false;
  }
  canDistribute(ref) {
    if (!this.cursor) return false;
    const slot = this.resolve(ref),
      old = slot?.get();
    return (
      slotLimit(slot, this.cursor) > (old?.count || 0) &&
      (!old || sameStack(old, this.cursor))
    );
  }
  distribution(refs, right = false, creative = false) {
    if (!this.cursor) return [];
    const targets = [...new Set(refs)]
      .filter((ref) => this.canDistribute(ref))
      .slice(0, creative ? Infinity : this.cursor.count)
      .map((ref) => ({ ref, slot: this.resolve(ref) }));
    const each = creative
      ? Infinity
      : right
        ? 1
        : Math.floor(this.cursor.count / targets.length);
    let remaining = creative ? Infinity : this.cursor.count;
    return targets.map(({ ref, slot }) => {
      const count = Math.min(
        each,
        remaining,
        slotLimit(slot, this.cursor) - (slot.get()?.count || 0),
      );
      remaining -= count;
      return { ref, count, total: (slot.get()?.count || 0) + count };
    });
  }
  distribute(refs, right = false, creative = false) {
    const plan = this.distribution(refs, right, creative);
    const stack = creative
      ? copyStack(this.cursor, stackSize(this.cursor?.item))
      : this.cursor;
    let moved = 0;
    for (const { ref, count } of plan)
      moved += insertSlot(this.resolve(ref), stack, count);
    if (moved && !creative) {
      this.cursor.count -= moved;
      if (!this.cursor.count) this.cursor = null;
    }
    return moved > 0;
  }
  gather(refs) {
    if (!this.cursor || stackSize(this.cursor.item) === 1) return false;
    let moved = 0;
    for (const partial of [true, false])
      for (const ref of refs) {
        const slot = this.resolve(ref),
          old = slot?.get();
        if (slot?.collect === false) continue;
        if (
          !sameStack(old, this.cursor) ||
          old.count < stackSize(old.item) !== partial
        )
          continue;
        const n = Math.min(stackSize(old.item) - this.cursor.count, old.count);
        const taken = n > 0 ? takeSlot(slot, n) : null;
        if (taken) {
          this.cursor.count += taken.count;
          moved += taken.count;
        }
      }
    return moved > 0;
  }
  swap(a, b) {
    if (a === b) return false;
    const left = this.resolve(a),
      right = this.resolve(b);
    if (!left || !right) return false;
    const x = left.get(),
      y = right.get();
    if (
      (!x && !y) ||
      (x && slotLimit(right, x) < x.count) ||
      (y && slotLimit(left, y) < y.count)
    )
      return false;
    if (x) left.taken?.(x, x.count);
    if (y) right.taken?.(y, y.count);
    left.set(copyStack(y));
    right.set(copyStack(x));
    return true;
  }
  returnCursor(destinations) {
    if (!this.cursor) return null;
    const source = {
      get: () => this.cursor,
      set: (s) => {
        this.cursor = s;
      },
    };
    const origin = this.resolve(this.origin);
    if (this.origin?.startsWith('pack:') && origin) moveSlot(source, [origin]);
    if (this.cursor) moveSlot(source, destinations);
    const remainder = this.cursor;
    this.cursor = null;
    this.origin = null;
    return remainder;
  }
}
