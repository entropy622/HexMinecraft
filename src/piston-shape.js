import { axialToWorld, DIRECTIONS } from './core.js';
import { HEX_POLYGON, clipHalf } from './cut-blocks.js';

export function pistonParts(type, state, collision) {
  const head = type.endsWith('Head'),
    sticky = type.startsWith('sticky'),
    facing = state.facing || 0,
    vertical = facing >= 6,
    up = facing === 7,
    p = vertical ? { x: 0, z: 0 } : axialToWorld(...DIRECTIONS[facing]),
    length = Math.hypot(p.x, p.z) || 1,
    x = p.x / length,
    z = p.z / length,
    angle = vertical ? 0 : Math.atan2(x, z),
    face = sticky ? 'stickyPistonHead' : 'pistonHead';
  const prism = (y, h, tile) => ({
    x: 0,
    y,
    z: 0,
    h,
    angle: 0,
    polygon: HEX_POLYGON,
    tile,
  });
  const box = (distance, y, w, h, d, tile) => ({
    x: x * distance,
    y,
    z: z * distance,
    w,
    h,
    d,
    angle,
    tile,
  });
  if (head) {
    if (vertical)
      return [
        prism(up ? 0.875 : 0.125, 0.25, face),
        {
          x: 0,
          y: up ? 0.375 : 0.625,
          z: 0,
          w: 0.25,
          h: 0.75,
          d: 0.25,
          angle: 0,
          tile: 'pistonRod',
        },
      ];
    return [
      {
        ...prism(0.5, 1, face),
        polygon: clipHalf(HEX_POLYGON, [x, z], 1, 0.58),
      },
      box(-0.13, 0.5, 0.25, 0.25, 1.5, 'pistonRod'),
    ];
  }
  if (!state.open) {
    const parts = [prism(0.5, 1, 'piston')];
    if (!collision)
      parts.push(
        vertical
          ? prism(up ? 0.992 : 0.008, 0.016, face)
          : box(0.87, 0.5, 0.99, 0.92, 0.016, face),
      );
    return parts;
  }
  if (vertical)
    return [
      prism(up ? 0.375 : 0.625, 0.75, 'piston'),
      {
        x: 0,
        y: up ? 0.875 : 0.125,
        z: 0,
        w: 0.25,
        h: 0.25,
        d: 0.25,
        angle: 0,
        tile: 'pistonRod',
      },
    ];
  // Clip the leading quarter from the hexagonal casing, keeping its side edges.
  const polygon = clipHalf(HEX_POLYGON, [x, z], -1, -0.43);
  return [
    { ...prism(0.5, 1, 'piston'), polygon },
    box(0.65, 0.5, 0.25, 0.25, 0.5, 'pistonRod'),
  ];
}
