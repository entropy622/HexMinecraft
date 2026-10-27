import { worldToAxial } from './core.js';

const angles = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 3);
export const WEB_STRANDS = [
  ...angles.map((a) => [
    [0, 0],
    [Math.cos(a) * 1.4, Math.sin(a) * 1.4],
  ]),
  ...[0.42, 0.82].map((radius) =>
    [...angles, Math.PI * 2].map((a) => [
      Math.cos(a) * radius,
      Math.sin(a) * radius,
    ]),
  ),
];

export function touchesWeb(world, x, feet, z, height, radius) {
  for (const [dx, dz] of [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ]) {
    const a = worldToAxial(x + dx, z + dz);
    for (
      let y = Math.floor(feet + 0.01);
      y <= Math.floor(feet + height - 0.01);
      y++
    )
      if (world.get(a.q, y, a.r) === 'cobweb') return true;
  }
  return false;
}
export function cobwebParts(collision) {
  if (collision) return [];
  return [Math.PI / 4, (Math.PI * 3) / 4].map((angle) => ({
    x: 0,
    y: 0.5,
    z: 0,
    w: 1.65,
    h: 1,
    d: 0.012,
    angle,
    tile: 'cobweb',
    shade: 0.65,
    uvFull: true,
  }));
}
