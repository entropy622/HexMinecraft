import { BLOCKS, axialToWorld, worldToAxial, key } from './core.js';
import { buildingParts } from './building-shapes.js';
import { HEX_POLYGON } from './cut-blocks.js';
import { isDoor, isDoorTop, doorUpper } from './building-data.js';
import { isPiston, isPistonHead, pistonHead } from './redstone-data.js';
import { dropperOffset } from './droppers.js';
import { isFurnace } from './processing-data.js';
import { isCampfire } from './campfire-data.js';
import { bodyOffsets } from './grounding.js';
import { partSpan } from './shape-columns.js';
import { miningLoot } from './mining-loot.js';
import { isHangingPlant } from './cave-data.js';
import { harvestCavePlant } from './cave-plants.js';
import { isChorus } from './chorus-data.js';
import { harvestChorus } from './chorus.js';
import { isPigmentPlant } from './dye-data.js';
import { harvestCocoa } from './cocoa.js';

function reaction(world, p) {
  const type = world.get(...p),
    block = BLOCKS[type];
  if (!type) return 'empty';
  if (
    !Number.isFinite(block.hardness) ||
    [
      'obsidian',
      'portal',
      'endportal',
      'spawner',
      'enchantingTable',
      'brewingStand',
    ].includes(type) ||
    isFurnace(type) ||
    isCampfire(type) ||
    (block.storage && !block.portable) ||
    isPistonHead(type) ||
    (isPiston(type) && world.state(...p).open)
  )
    return 'stop';
  if (
    block.portable ||
    block.nonSolid ||
    block.foliage ||
    isChorus(type) ||
    isPigmentPlant(type) ||
    isDoor(type) ||
    type === 'pointedDripstone' ||
    type === 'cocoa'
  )
    return 'break';
  return 'move';
}
const available = (w, p) => p[1] >= 0 && p[1] < w.maxY && w.loaded(p[0], p[2]);

// This function only commits after the entire push fits. Block entities remain
// immovable; ordinary block state travels with the block, not its old cell.
export function actuatePiston(world, q, y, r, extend) {
  const origin = [q, y, r],
    type = world.get(...origin),
    state = world.state(...origin);
  if (!isPiston(type) || !!state.open === extend) return null;
  const offset = dropperOffset(state.facing),
    at = (n) => origin.map((v, i) => v + offset[i] * n),
    front = at(1),
    line = [],
    fragile = [],
    broken = [],
    changed = new Map(),
    moves = [];
  if (!available(world, front)) return null;
  if (extend) {
    for (let n = 1; ; n++) {
      const p = at(n);
      if (!available(world, p)) return null;
      const action = reaction(world, p);
      if (action === 'stop') return null;
      if (action === 'empty') break;
      if (action === 'break') {
        let root = p;
        if (isDoorTop(world.get(...p))) root = [p[0], p[1] - 1, p[2]];
        const kind = world.get(...root),
          cells = [root];
        if (doorUpper(kind)) cells.push([root[0], root[1] + 1, root[2]]);
        if (cells.some((c) => !available(world, c))) return null;
        const stack = BLOCKS[kind].portable
          ? {
              item: kind,
              count: 1,
              contents: structuredClone(
                world.chests.get(key(...root)) || Array(27).fill(null),
              ),
            }
          : null;
        fragile.push({ position: root, type: kind, cells, stack });
        break;
      }
      if (line.length === 12) return null;
      line.push(p);
    }
  } else if (
    world.get(...front) !== pistonHead(type) ||
    world.state(...front).facing !== state.facing
  )
    return null;
  else if (
    type === 'stickyPiston' &&
    available(world, at(2)) &&
    reaction(world, at(2)) === 'move'
  )
    line.push(at(2));

  const direction = offset.map((v) => v * (extend ? 1 : -1)),
    snapshots = line.map((from) => {
      const kind = world.get(...from),
        k = key(...from);
      return {
        from,
        to: from.map((v, i) => v + direction[i]),
        type: kind,
        state: world.blockStates.get(k) || world.naturalStates.get(k),
        parts: BLOCKS[kind].shape
          ? buildingParts(world, ...from, true)
          : [
              {
                x: 0,
                y: 0.5,
                z: 0,
                h: 1,
                angle: 0,
                polygon: HEX_POLYGON,
              },
            ],
      };
    });
  const set = (p, kind) => {
    world.set(...p, kind);
    changed.set(key(...p), p);
  };
  // Close the base before removing its head so paired-removal does not mine it.
  if (!extend) {
    world.setState(...origin, { ...state, open: false });
    set(front, null);
  }
  for (const b of fragile) {
    if (isHangingPlant(b.type) || isChorus(b.type) || b.type === 'cocoa') {
      const harvested =
        b.type === 'cocoa'
          ? harvestCocoa(world, ...b.position)
          : isChorus(b.type)
            ? harvestChorus(world, ...b.position)
            : harvestCavePlant(world, ...b.position);
      for (const p of harvested.changed)
        changed.set(key(p.q, p.y, p.r), [p.q, p.y, p.r]);
      for (const p of harvested.drops)
        broken.push({
          position: [p.q, p.y, p.r],
          stack: { item: p.item, count: p.count },
        });
    } else {
      for (const p of b.cells) set(p, null);
      if (b.stack) world.chests.delete(key(...b.position));
      const stacks = b.stack
        ? [b.stack]
        : BLOCKS[b.type].drop
          ? [{ item: BLOCKS[b.type].drop, count: 1 }]
          : miningLoot(b.type).stacks;
      for (const stack of stacks) broken.push({ position: b.position, stack });
    }
  }
  for (const block of snapshots.toReversed()) {
    set(block.from, null);
    set(block.to, block.type);
    if (block.state)
      world.setState(...block.to, {
        ...block.state,
        ...(block.type === 'observer' ? { powered: false } : {}),
      });
    if (block.type === 'observer')
      world.redstone.timers.set(key(...block.to), 0.1);
    moves.push({ from: block.from, to: block.to, parts: block.parts });
  }
  if (extend) {
    set(front, pistonHead(type));
    world.setState(...front, { facing: state.facing, open: false });
    moves.push({
      from: origin,
      to: front,
      parts: buildingParts(world, ...front, true),
    });
    world.setState(...origin, { ...state, open: true });
  }
  changed.set(key(...origin), origin);
  const horizontal = axialToWorld(direction[0], direction[2]);
  return {
    changed: [...changed.values()],
    broken,
    motion: { direction: [horizontal.x, direction[1], horizontal.z], moves },
  };
}

