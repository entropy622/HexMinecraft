import { BLOCKS, DIRECTIONS, axialToWorld } from './core.js';
import { HEX_POLYGON } from './cut-blocks.js';

export function redstoneParts(world, q, y, r, collision) {
  if (collision) return [];
  const type = world.get(q, y, r),
    state = world.state(q, y, r);
  const hex = (radius, h, tile) => ({
    x: 0,
    y: h / 2,
    z: 0,
    h,
    angle: 0,
    tile,
    polygon: HEX_POLYGON.map(([x, z]) => [x * radius, z * radius]),
  });
  if (type === 'stonePressurePlate')
    return [hex(0.72, state.powered ? 0.025 : 0.065, 'stone')];
  if (type === 'redstoneWire') {
    const level = world.redstone?.power(q, y, r) || 0;
    const tile = level ? 'redstoneWireOn' : 'redstoneWire';
    const parts = [hex(0.2, 0.025, tile)];
    for (const [dq, dr] of DIRECTIONS) {
      const p = axialToWorld(dq, dr),
        angle = Math.atan2(p.x, p.z);
      const next = world.redstone
        ?.connections(q, y, r)
        .find(([a, , c]) => a === q + dq && c === r + dr);
      const neighbor = world.get(q + dq, y, r + dr);
      if (
        !next &&
        ![
          'lever',
          'stoneButton',
          'stonePressurePlate',
          'redstoneLamp',
        ].includes(neighbor) &&
        !['door', 'gate', 'trapdoor'].includes(BLOCKS[neighbor]?.shape)
      )
        continue;
      parts.push({
        x: p.x / 4,
        y: 0.015,
        z: p.z / 4,
        w: 0.12,
        h: 0.025,
        d: 0.9,
        angle,
        tile,
      });
      if (next && next[1] > y)
        parts.push({
          x: p.x / 2.02,
          y: 0.51,
          z: p.z / 2.02,
          w: 0.12,
          h: 1,
          d: 0.025,
          angle,
          tile,
        });
    }
    return parts.map((part) => ({
      ...part,
      shade: level ? 0.58 + level * 0.028 : 0.8,
    }));
  }
  const parts =
    type === 'lever'
      ? [
          hex(0.3, 0.14, 'cobble'),
          {
            x: 0,
            y: 0.35,
            z: state.powered ? -0.13 : 0.13,
            w: 0.12,
            h: 0.52,
            d: 0.12,
            angle: 0,
            pitch: state.powered ? -0.55 : 0.55,
            tile: 'planks',
          },
        ]
      : [hex(0.24, state.powered ? 0.055 : 0.14, 'stone')];
  const direction = axialToWorld(...DIRECTIONS[state.facing || 0]);
  const angle = Math.atan2(direction.x, direction.z),
    nx = Math.sin(angle),
    nz = Math.cos(angle);
  return parts.map((part) => {
    if (state.mount === 'ceiling')
      return {
        ...part,
        y: 1 - part.y,
        z: -part.z,
        pitch: (part.pitch || 0) + Math.PI,
      };
    if (state.mount !== 'wall') return part;
    return {
      ...part,
      x: part.x * Math.cos(angle) - part.y * nx + nx * 0.86,
      y: 0.5 + part.z,
      z: -part.x * Math.sin(angle) - part.y * nz + nz * 0.86,
      pitch: (part.pitch || 0) - Math.PI / 2,
      angle,
    };
  });
}
