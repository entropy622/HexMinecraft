import { isCaveVine } from './cave-data.js';
import { HEX_POLYGON } from './cut-blocks.js';

export function cavePlantParts(world, q, y, r, collision) {
  if (collision) return [];
  const type = world.get(q, y, r),
    parts = [];
  if (isCaveVine(type)) {
    parts.push({
      x: 0,
      y: 0.5,
      z: 0,
      w: 0.065,
      h: 1,
      d: 0.065,
      angle: 0.3,
      tile: 'caveVines',
    });
    for (let i = 0; i < 4; i++) {
      const a = i * 2.4 + y * 0.7;
      parts.push({
        x: Math.sin(a) * 0.17,
        y: 0.18 + i * 0.22,
        z: Math.cos(a) * 0.17,
        w: 0.28,
        h: 0.06,
        d: 0.17,
        angle: a,
        tile: 'caveVines',
      });
    }
    if (type === 'caveVinesBerries')
      for (const [x, z] of [
        [-0.14, 0.04],
        [0.14, -0.02],
      ])
        parts.push({
          x,
          y: 0.28 + x * 0.5,
          z,
          h: 0.2,
          angle: 0,
          tile: 'glowBerry',
          polygon: HEX_POLYGON.map(([a, b]) => [a * 0.115, b * 0.115]),
        });
    return parts;
  }
  parts.push({
    x: 0,
    y: 0.88,
    z: 0,
    w: 0.1,
    h: 0.24,
    d: 0.1,
    angle: 0,
    tile: 'caveVines',
  });
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    parts.push({
      x: Math.sin(a) * 0.28,
      y: 0.73,
      z: Math.cos(a) * 0.28,
      h: 0.07,
      angle: a,
      tile: 'sporeBlossom',
      polygon: [
        [-0.05, -0.12],
        [0.05, -0.12],
        [0.15, 0.1],
        [0, 0.37],
        [-0.15, 0.1],
      ],
    });
  }
  parts.push({
    x: 0,
    y: 0.66,
    z: 0,
    h: 0.12,
    angle: 0,
    tile: 'sporeCenter',
    polygon: HEX_POLYGON.map(([a, b]) => [a * 0.12, b * 0.12]),
  });
  return parts;
}
