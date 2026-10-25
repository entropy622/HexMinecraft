import { BLOCKS, DIRECTIONS, axialToWorld } from './core.js';
import { cutBlockParts, polygonContains, HEX_POLYGON } from './cut-blocks.js';
import { isChorus } from './chorus-data.js';

export function facingAngle(facing) {
  const d = DIRECTIONS[facing] || DIRECTIONS[0],
    p = axialToWorld(...d);
  return Math.atan2(p.x, p.z);
}
export function facingFromDirection(x, z) {
  let best = 0,
    score = -Infinity;
  DIRECTIONS.forEach((d, i) => {
    const p = axialToWorld(...d),
      dot = p.x * x + p.z * z;
    if (dot > score) {
      score = dot;
      best = i;
    }
  });
  return best;
}
export function buildingParts(world, q, y, r, collision = false) {
  const type = world.get(q, y, r),
    state = world.state(q, y, r);
  const shape = BLOCKS[type]?.shape,
    angle = facingAngle(state.facing);
  const planks = BLOCKS[type]?.planks || 'planks';
  if (shape === 'slab' || shape === 'stairs')
    return cutBlockParts(world, q, y, r);
  if (shape === 'egg')
    return [
      [0.05, 0.28, 0.38],
      [0.28, 0.7, 0.48],
      [0.7, 0.91, 0.33],
      [0.91, 1, 0.16],
    ].map(([low, high, radius]) => ({
      x: 0,
      y: (low + high) / 2,
      z: 0,
      h: high - low,
      angle: 0,
      tile: type,
      polygon: HEX_POLYGON.map(([x, z]) => [x * radius, z * radius]),
    }));
  const parts = [];
  if (shape === 'chorus' || shape === 'chorusFlower') {
    const flower = shape === 'chorusFlower';
    parts.push({
      x: 0,
      y: flower ? 0.52 : 0.5,
      z: 0,
      h: flower ? 0.76 : 1,
      angle: 0,
      tile: type,
      polygon: HEX_POLYGON.map(([x, z]) => [
        x * (flower ? 0.43 : 0.23),
        z * (flower ? 0.43 : 0.23),
      ]),
    });
    if (flower)
      parts.push({
        x: 0,
        y: 0.1,
        z: 0,
        h: 0.2,
        angle: 0,
        tile: 'chorusPlant',
        polygon: HEX_POLYGON.map(([x, z]) => [x * 0.17, z * 0.17]),
      });
    DIRECTIONS.forEach(([dq, dr]) => {
      if (!isChorus(world.get(q + dq, y, r + dr))) return;
      const p = axialToWorld(dq, dr);
      parts.push({
        x: p.x / 4,
        y: 0.5,
        z: p.z / 4,
        w: 0.32,
        h: 0.32,
        d: Math.sqrt(3) / 2 + 0.05,
        angle: Math.atan2(p.x, p.z),
        tile: 'chorusPlant',
      });
    });
    return parts;
  }
  if (shape === 'rod')
    return [
      {
        x: 0,
        y: 0.055,
        z: 0,
        h: 0.11,
        angle: 0,
        tile: 'purpur',
        polygon: HEX_POLYGON.map(([x, z]) => [x * 0.19, z * 0.19]),
      },
      {
        x: 0,
        y: 0.48,
        z: 0,
        h: 0.78,
        angle: 0,
        tile: 'endRod',
        polygon: HEX_POLYGON.map(([x, z]) => [x * 0.065, z * 0.065]),
      },
    ];
  if (shape === 'gateway')
    return collision
      ? []
      : [
          {
            x: 0,
            y: 0.8,
            z: 0,
            h: 1.4,
            angle: 0,
            tile: 'endportal',
            polygon: HEX_POLYGON.map(([x, z]) => [x * 0.5, z * 0.5]),
          },
        ];
  const add = (x, cy, z, w, h, d, turn = 0, tile = planks) => {
    parts.push({
      x: x * Math.cos(angle) + z * Math.sin(angle),
      y: cy,
      z: -x * Math.sin(angle) + z * Math.cos(angle),
      w,
      h,
      d,
      angle: angle + turn,
      tile,
    });
  };
  if (shape === 'door') {
    add(
      state.open ? -0.75 : 0,
      0.5,
      state.open ? 0.75 : 0,
      1.5,
      1,
      0.12,
      state.open ? -Math.PI / 2 : 0,
      type,
    );
  } else if (shape === 'gate') {
    add(-0.78, 0.75, 0, 0.16, 1.5, 0.18);
    add(0.78, 0.75, 0, 0.16, 1.5, 0.18);
    const x = state.open ? -0.69 : 0,
      z = state.open ? 0.69 : 0,
      turn = state.open ? -Math.PI / 2 : 0;
    if (collision) add(x, 0.75, z, 1.38, 1.5, 0.15, turn);
    else for (const h of [0.55, 1.13]) add(x, h, z, 1.38, 0.2, 0.14, turn);
  } else if (shape === 'fence') {
    // Fence parts use world axes so each arm follows an axial neighbor exactly.
    parts.push({
      x: 0,
      y: 0.75,
      z: 0,
      w: 0.22,
      h: 1.5,
      d: 0.22,
      angle: 0,
      tile: planks,
    });
    DIRECTIONS.forEach(([dq, dr]) => {
      const neighbor = world.get(q + dq, y, r + dr);
      if (
        !neighbor ||
        BLOCKS[neighbor]?.nonSolid ||
        (BLOCKS[neighbor]?.shape &&
          !['fence', 'gate'].includes(BLOCKS[neighbor].shape) &&
          !(
            BLOCKS[neighbor].shape === 'slab' &&
            world.state(q + dq, y, r + dr).double
          ))
      )
        return;
      const p = axialToWorld(dq, dr),
        a = Math.atan2(p.x, p.z);
      for (const h of collision ? [0.75] : [0.55, 1.13])
        parts.push({
          x: p.x / 4,
          y: h,
          z: p.z / 4,
          w: 0.14,
          h: collision ? 1.5 : 0.18,
          d: Math.sqrt(3) / 2 + 0.04,
          angle: a,
          tile: planks,
        });
    });
  } else if (shape === 'ladder' && !collision) {
    for (const x of [-0.34, 0.34]) add(x, 0.5, 0.8, 0.1, 1, 0.1);
    for (const h of [0.15, 0.38, 0.62, 0.85]) add(0, h, 0.77, 0.76, 0.08, 0.12);
  }
  return parts;
}
export function insidePart(x, y, z, part) {
  if (part.polygon)
    return (
      Math.abs(y - part.y) < part.h / 2 &&
      polygonContains(part.polygon, x - part.x, z - part.z)
    );
  const dx = x - part.x,
    dz = z - part.z;
  const px = dx * Math.cos(part.angle) - dz * Math.sin(part.angle);
  const pz = dx * Math.sin(part.angle) + dz * Math.cos(part.angle);
  return (
    Math.abs(px) < part.w / 2 &&
    Math.abs(y - part.y) < part.h / 2 &&
    Math.abs(pz) < part.d / 2
  );
}
