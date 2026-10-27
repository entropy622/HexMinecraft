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
  if (type === 'repeater' || type === 'comparator') {
    const direction = axialToWorld(...DIRECTIONS[state.facing || 0]),
      angle = Math.atan2(direction.x, direction.z),
      tile = (type === 'comparator' ? state.output > 0 : state.powered)
        ? 'redstoneWireOn'
        : 'redstoneWire',
      rear = -0.12 - ((state.delay || 1) - 1) * 0.12;
    const parts = [
      hex(0.82, 0.125, 'smoothStone'),
      { x: 0, y: 0.14, z: 0, w: 0.07, h: 0.025, d: 1.05, angle: 0, tile },
      {
        x: 0,
        y: 0.15,
        z: 0.55,
        h: 0.03,
        angle: 0,
        tile,
        polygon: [
          [-0.18, -0.14],
          [0.18, -0.14],
          [0, 0.18],
        ],
      },
    ];
    const post = (x, z, h, on) => {
      parts.push(
        {
          x,
          y: 0.125 + h / 2,
          z,
          w: 0.08,
          h,
          d: 0.08,
          angle: 0,
          tile: 'planks',
        },
        {
          x,
          y: 0.125 + h,
          z,
          w: 0.16,
          h: 0.1,
          d: 0.16,
          angle: 0,
          tile: on ? 'redstoneWireOn' : 'redstoneWire',
        },
      );
    };
    if (type === 'comparator') {
      post(-0.28, -0.32, 0.22, state.output > 0);
      post(0.28, -0.32, 0.22, state.output > 0);
      post(0, 0.38, state.subtract ? 0.25 : 0.15, !!state.subtract);
    } else {
      post(0, 0.38, 0.245, !!state.powered);
      if (world.redstone?.locked(q, y, r))
        parts.push({
          x: 0,
          y: 0.25,
          z: rear,
          w: 0.65,
          h: 0.12,
          d: 0.12,
          angle: 0,
          tile: 'basalt',
        });
      else post(0, rear, 0.205, !!state.powered);
    }
    return parts.map((part) => ({
      ...part,
      x: part.x * Math.cos(angle) + part.z * Math.sin(angle),
      z: -part.x * Math.sin(angle) + part.z * Math.cos(angle),
      angle,
    }));
  }
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
      const facing = DIRECTIONS[world.state(q + dq, y, r + dr).facing || 0],
        diode =
          neighbor === 'comparator' ||
          (neighbor === 'repeater' &&
            ((facing[0] === dq && facing[1] === dr) ||
              (facing[0] === -dq && facing[1] === -dr)));
      if (
        !next &&
        !diode &&
        ![
          'lever',
          'stoneButton',
          'stonePressurePlate',
          'redstoneLamp',
          'redstoneTorch',
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
    type === 'redstoneTorch'
      ? [
          {
            x: 0,
            y: 0.25,
            z: 0,
            w: 0.13,
            h: 0.5,
            d: 0.13,
            angle: 0,
            tile: 'planks',
          },
          {
            ...hex(
              0.15,
              0.15,
              state.powered === false ? 'redstoneWire' : 'redstoneWireOn',
            ),
            y: 0.55,
          },
        ]
      : type === 'lever'
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
    if (type === 'redstoneTorch')
      return {
        ...part,
        x: nx * (0.86 - part.y * 0.5),
        z: nz * (0.86 - part.y * 0.5),
        y: 0.15 + (part.y * Math.sqrt(3)) / 2,
        pitch: -Math.PI / 6,
        angle,
      };
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
