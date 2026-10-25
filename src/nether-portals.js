import { DIRECTIONS, key } from './core.js';
import { LIQUIDS } from './fluids.js';

const LIMIT = 21;
const empty = (world, q, y, r) =>
  world.loaded(q, r) &&
  y > 0 &&
  y < 63 &&
  (!world.get(q, y, r) || world.get(q, y, r) === 'portal') &&
  !world.fluids.get(q, y, r);
export function findNetherFrame(world, q, y, r, selectedAxis = null) {
  if (world.dimension === 'end') return null;
  for (const axis of selectedAxis === null ? [0, 1, 2] : [selectedAxis]) {
    const [dq, dr] = DIRECTIONS[axis];
    let bottom = y,
      leftQ = q,
      leftR = r;
    while (bottom > 1 && y - bottom < LIMIT && empty(world, q, bottom - 1, r))
      bottom--;
    if (world.get(q, bottom - 1, r) !== 'obsidian') continue;
    let back = 0;
    while (back < LIMIT && empty(world, leftQ - dq, bottom, leftR - dr)) {
      leftQ -= dq;
      leftR -= dr;
      back++;
    }
    if (world.get(leftQ - dq, bottom, leftR - dr) !== 'obsidian') continue;
    const at = (x, h) => [leftQ + dq * x, bottom + h, leftR + dr * x];
    let width = 0;
    while (width < LIMIT && empty(world, ...at(width, 0))) width++;
    if (width < 2 || world.get(...at(width, 0)) !== 'obsidian') continue;
    if (
      !Array.from({ length: width }, (_, x) => world.get(...at(x, -1))).every(
        (t) => t === 'obsidian',
      )
    )
      continue;
    for (let height = 0; height <= LIMIT; height++) {
      const row = Array.from({ length: width }, (_, x) => at(x, height));
      if (row.every((p) => world.get(...p) === 'obsidian')) {
        if (height >= 3 && y < bottom + height)
          return {
            q: leftQ,
            y: bottom,
            r: leftR,
            axis,
            width,
            height,
            cells: Array.from({ length: width * height }, (_, i) =>
              at(i % width, Math.floor(i / width)),
            ),
          };
        break;
      }
      if (
        world.get(...at(-1, height)) !== 'obsidian' ||
        world.get(...at(width, height)) !== 'obsidian' ||
        !row.every((p) => empty(world, ...p))
      )
        break;
    }
  }
  return null;
}
export function lightNetherFrame(world, frame) {
  for (const [q, y, r] of frame.cells) {
    world.set(q, y, r, 'portal');
    world.setState(q, y, r, { facing: frame.axis, open: false });
  }
  return frame.cells;
}
// Validate complete connected sheets. An unloaded boundary is deferred; it is
// never interpreted as a missing obsidian wall during world streaming.
export function maintainNetherPortals(world) {
  const visited = new Set(),
    changed = [];
  for (const start of world.portalCells) {
    if (visited.has(start)) continue;
    const first = start.split(',').map(Number);
    const axis = world.state(...first).facing % 3,
      [dq, dr] = DIRECTIONS[axis];
    const queue = [first],
      cells = [];
    let unloaded = false;
    visited.add(start);
    for (let i = 0; i < queue.length; i++) {
      const [q, y, r] = queue[i];
      cells.push(queue[i]);
      for (const [a, b, c] of [
        [q + dq, y, r + dr],
        [q - dq, y, r - dr],
        [q, y - 1, r],
        [q, y + 1, r],
      ]) {
        if (!world.loaded(a, c)) {
          unloaded = true;
          continue;
        }
        const k = key(a, b, c);
        if (
          !visited.has(k) &&
          world.get(a, b, c) === 'portal' &&
          world.state(a, b, c).facing % 3 === axis
        ) {
          visited.add(k);
          queue.push([a, b, c]);
        }
      }
    }
    if (unloaded) continue;
    const frame = findNetherFrame(world, ...first, axis);
    const intact =
      frame &&
      frame.cells.length === cells.length &&
      frame.cells.every(
        ([q, y, r]) =>
          world.get(q, y, r) === 'portal' &&
          world.state(q, y, r).facing % 3 === axis &&
          !DIRECTIONS.some(
            ([a, b]) =>
              LIQUIDS[world.fluids.get(q + a, y, r + b)?.type]?.coolant,
          ),
      );
    if (intact) continue;
    for (const cell of cells) {
      world.set(...cell, null);
      changed.push(cell);
    }
  }
  return changed;
}
export function buildArrivalPortal(world, q, y, r, axis = 0) {
  const [dq, dr] = DIRECTIONS[axis];
  for (let x = -1; x <= 2; x++)
    for (let h = -1; h <= 3; h++) {
      const border = x === -1 || x === 2 || h === -1 || h === 3;
      world.fluids.write(q + x * dq, y + h, r + x * dr, null);
      world.set(q + x * dq, y + h, r + x * dr, border ? 'obsidian' : null);
    }
  const frame = findNetherFrame(world, q, y, r, axis);
  return frame ? lightNetherFrame(world, frame) : [];
}
