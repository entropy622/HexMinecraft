import { BLOCKS, DIRECTIONS, axialToWorld, worldToAxial } from './core.js';
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
  const source = dispensingSource(world, q, y, r);
  if (!source) return false;
  const { slot, target, direction } = source,
    stack = slot.get(),
    dy = direction[1];
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
  ejectStack(world, drops, takeSlot(slot, 1), source.position, direction);
  return true;
}

export function dispensingSource(world, q, y, r) {
  if (BLOCKS[world.get(q, y, r)]?.shape !== 'dropper') return null;
  const slots = blockSlots(world, q, y, r);
  if (!slots) return null;
  const choices = Object.values(slots).filter((s) => s.get());
  if (!choices.length) return null;
  const slot = choices[Math.floor(Math.random() * choices.length)],
    [dq, dy, dr] = dropperOffset(world.state(q, y, r).facing),
    target = [q + dq, y + dy, r + dr];
  if (!world.loaded(target[0], target[2])) return null;
  const p = axialToWorld(q, r),
    direction = axialToWorld(dq, dr),
    length = Math.hypot(direction.x, direction.z) || 1;
  const x = direction.x / length,
    z = direction.z / length,
    outlet = Math.sqrt(3) / 2 + 0.2;
  return {
    slot,
    slots,
    target,
    direction: [x, dy, z],
    position: [p.x + x * outlet, y + 0.5 + dy * 0.7, p.z + z * outlet],
  };
}
export function ejectStack(world, drops, stack, position, [x, dy, z]) {
  // A blocked outlet must not trap the item inside a chest or solid wall.
  // Push to an immediately adjacent free face, as loose item entities do.
  const clear = (p) => {
    const cell = worldToAxial(p[0], p[2]);
    return (
      world.loaded(cell.q, cell.r) && !world.pointSolid(p[0], p[1] - 0.15, p[2])
    );
  };
  if (!clear(position)) {
    const outlet = Math.sqrt(3) / 2 + 0.2,
      center = [
        position[0] - x * outlet,
        position[1] - dy * 0.7,
        position[2] - z * outlet,
      ],
      candidates = [[center[0], center[1] + 0.7, center[2]]];
    for (const [q, r] of DIRECTIONS) {
      const p = axialToWorld(q, r),
        length = Math.hypot(p.x, p.z);
      candidates.push([
        center[0] + (p.x / length) * outlet,
        center[1],
        center[2] + (p.z / length) * outlet,
      ]);
    }
    position = candidates.find(clear) || position;
  }
  drops.spawnStack(stack, position, [
    x * 3 + (Math.random() - 0.5) * 0.8,
    2.5 + dy * 3,
    z * 3 + (Math.random() - 0.5) * 0.8,
  ]);
}

export function replaceDispensed(world, source, item, drops) {
  takeSlot(source.slot, 1);
  const replacement = { item, count: 1 };
  if (!source.slot.get()) {
    source.slot.set(replacement);
    return;
  }
  for (const occupied of [true, false])
    for (const slot of Object.values(source.slots))
      if (!!slot.get() === occupied && insertSlot(slot, replacement, 1)) return;
  ejectStack(world, drops, replacement, source.position, source.direction);
}
