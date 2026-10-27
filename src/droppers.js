import { BLOCKS, DIRECTIONS, axialToWorld } from './core.js';
import { blockSlots, insertionSlots } from './block-inventory.js';
import { insertSlot, takeSlot } from './container-actions.js';

// Hex worlds have six horizontal directions plus down (6) and up (7).
export function dropperOffset(facing = 0) {
  if (facing >= 6) return [0, facing === 6 ? -1 : 1, 0];
  const [q, r] = DIRECTIONS[facing];
  return [q, 0, r];
}
export function fireDropper(world, q, y, r, drops) {
  if (world.get(q, y, r) !== 'dropper') return false;
  const source = blockSlots(world, q, y, r),
    choices = Object.values(source).filter((s) => s.get());
  if (!choices.length) return false;
  const slot = choices[Math.floor(Math.random() * choices.length)],
    stack = slot.get();
  const [dq, dy, dr] = dropperOffset(world.state(q, y, r).facing),
    target = [q + dq, y + dy, r + dr];
  if (!world.loaded(target[0], target[2])) return false;
  const dest = insertionSlots(
    world,
    ...target,
    dy < 0 ? 'top' : dy > 0 ? 'bottom' : 'side',
  );
  // Undiscovered treasure is a container even before its loot is initialized.
  if (!dest && BLOCKS[world.get(...target)]?.storage) return false;
  if (dest) {
    for (const occupied of [true, false])
      for (const s of Object.values(dest)) {
        if (!!s.get() !== occupied || !insertSlot(s, stack, 1)) continue;
        takeSlot(slot, 1);
        return true;
      }
    return false;
  }
  const p = axialToWorld(q, r),
    direction = axialToWorld(dq, dr),
    length = Math.hypot(direction.x, direction.z) || 1;
  const x = direction.x / length,
    z = direction.z / length,
    outlet = Math.sqrt(3) / 2 + 0.2;
  drops.spawnStack(
    takeSlot(slot, 1),
    [p.x + x * outlet, y + 0.5 + dy * 0.7, p.z + z * outlet],
    [
      x * 3 + (Math.random() - 0.5) * 0.8,
      2.5 + dy * 3,
      z * 3 + (Math.random() - 0.5) * 0.8,
    ],
  );
  return true;
}
