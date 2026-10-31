import { BLOCKS, DIRECTIONS, hash, hexDistance, key } from './core.js';
import { VINE_UP, vineFaces } from './vine-data.js';

// null is an unloaded column, not a missing wall. Leaves can support vines.
export function vineSupport(world, q, y, r, face) {
  const [dq, dr] = face < 6 ? DIRECTIONS[face] : [0, 0];
  q += dq;
  r += dr;
  y += face === 6 ? 1 : 0;
  if (!world.loaded(q, r)) return null;
  const block = BLOCKS[world.get(q, y, r)];
  if (!block || block.nonSolid) return false;
  if (!block.shape || ['dropper', 'observer'].includes(block.shape))
    return true;
  const state = world.state(q, y, r);
  return (
    (block.shape === 'piston' && !state.open) ||
    (['slab', 'stairs'].includes(block.shape) &&
      (state.double || (face === 6 && !state.upper)))
  );
}

export function supportedVineFaces(world, q, y, r, faces) {
  if (world.fluids.get(q, y, r)) return 0;
  const above =
    world.get(q, y + 1, r) === 'vine'
      ? vineFaces(world.state(q, y + 1, r)) & 63
      : 0;
  let result = 0;
  for (let side = 0; side < 7; side++) {
    const bit = 1 << side;
    if (!(faces & bit)) continue;
    if (vineSupport(world, q, y, r, side) !== false || above & bit)
      result |= bit;
  }
  return result;
}

export function setVineFaces(world, q, y, r, faces) {
  if (
    !Number.isInteger(faces) ||
    faces < 1 ||
    faces > 127 ||
    y < 1 ||
    y >= world.maxY - 1 ||
    !world.loaded(q, r)
  )
    return false;
  const old = world.get(q, y, r);
  if ((old && old !== 'vine') || world.fluids.get(q, y, r)) return false;
  const previous = old === 'vine' ? vineFaces(world.state(q, y, r)) : 0;
  if (previous === faces) return false;
  // Natural state changes become normal edits so unloading cannot regrow them.
  world.set(q, y, r, 'vine');
  world.setState(q, y, r, { facing: 0, open: false, faces });
  return true;
}

export function placeVine(world, q, y, r, face) {
  if (!Number.isInteger(face) || face < 0 || face > 6) return false;
  const inherited =
    face < 6 &&
    world.get(q, y + 1, r) === 'vine' &&
    vineFaces(world.state(q, y + 1, r)) & (1 << face);
  if (!vineSupport(world, q, y, r, face) && !inherited) return false;
  const faces =
    world.get(q, y, r) === 'vine' ? vineFaces(world.state(q, y, r)) : 0;
  return setVineFaces(world, q, y, r, faces | (1 << face));
}

function canSpread(world, q, y, r) {
  let count = 0;
  for (let dq = -4; dq <= 4; dq++)
    for (let dr = -4; dr <= 4; dr++) {
      if (hexDistance(dq, dr) > 4) continue;
      if (!world.loaded(q + dq, r + dr)) return false;
      for (let h = y - 1; h <= y + 1; h++)
        if (world.get(q + dq, h, r + dr) === 'vine' && ++count >= 5)
          return false;
    }
  return true;
}

