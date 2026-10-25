import { BLOCKS, DIRECTIONS, axialToWorld } from './core.js';

export const HEX_POLYGON = Array.from({ length: 6 }, (_, i) => [
  Math.cos(((i * 60 - 30) * Math.PI) / 180),
  Math.sin(((i * 60 - 30) * Math.PI) / 180),
]);
const forward = (facing) => {
  const p = axialToWorld(...DIRECTIONS[facing || 0]);
  const length = Math.hypot(p.x, p.z);
  return [p.x / length, p.z / length];
};
export function clipHalf(polygon, normal, sign = 1) {
  const clipped = [],
    value = ([x, z]) => (x * normal[0] + z * normal[1]) * sign;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = value(a),
      db = value(b);
    if (da >= -1e-8) clipped.push(a);
    if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
      const t = da / (da - db);
      clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return clipped;
}
export function polygonContains(polygon, x, z) {
  let positive = false,
    negative = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const side = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    positive ||= side > 1e-6;
    negative ||= side < -1e-6;
    if (positive && negative) return false;
  }
  return true;
}
export function cutBlockParts(world, q, y, r) {
  const type = world.get(q, y, r),
    def = BLOCKS[type],
    state = world.state(q, y, r);
  const part = (polygon, low, high) => ({
    polygon,
    x: 0,
    y: (low + high) / 2,
    z: 0,
    h: high - low,
    angle: 0,
    tile: def.base,
  });
  if (def.shape === 'slab')
    return [
      part(
        HEX_POLYGON,
        state.double ? 0 : state.upper ? 0.5 : 0,
        state.double || state.upper ? 1 : 0.5,
      ),
    ];
  const f = forward(state.facing),
    lower = state.upper ? [0.5, 1] : [0, 0.5],
    upper = state.upper ? [0, 0.5] : [0.5, 1];
  const parts = [part(HEX_POLYGON, ...lower)];
  const matching = (direction) => {
    const [dq, dr] = DIRECTIONS[direction],
      other = world.get(q + dq, y, r + dr);
    if (BLOCKS[other]?.shape !== 'stairs') return null;
    const adjacent = world.state(q + dq, y, r + dr);
    const turn = ((adjacent.facing || 0) - (state.facing || 0) + 6) % 6;
    return !!adjacent.upper === !!state.upper && turn !== 0 && turn !== 3
      ? forward(adjacent.facing)
      : null;
  };
  const front = matching(state.facing || 0),
    back = matching(((state.facing || 0) + 3) % 6);
  if (front)
    parts.push(part(clipHalf(clipHalf(HEX_POLYGON, f), front), ...upper));
  else {
    parts.push(part(clipHalf(HEX_POLYGON, f), ...upper));
    if (back)
      parts.push(part(clipHalf(clipHalf(HEX_POLYGON, f, -1), back), ...upper));
  }
  return parts.filter((p) => p.polygon.length >= 3);
}

export function cutItemWorld(type, facing = 0) {
  return {
    get: (q, y, r) => (q === 0 && y === 0 && r === 0 ? type : null),
    state: () => ({ facing, open: false }),
  };
}
