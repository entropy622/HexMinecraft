import { DIRECTIONS, axialToWorld } from './core.js';
import { isRail } from './rail-data.js';
const opposite = (i) => (i + 3) % 6;
export function railNeighbor(w, [q, y, r], dir) {
  const [a, b] = DIRECTIONS[dir];
  for (const dy of [0, 1, -1])
    if (isRail(w.get(q + a, y + dy, r + b))) return [q + a, y + dy, r + b];
  return null;
}
const straight = (dir) => [dir, opposite(dir)];
export function ports(w, p) {
  const s = w.state(...p);
  return s.track || straight((s.facing || 0) % 6);
}
const angle = (a, b) => Math.min((6 + a - b) % 6, (6 + b - a) % 6);
const legal = (type, a, b) =>
  a !== b && (angle(a, b) === 3 || (type === 'rail' && angle(a, b) === 2));
function live(w, p, d) {
  const n = railNeighbor(w, p, d);
  return n && ports(w, n).includes(opposite(d));
}
export function planTrack(w, p, type, facing = 0) {
  const old = ports(w, p),
    taken = isRail(w.get(...p)) ? old.filter((d) => live(w, p, d)) : [];
  const candidates = DIRECTIONS.map((_, d) => {
    const n = railNeighbor(w, p, d);
    if (!n) return false;
    const back = opposite(d),
      assigned = ports(w, n);
    if (assigned.includes(back)) return true;
    const occupied = assigned.filter((i) => live(w, n, i));
    return (
      !occupied.length ||
      (occupied.length === 1 && legal(w.get(...n), back, occupied[0]))
    );
  });
  let best = straight(facing),
    score = -Infinity;
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++) {
      if (!legal(type, a, b) || !taken.every((x) => x === a || x === b))
        continue;
      const v =
        100 * (+candidates[a] + +candidates[b]) +
        8 * (angle(a, b) === 3) +
        16 * (a === facing || b === facing) +
        (old.includes(a) && old.includes(b) ? 1 : 0);
      if (v > score) {
        score = v;
        best = [a, b];
      }
    }
  return best;
}
export function connectTrack(w, p, pair) {
  const changes = [p];
  for (const d of pair) {
    const n = railNeighbor(w, p, d);
    if (!n) continue;
    const next = planTrack(w, n, w.get(...n), opposite(d));
    if (!next.every((x) => ports(w, n).includes(x))) {
      w.setState(...n, { ...w.state(...n), track: next });
      changes.push(n);
    }
  }
  return changes;
}
// Sample one shared centreline for the rails, preview, wheels and rider.
export function railPoint(w, p, pair, t) {
  const end = (d) => {
    const v = axialToWorld(...DIRECTIONS[d]),
      n = railNeighbor(w, p, d);
    return [v.x * 0.5, n ? Math.max(n[1] - p[1], 0) : 0, v.z * 0.5];
  };
  const a = end(pair[0]),
    b = end(pair[1]),
    u = 1 - t;
  return [
    u * u * a[0] + t * t * b[0],
    u * a[1] + t * b[1] + 0.08,
    u * u * a[2] + t * t * b[2],
  ];
}
export function trackParts(w, p) {
  const pair = ports(w, p),
    type = w.get(...p),
    metal = type === 'poweredRail' ? 'rawGoldBlock' : 'ironBlock',
    parts = [];
  const beam = (a, b, width, height, tile) => {
    const dx = b[0] - a[0],
      dz = b[2] - a[2];
    return {
      x: (a[0] + b[0]) / 2,
      y: (a[1] + b[1]) / 2,
      z: (a[2] + b[2]) / 2,
      w: width,
      h: height,
      d: Math.hypot(dx, dz) + 0.015,
      angle: Math.atan2(dx, dz),
      tile,
    };
  };
  const edge = (t, side) => {
    const a = railPoint(w, p, pair, t),
      b = railPoint(w, p, pair, t + 0.001),
      dx = b[0] - a[0],
      dz = b[2] - a[2],
      l = Math.hypot(dx, dz);
    return [a[0] + (side * dz) / l, a[1], a[2] - (side * dx) / l];
  };
  for (let i = 0; i < 6; i++) {
    for (const side of [-0.29, 0.29])
      parts.push(
        beam(edge(i / 6, side), edge((i + 1) / 6, side), 0.08, 0.09, metal),
      );
    if (i % 2 === 1) {
      const a = edge(i / 6, -0.43),
        b = edge(i / 6, 0.43);
      a[1] -= 0.045;
      b[1] -= 0.045;
      parts.push(
        beam(a, b, 0.13, 0.065, type === 'detectorRail' ? 'stone' : 'planks'),
      );
    }
  }
  return parts;
}