// Java VineBlock's spreading choices, adapted from four sides to six. Downward
// inheritance is not density-limited; horizontal and upward expansion are.
export function spreadVine(world, q, y, r, direction, random = Math.random) {
  if (world.get(q, y, r) !== 'vine') return [];
  const faces = vineFaces(world.state(q, y, r)),
    changed = [];
  const put = (a, b, c, mask) => {
    if (setVineFaces(world, a, b, c, mask)) changed.push({ q: a, y: b, r: c });
  };
  if (direction < 6 && !(faces & (1 << direction))) {
    if (!canSpread(world, q, y, r)) return changed;
    const [dq, dr] = DIRECTIONS[direction],
      a = q + dq,
      c = r + dr;
    if (!world.loaded(a, c)) return changed;
    if (!world.get(a, y, c) && !world.fluids.get(a, y, c)) {
      for (const turn of [-1, 1]) {
        const side = (direction + turn + 6) % 6;
        if (!(faces & (1 << side))) continue;
        if (vineSupport(world, a, y, c, side)) {
          put(a, y, c, 1 << side);
          return changed;
        }
        const [sq, sr] = DIRECTIONS[side],
          cornerQ = a + sq,
          cornerR = c + sr,
          back = (direction + 3) % 6;
        if (vineSupport(world, cornerQ, y, cornerR, back)) {
          put(cornerQ, y, cornerR, 1 << back);
          return changed;
        }
      }
      if (random() < 0.05 && vineSupport(world, a, y, c, 6))
        put(a, y, c, VINE_UP);
    } else if (vineSupport(world, q, y, r, direction))
      put(q, y, r, faces | (1 << direction));
    return changed;
  }
  if (direction === 6 && y < world.maxY - 2) {
    if (vineSupport(world, q, y, r, 6)) {
      put(q, y, r, faces | VINE_UP);
      return changed;
    }
    if (!world.get(q, y + 1, r) && !world.fluids.get(q, y + 1, r)) {
      if (!canSpread(world, q, y, r)) return changed;
      let next = 0;
      for (let side = 0; side < 6; side++)
        if (
          faces & (1 << side) &&
          random() < 0.5 &&
          vineSupport(world, q, y + 1, r, side)
        )
          next |= 1 << side;
      put(q, y + 1, r, next);
      return changed;
    }
  }
  if (y <= 1) return changed;
  const below = world.get(q, y - 1, r);
  if (below && below !== 'vine') return changed;
  let next = below ? vineFaces(world.state(q, y - 1, r)) : 0;
  for (let side = 0; side < 6; side++)
    if (faces & (1 << side) && random() < 0.5) next |= 1 << side;
  put(q, y - 1, r, next);
  return changed;
}

export function tickVines(world, dt, random = Math.random) {
  const changed = [],
    cells = [...world.vineCells]
      .map((k) => k.split(',').map(Number))
      .sort((a, b) => b[1] - a[1]),
    chance = -Math.expm1((-Math.max(0, dt) * 15) / 4096);
  for (const [q, y, r] of cells) {
    if (world.get(q, y, r) !== 'vine') continue;
    const old = vineFaces(world.state(q, y, r)),
      next = supportedVineFaces(world, q, y, r, old);
    if (!next) {
      world.set(q, y, r, null);
      changed.push({ q, y, r });
      continue;
    }
    if (next !== old && setVineFaces(world, q, y, r, next))
      changed.push({ q, y, r });
    if (chance > 0 && random() < chance)
      changed.push(
        ...spreadVine(world, q, y, r, Math.floor(random() * 8), random),
      );
  }
  return { changed, drops: [] };
}

// Candidates come from a complete tree, never from whichever neighbor chunk
// happened to load first. This adds one cell to the ordinary jungle crown halo.
export function treeVines(cells, q, base, r, seed) {
  const occupied = new Set(cells.map((c) => key(...c.slice(0, 3)))),
    result = new Map();
  const put = (a, y, c, side, anchor = false) => {
    if (y < base || y >= 63 || occupied.has(key(a, y, c))) return false;
    const k = key(a, y, c),
      previous = result.get(k);
    result.set(k, [
      a,
      y,
      c,
      (previous?.[3] || 0) | (1 << side),
      (previous?.[4] || 0) | (anchor ? 1 << side : 0),
    ]);
    return true;
  };
  for (const [a, y, c, type] of cells) {
    if (type !== 'jungleWood' && type !== 'jungleLeaves') continue;
    DIRECTIONS.forEach(([dq, dr], side) => {
      const chance = type === 'jungleWood' ? 2 / 3 : 0.25;
      if (hash(a, y + side * 53, c, seed + 1301) >= chance) return;
      const support = (side + 3) % 6;
      if (!put(a + dq, y, c + dr, support, true) || type !== 'jungleLeaves')
        return;
      for (let drop = 1; drop <= 4; drop++)
        if (!put(a + dq, y - drop, c + dr, support)) break;
    });
  }
  return [...result.values()].sort((a, b) => b[1] - a[1]);
}

export function decorateJungleTree(
  world,
  cells,
  q,
  base,
  r,
  occupied = () => false,
) {
  const changed = [];
  for (const [a, y, c, faces, anchors] of treeVines(
    cells,
    q,
    base,
    r,
    world.seed,
  )) {
    if (occupied(a, y, c)) continue;
    const old = world.get(a, y, c),
      previous = old === 'vine' ? vineFaces(world.state(a, y, c)) : 0;
    const inherited =
        world.get(a, y + 1, c) === 'vine'
          ? vineFaces(world.state(a, y + 1, c)) & faces & 63
          : 0,
      supported = supportedVineFaces(
        world,
        a,
        y,
        c,
        previous | anchors | inherited,
      );
    if (setVineFaces(world, a, y, c, supported)) changed.push([a, y, c]);
  }
  return changed;
}
