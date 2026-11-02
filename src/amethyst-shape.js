import { axialToWorld, DIRECTIONS } from './core.js';
import { HEX_POLYGON } from './cut-blocks.js';
import {
  AMETHYST_STAGES,
  AMETHYST_HEIGHTS,
  AMETHYST_WIDTHS,
} from './amethyst-data.js';

export function amethystParts(type, state, collision = false) {
  const stage = AMETHYST_STAGES.indexOf(type),
    length = AMETHYST_HEIGHTS[stage],
    width = AMETHYST_WIDTHS[stage];
  const face = state.facing ?? 6,
    direction = face < 6 ? axialToWorld(...DIRECTIONS[face]) : { x: 0, z: 0 };
  const angle = face < 6 ? Math.atan2(direction.x, direction.z) : 0,
    pitch = face === 6 ? 0 : face === 7 ? Math.PI : Math.PI / 2,
    sx = face < 6 ? direction.x / Math.sqrt(3) : 0,
    sz = face < 6 ? direction.z / Math.sqrt(3) : 0,
    base =
      face < 6
        ? [(-sx * Math.sqrt(3)) / 2, 0.5, (-sz * Math.sqrt(3)) / 2]
        : [0, face === 6 ? 0 : 1, 0];
  const center = (x, y, z) => {
    const py = y * Math.cos(pitch) - z * Math.sin(pitch),
      pz = y * Math.sin(pitch) + z * Math.cos(pitch);
    return {
      x: base[0] + x * Math.cos(angle) + pz * Math.sin(angle),
      y: base[1] + py,
      z: base[2] - x * Math.sin(angle) + pz * Math.cos(angle),
    };
  };
  if (collision)
    return [
      {
        ...center(0, length / 2, 0),
        w: width,
        h: face < 6 ? width : length,
        d: face < 6 ? length : width,
        angle,
        tile: type,
      },
    ];
  const parts = [],
    radius = width / 2;
  for (const [x, z, scale, height] of stage < 2
    ? [[0, 0, 0.65, 1]]
    : [
        [0, 0, 0.55, 1],
        [-radius * 0.5, radius * 0.3, 0.35, 0.72],
        [radius * 0.4, -radius * 0.4, 0.35, 0.8],
      ]) {
    const h = length * height;
    for (const [offset, height, topScale] of [
      [0, h * 0.7, 1],
      [h * 0.7, h * 0.3, 0],
    ])
      parts.push({
        ...center(x, offset + height / 2, z),
        h: height,
        angle,
        pitch,
        polygon: HEX_POLYGON.map(([a, b]) => [
          a * radius * scale,
          b * radius * scale,
        ]),
        topScale,
        uvFull: true,
        tile: type,
      });
  }
  return parts;
}
