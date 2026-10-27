import { DIRECTIONS, hash, hexDistance, key } from './core.js';

const columnKey = (q, r) => `${q},${r}`;
// Seed-only plans are shared by stamping, loot and the spawner. No neighbouring
// chunk is queried, so streaming order cannot change the tunnels or rewards.
export function mineshaftPlan(world, s) {
  const turn = Math.floor(hash(s.q, 941, s.r, world.seed) * 6),
    paths = [];
  const line = (q, r, dir, length, rise = 0) =>
    Array.from({ length: length + 1 }, (_, i) => ({
      q: q + DIRECTIONS[dir][0] * i,
      r: r + DIRECTIONS[dir][1] * i,
      floor: s.y + Math.min(rise, Math.max(0, i - 1)),
    }));
  for (let arm = 0; arm < 3; arm++) {
    const dir = (turn + arm * 2) % 6,
      length = 12 + Math.floor(hash(s.q, 943 + arm, s.r, world.seed) * 5);
    let points = line(s.q, s.r, dir, length);
    const end = points.findIndex(
      (p, i) => i > 6 && world.terrainHeight(p.q, p.r) < p.floor + 5,
    );
    if (end > 0) points = points.slice(0, end);
    if (points.length < 8) continue;
    paths.push({ dir, points });
    const start = points[Math.min(7, points.length - 2)],
      side = (dir + 1) % 6,
      count = 6 + Math.floor(hash(s.q, 949 + arm, s.r, world.seed) * 3),
      level = line(start.q, start.r, side, count),
      rise =
        arm === 1 &&
        level.every((p) => world.terrainHeight(p.q, p.r) >= s.y + 7)
          ? 2
          : 0;
    const branch = line(start.q, start.r, side, count, rise);
    if (branch.every((p) => world.terrainHeight(p.q, p.r) >= p.floor + 5))
      paths.push({ dir: side, points: branch });
  }
  if (paths.length < 3) return null;
  let entrance = null;
  for (let trial = 0; trial < 3 && !entrance; trial++) {
    const dir = (turn + 1 + trial * 2) % 6;
    for (let distance = 12; distance <= 26; distance++) {
      const [dq, dr] = DIRECTIONS[dir],
        q = s.q + dq * distance,
        r = s.r + dr * distance,
        floor = world.terrainHeight(q, r) - 1;
      if (
        floor < s.y ||
        floor - s.y > distance - 5 ||
        floor < 6 ||
        world.villages(q, r, 8).some((v) => hexDistance(q - v.q, r - v.r) < 12)
      )
        continue;
      const points = line(s.q, s.r, dir, distance).map((p, i) => ({
        ...p,
        floor:
          s.y +
          Math.round(((floor - s.y) * Math.max(0, i - 5)) / (distance - 5)),
      }));
      if (
        points
          .slice(5, -2)
          .some((p) => p.floor >= world.terrainHeight(p.q, p.r))
      )
        continue;
      entrance = points;
      paths.push({ dir, points, entrance: true });
      break;
    }
  }
  if (!entrance) return null;
  const columns = new Map(),
    centers = new Set();
  const add = (q, r, floor, ceiling) => {
    const k = columnKey(q, r),
      old = columns.get(k);
    columns.set(k, {
      q,
      r,
      floor: Math.min(floor, old?.floor ?? Infinity),
      ceiling: Math.max(ceiling, old?.ceiling ?? -Infinity),
    });
  };
  for (let dq = -4; dq <= 4; dq++)
    for (let dr = -4; dr <= 4; dr++)
      if (hexDistance(dq, dr) <= 4) add(s.q + dq, s.r + dr, s.y, s.y + 4);
  for (const path of paths) {
    const [sq, sr] = DIRECTIONS[(path.dir + 2) % 6];
    for (const p of path.points) {
      centers.add(columnKey(p.q, p.r));
      for (let side = -1; side <= 1; side++)
        add(p.q + sq * side, p.r + sr * side, p.floor, p.floor + 3);
    }
  }
  // Intersecting raised branches must never create a two-block step.
  const queue = [...columns.values()];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dq, dr] of DIRECTIONS) {
      const next = columns.get(columnKey(p.q + dq, p.r + dr));
      if (next && next.floor > p.floor + 1) {
        next.floor = p.floor + 1;
        queue.push(next);
      }
    }
  }
  const props = [];
  for (const path of paths) {
    const [sq, sr] = DIRECTIONS[(path.dir + 2) % 6];
    for (let i = 5; i < path.points.length - (path.entrance ? 3 : 0); i += 4) {
      const p = path.points[i],
        floor = columns.get(columnKey(p.q, p.r)).floor;
      for (let side = -1; side <= 1; side++) {
        const q = p.q + sq * side,
          r = p.r + sr * side,
          col = columns.get(columnKey(q, r));
        if (side && !centers.has(columnKey(q, r)))
          for (let y = col.floor + 1; y <= floor + 2; y++)
            props.push({ q, y, r, type: 'fence' });
        props.push({ q, y: floor + 3, r, type: 'planks' });
      }
    }
  }
  const branches = paths.filter((p) => !p.entrance),
    nestPath = branches.at(-1),
    end = nestPath.points.at(-2),
    [nq, nr] = DIRECTIONS[(nestPath.dir + 2) % 6],
    nestQ = end.q + nq,
    nestR = end.r + nr,
    nest = {
      q: nestQ,
      y: columns.get(columnKey(nestQ, nestR)).floor + 1,
      r: nestR,
    };
  const loot = [
    {
      q: s.q + 2,
      y: s.y + 1,
      r: s.r,
      loot: { torch: 12, coal: 5, ingot: 3, bread: 3 },
    },
  ];
  for (const path of branches.filter((_, i) => i % 2 === 1).slice(0, 2)) {
    const p = path.points.at(-1),
      [dq, dr] = DIRECTIONS[(path.dir + 2) % 6],
      q = p.q - dq,
      r = p.r - dr;
    loot.push({
      q,
      y: columns.get(columnKey(q, r)).floor + 1,
      r,
      loot: {
        ingot: 2,
        copperIngot: 5,
        string: 4,
        bread: 2,
        ...(hash(q, 953, r, world.seed) > 0.6
          ? { diamond: 1 }
          : { goldIngot: 2 }),
      },
    });
  }
  const occupied = new Set([
    key(nest.q, nest.y, nest.r),
    ...loot.map((p) => key(p.q, p.y, p.r)),
  ]);
  for (const col of columns.values()) {
    const near = hexDistance(col.q - nest.q, col.r - nest.r) <= 3;
    if (hash(col.q, 955, col.r, world.seed) < (near ? 0.62 : 0.075)) {
      const y = col.floor + (near ? 1 : 3);
      if (!occupied.has(key(col.q, y, col.r)))
        props.push({ q: col.q, y, r: col.r, type: 'cobweb' });
    }
  }
  props.push({ q: s.q - 2, y: s.y + 1, r: s.r + 1, type: 'torch' });
  return { columns, paths, entrance, nest, loot, props };
}

export function stampMineshaft(world, s, put) {
  const plan = s.mine;
  for (const p of plan.columns.values()) {
    put(p.q, p.floor, p.r, 'planks');
    for (let y = p.floor + 1; y <= p.ceiling; y++) put(p.q, y, p.r, null);
    if (p.ceiling + 1 < world.terrainHeight(p.q, p.r))
      put(p.q, p.ceiling + 1, p.r, 'stone');
  }
  for (const p of plan.props) put(p.q, p.y, p.r, p.type);
  for (const p of plan.loot) put(p.q, p.y, p.r, 'chest');
  put(plan.nest.q, plan.nest.y, plan.nest.r, 'spawner');
}
