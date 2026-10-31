import { DIRECTIONS, axialToWorld } from './core.js';
import { VINE_UP, vineFaces } from './vine-data.js';
import { HEX_POLYGON } from './cut-blocks.js';

export function vineParts(state, collision = false) {
  if (collision) return [];
  const faces = vineFaces(state),
    parts = [];
  DIRECTIONS.forEach(([q, r], side) => {
    if (!(faces & (1 << side))) return;
    const p = axialToWorld(q, r),
      angle = Math.atan2(p.x, p.z),
      offset = Math.sqrt(3) / 2 - 1 / 32;
    parts.push({
      x: Math.sin(angle) * offset,
      y: 0.5,
      z: Math.cos(angle) * offset,
      w: 1,
      h: 1,
      d: 1 / 128,
      plane: true,
      angle,
      tile: 'vine',
    });
  });
  if (faces & VINE_UP)
    parts.push({
      x: 0,
      y: 1 - 1 / 32,
      z: 0,
      h: 1 / 128,
      polygon: HEX_POLYGON,
      plane: true,
      angle: 0,
      tile: 'vine',
      uvFull: true,
    });
  return parts;
}
