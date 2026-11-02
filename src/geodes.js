import { hash, noise, hexDistance, key, DIRECTIONS } from './core.js';
import { AMETHYST_STAGES } from './amethyst-data.js';

const SPACING = 32,
  REACH = 10;
const caches = new WeakMap();
export const amethystOffset = (face) =>
  face < 6
    ? [DIRECTIONS[face][0], 0, DIRECTIONS[face][1]]
    : [0, face === 6 ? 1 : -1, 0];

function descriptor(world, a, b) {
  let cache = caches.get(world);
  if (!cache) caches.set(world, (cache = new Map()));
  const k = `${a},${b}`;
  if (cache.has(k)) return cache.get(k);
  let result = null;
  if (hash(a, 1320, b, world.seed) < 2 / 3) {
    const q = a * SPACING + 8 + Math.floor(hash(a, 1321, b, world.seed) * 16),
      r = b * SPACING + 8 + Math.floor(hash(a, 1322, b, world.seed) * 16);
    let surface = world.terrainHeight(q, r);
    for (const [dq, dr] of DIRECTIONS)
      surface = Math.min(surface, world.terrainHeight(q + dq * 8, r + dr * 8));
    const high = Math.min(23, surface - 7);
    if (
      high >= 6 &&
      hexDistance(q, r) > 24 &&
      !world
        .caves(q, r, 12)
        .some(
          (c) =>
            hexDistance(c.q - q, c.r - r) < c.radius + 10 ||
            c.path.some((p) => hexDistance(p.q - q, p.r - r) < 10),
        ) &&
      !world
        .structures(q, r, 12)
        .some((s) => hexDistance(s.q - q, s.r - r) < 14) &&
      !world.villages(q, r, 16).some((v) => hexDistance(v.q - q, v.r - r) < 18)
    ) {
      const y = 6 + Math.floor(hash(a, 1323, b, world.seed) * (high - 5));
      result = {
        q,
        y,
        r,
        radius: 6,
        crack: hash(a, 1324, b, world.seed) < 0.95,
        direction: Math.floor(hash(a, 1325, b, world.seed) * 6),
        lobes: [
          [0, 0, 0],
          [
            hash(a, 1326, b, world.seed) * 2 - 1,
            0.3,
            hash(a, 1327, b, world.seed) * 2 - 1,
          ],
          [-0.7, -0.5, 0.8],
        ],
      };
    }
  }
  cache.set(k, result);
  if (cache.size > 256) cache.delete(cache.keys().next().value);
  return result;
}

export function geodesNear(world, q, r, range = 0) {
  if (world.dimension !== 'overworld') return [];
  const result = [],
    reach = range + REACH;
  for (
    let a = Math.floor((q - reach) / SPACING);
    a <= Math.floor((q + reach) / SPACING);
    a++
  )
    for (
      let b = Math.floor((r - reach) / SPACING);
      b <= Math.floor((r + reach) / SPACING);
      b++
    ) {
      const geode = descriptor(world, a, b);
      if (geode && hexDistance(geode.q - q, geode.r - r) <= reach)
        result.push(geode);
    }
  return result;
}

// Classify independently of chunk residency or stamping order. Three offset
// lobes and local rock noise keep the layered cavity irregular and continuous.
export function geodeBlock(world, geode, q, y, r) {
  if (y < 1 || y >= world.maxY - 1) return undefined;
  const dq = q - geode.q,
    dr = r - geode.r,
    dy = y - geode.y;
  let distance = Infinity;
  for (const [a, b, c] of geode.lobes) {
    const x = dq - a,
      z = dr - c,
      h = (dy - b) * 1.4;
    distance = Math.min(distance, Math.sqrt(x * x + x * z + z * z + h * h));
  }
  distance +=
    (noise(q * 0.34 + y * 0.19, r * 0.34 - y * 0.13, world.seed + 1328) - 0.5) *
    0.7;
  if (distance > 6) return undefined;
  const [a, b] = DIRECTIONS[geode.direction],
    forward = dq * a + dr * b + 0.5 * (dq * b + dr * a),
    cross = dq * b - dr * a;
  if (geode.crack && forward > 1 && Math.abs(cross) < 0.8 && dy > -1 && dy < 2)
    return null;
  if (distance < 3) return null;
  if (distance < 4)
    return hash(q, y, r, world.seed + 1329) < 0.083
      ? 'buddingAmethyst'
      : 'amethystBlock';
  return distance < 5 ? 'calcite' : 'smoothBasalt';
}

export function stampGeodes(world, cq, cr) {
  for (const geode of geodesNear(world, cq * 8 + 4, cr * 8 + 4, 8))
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++)
        for (let y = Math.max(1, geode.y - 7); y <= geode.y + 7; y++) {
          let type = geodeBlock(world, geode, q, y, r);
          if (type === undefined) continue;
          if (type === null) {
            // Potential placements are selected from actual neighbouring buds,
            // including those in chunks which have not been generated yet.
            for (let face = 0; face < 8; face++) {
              const [a, b, c] = amethystOffset(face);
              if (
                geodeBlock(world, geode, q - a, y - b, r - c) !==
                  'buddingAmethyst' ||
                hash(q, y * 8 + face, r, world.seed + 1330) >= 0.35
              )
                continue;
              type =
                AMETHYST_STAGES[
                  Math.floor(hash(q, y, r, world.seed + 1331) * 4)
                ];
              world.naturalStates.set(key(q, y, r), {
                facing: face,
                open: false,
              });
              world.buildings.add(key(q, y, r));
              world.amethystCells.add(key(q, y, r));
              break;
            }
          }
          if (type) world.blocks.set(key(q, y, r), type);
          else world.blocks.delete(key(q, y, r));
        }
}
