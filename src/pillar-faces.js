import { DIRECTIONS, axialToWorld } from './core.js';

const AXES = DIRECTIONS.slice(0, 3).map(([q, r]) => {
  const p = axialToWorld(q, r),
    length = Math.hypot(p.x, p.z);
  return [p.x / length, p.z / length];
});

// Opposite hex faces share a material axis: vertical plus three horizontal
// pairs. The cell stays a hexagonal prism, including collision and selection.
export function pillarAxis(normal) {
  if (!normal || Math.abs(normal.y) > 0.5) return 0;
  let axis = 0,
    best = -Infinity;
  AXES.forEach(([x, z], i) => {
    const score = Math.abs(normal.x * x + normal.z * z);
    if (score > best) {
      axis = i + 1;
      best = score;
    }
  });
  return axis;
}

// A side index is 0..5, the upper/lower caps are -1/-2. Project bark in the
// material's length direction so adjacent horizontal logs form coherent beams.
export function pillarFace(axis, side, vertices) {
  const [dx, dz] = AXES[axis - 1];
  const end = side >= 0 && side % 3 === axis - 1;
  return {
    face: end ? 'top' : 'side',
    uv: vertices.map(([x, y, z]) => {
      const across = -x * dz + z * dx;
      const along = (x * dx + z * dz) / Math.sqrt(3) + 0.5;
      return end
        ? [across + 0.5, y]
        : side < 0
          ? [across / 2 + 0.5, along]
          : [y, along];
    }),
  };
}
export const pillarAxisLabel = (axis = 0) =>
  ['竖直', '东西横放', '西北 / 东南横放', '东北 / 西南横放'][axis];