// Use the same partial-block columns and body samples as ordinary movement.
// Sample the swept shapes, then move up to the next fixed obstacle. Destination
// cells of the moving shapes are excluded only during this displacement.
export function pushPistonActors(world, motion, actors) {
  const d = motion.direction,
    length = Math.hypot(...d),
    ignored = new Set(motion.moves.map((m) => key(...m.to)));
  for (const actor of actors) {
    const offsets = bodyOffsets(actor.radius),
      height = actor.height;
    let contact = Infinity;
    for (const move of motion.moves) {
      const center = axialToWorld(move.from[0], move.from[2]);
      if (
        Math.hypot(actor.x - center.x, actor.z - center.z) > 3 + actor.radius ||
        actor.y > move.from[1] + 2 ||
        actor.y + height < move.from[1] - 1
      )
        continue;
      for (let n = 0; n <= 32 && n / 32 < contact; n++) {
        const t = n / 32,
          by = move.from[1] + d[1] * t;
        if (
          offsets.some(([dx, dz]) =>
            move.parts.some((part) => {
              const span = partSpan(
                actor.x + dx - center.x - d[0] * t,
                actor.z + dz - center.z - d[2] * t,
                part,
              );
              return (
                span &&
                by + span[1] > actor.y + 0.005 &&
                by + span[0] < actor.y + height - 0.005
              );
            }),
          )
        ) {
          // The first intersecting sample is after contact. Start from the
          // preceding sample so the pushed body clears the final surface.
          contact = Math.max(0, t - 1 / 32);
          break;
        }
      }
    }
    if (!Number.isFinite(contact)) continue;
    const distance = length * (1 - contact) + 0.012,
      steps = Math.ceil(distance / 0.04);
    for (let n = 0; n < steps; n++) {
      const step = distance / steps / length,
        x = actor.x + d[0] * step,
        y = actor.y + d[1] * step,
        z = actor.z + d[2] * step;
      if (
        offsets.some(([dx, dz]) => {
          const cell = worldToAxial(x + dx, z + dz);
          return (
            !world.loaded(cell.q, cell.r) ||
            world.columnSolid(
              x + dx,
              z + dz,
              y + 0.005,
              y + height - 0.005,
              ignored,
            )
          );
        })
      ) {
        actor.crushed = true;
        break;
      }
      actor.x = x;
      actor.y = y;
      actor.z = z;
    }
  }
}
