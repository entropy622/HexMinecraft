import { HEX_POLYGON } from './cut-blocks.js';

// Six separate tapered walls leave a genuine open mouth for collision and drops.
export function hopperParts(state, angle) {
  const parts = [];
  const ring = (outer, inner, y, h, topScale = 1) => {
    for (let i = 0; i < 6; i++) {
      const a = HEX_POLYGON[i],
        b = HEX_POLYGON[(i + 1) % 6];
      parts.push({
        x: 0,
        y,
        z: 0,
        h,
        angle: 0,
        tile: 'hopper',
        topScale,
        polygon: [
          [a[0] * outer, a[1] * outer],
          [b[0] * outer, b[1] * outer],
          [b[0] * inner, b[1] * inner],
          [a[0] * inner, a[1] * inner],
        ],
      });
    }
  };
  ring(0.94, 0.72, 0.925, 0.15);
  ring(0.28, 0.2, 0.6, 0.5, 3);
  parts.push({
    x: 0,
    y: 0.325,
    z: 0,
    h: 0.05,
    angle: 0,
    tile: 'hopper',
    shade: 0.45,
    polygon: HEX_POLYGON.map(([x, z]) => [x * 0.28, z * 0.28]),
  });
  if (state.down !== false)
    parts.push({
      x: 0,
      y: 0.15,
      z: 0,
      h: 0.3,
      angle: 0,
      tile: 'hopper',
      polygon: HEX_POLYGON.map(([x, z]) => [x * 0.17, z * 0.17]),
    });
  else
    parts.push({
      x: Math.sin(angle) * 0.42,
      y: 0.23,
      z: Math.cos(angle) * 0.42,
      w: 0.28,
      h: 0.28,
      d: 0.85,
      angle,
      tile: 'hopper',
    });
  return parts;
}
