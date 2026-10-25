import { worldToAxial } from './core.js';

// Body clearance and floor support use the same partial-block shapes as the
// renderer. The highest support under any foot sample permits edge stepping.
export function findFloor(
  world,
  x,
  z,
  reference,
  { step = 0.6, drop = 3, height = 1.8, radius = 0.24, wet = false } = {},
) {
  const offsets = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ];
  let floor = null;
  for (const [dx, dz] of offsets) {
    const a = worldToAxial(x + dx, z + dz);
    if (!world.loaded(a.q, a.r)) return null;
    const support = world.groundAt(
      x + dx,
      z + dz,
      reference - drop,
      reference + step,
    );
    if (support !== null) floor = Math.max(floor ?? -Infinity, support);
  }
  if (floor === null || floor < 1 || floor > 63) return null;
  for (const [dx, dz] of offsets) {
    const a = worldToAxial(x + dx, z + dz);
    if (!wet && world.fluids.get(a.q, Math.floor(floor), a.r)) return null;
    if (
      world.columnSolid(x + dx, z + dz, floor + 0.025, floor + height - 0.025)
    )
      return null;
  }
  return floor;
}
