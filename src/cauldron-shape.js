import { HEX_POLYGON } from './cut-blocks.js';
import {
  CAULDRON_BLOCKS,
  CAULDRON_FLOOR,
  CAULDRON_INNER,
  cauldronHeight,
} from './cauldron-data.js';

export function cauldronParts(type, collision) {
  const part = (polygon, low, high, tile = 'cauldron') => ({
    x: 0,
    y: (low + high) / 2,
    z: 0,
    h: high - low,
    angle: 0,
    tile,
    polygon,
  });
  const parts = [
    part(
      HEX_POLYGON.map(([x, z]) => [x * 0.94, z * 0.94]),
      0.19,
      CAULDRON_FLOOR,
    ),
  ];
  for (let i = 0; i < 6; i++) {
    const a = HEX_POLYGON[i],
      b = HEX_POLYGON[(i + 1) % 6];
    parts.push(
      part(
        [
          [a[0] * 0.94, a[1] * 0.94],
          [b[0] * 0.94, b[1] * 0.94],
          [b[0] * CAULDRON_INNER, b[1] * CAULDRON_INNER],
          [a[0] * CAULDRON_INNER, a[1] * CAULDRON_INNER],
        ],
        CAULDRON_FLOOR,
        1,
      ),
    );
    parts.push({
      x: a[0] * 0.7,
      y: 0.095,
      z: a[1] * 0.7,
      h: 0.19,
      w: 0.2,
      d: 0.2,
      angle: (i * Math.PI) / 3,
      tile: 'cauldron',
    });
  }
  if (!collision && CAULDRON_BLOCKS[type].cauldronLevel)
    parts.push(
      part(
        HEX_POLYGON.map(([x, z]) => [x * CAULDRON_INNER, z * CAULDRON_INNER]),
        cauldronHeight(type) - 0.015,
        cauldronHeight(type),
        type,
      ),
    );
  return parts;
}
