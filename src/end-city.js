import { DIRECTIONS, ITEMS, hash, hexDistance, key } from './core.js';
import { stampEndShip } from './end-ship.js';

const stairRing = [
  [2, 0],
  [1, 1],
  [0, 2],
  [-1, 2],
  [-2, 2],
  [-2, 1],
  [-2, 0],
  [-1, -1],
  [0, -2],
  [1, -2],
  [2, -2],
  [2, -1],
];

export function endCityPlan(world, s) {
  const first = s.id === 'endcity-first',
    rotation = Math.min(5, Math.floor(hash(s.q, 443, s.r, world.seed) * 6)),
    directions = first
      ? [0, 1, 5]
      : [rotation, (rotation + 2) % 6, (rotation + 4) % 6],
    wings = directions
      .slice(0, first || hash(s.q, 527, s.r, world.seed) > 0.35 ? 3 : 2)
      .map((direction, i) => ({
        direction,
        q: DIRECTIONS[direction][0] * 11,
        r: DIRECTIONS[direction][1] * 11,
        base: 6,
        roof: i === 0 ? 24 : 18,
      }));
  // First city's western bridge leads to the already registered first ship.
  // Other cities sometimes add a ship along a free eastern or western branch.
  const shipDirection = wings.some((t) => t.direction === 0) ? 3 : 0;
  const ship =
    !first && hash(s.q, 613, s.r, world.seed) > 0.5
      ? {
          kind: 'endship',
          q: s.q + (shipDirection === 0 ? 25 : -25),
          r: s.r,
          y: s.y + 9,
          h: s.h,
        }
      : null;
  return { first, wings, ship, shipDirection };
}

export function stampEndCity(world, s, put) {
  const block = (q, y, r, type, state = null) => {
    const x = s.q + q,
      z = s.r + r,
      h = s.y + y;
    if (!put(x, h, z, type)) return;
    const k = key(x, h, z);
    if (state) world.naturalStates.set(k, { facing: 0, open: false, ...state });
    else world.naturalStates.delete(k);
  };
  const door = (tower, direction, floor) => {
    const [dq, dr] = DIRECTIONS[direction];
    for (let y = floor + 1; y <= floor + 3; y++)
      block(tower.q + dq * 3, y, tower.r + dr * 3, null);
  };
  const tower = (t) => {
    for (let q = -3; q <= 3; q++)
      for (let r = -3; r <= 3; r++) {
        const distance = hexDistance(q, r);
        if (distance > 3) continue;
        const x = t.q + q,
          z = t.r + r;
        if (distance <= 1) {
          for (
            let y = Math.max(1, world.terrainHeight(s.q + x, s.r + z));
            y < s.y + t.base;
            y++
          )
            put(s.q + x, y, s.r + z, 'purpurPillar');
        }
        for (let y = t.base; y <= t.roof; y++) {
          const floor = (y - t.base) % 6 === 0;
          const corner = DIRECTIONS.some(
            ([dq, dr]) => q === dq * 3 && r === dr * 3,
          );
          const band = (y - t.base) % 6;
          const type = floor
            ? 'purpur'
            : distance === 3
              ? corner
                ? 'purpurPillar'
                : band >= 2 && band <= 4
                  ? 'glass'
                  : 'endstoneBricks'
              : q === 0 && r === 0
                ? 'purpurPillar'
                : null;
          block(x, y, z, type);
        }
      }
    for (let floor = t.base; floor < t.roof - 6; floor += 6) {
      // Cut headroom through the next floor before inserting the last six
      // half-steps. The top step meets the next floor at exactly the same Y.
      for (let i = 6; i < 12; i++) {
        const [q, r] = stairRing[i];
        block(t.q + q, floor + 6, t.r + r, null);
      }
      stairRing.forEach(([q, r], i) =>
        block(t.q + q, floor + 1 + Math.floor(i / 2), t.r + r, 'purpurSlab', {
          upper: i % 2 === 1,
        }),
      );
    }
    // A narrow service shaft gives a continuous route alongside the exposed
    // spiral steps. Its central support stays solid through every floor.
    for (let y = t.base + 1; y < t.roof; y++)
      block(t.q, y, t.r - 1, 'ladder', { facing: 1 });
    for (let layer = 0; layer < 4; layer++) {
      const radius = 4 - layer;
      for (let q = -radius; q <= radius; q++)
        for (let r = -radius; r <= radius; r++) {
          const d = hexDistance(q, r);
          if (d > radius) continue;
          block(
            t.q + q,
            t.roof + layer,
            t.r + r,
            d === radius ? 'purpurSlab' : 'purpur',
          );
        }
    }
    for (let floor = t.base; floor < t.roof; floor += 6)
      block(t.q - 1, floor + 1, t.r, 'endRod');
    for (const [q, r] of DIRECTIONS)
      block(t.q + q * 4, t.roof + 1, t.r + r * 4, 'endRod');
  };
  const bridge = (direction, start, end) => {
    const [dq, dr] = DIRECTIONS[direction],
      [sq, sr] = DIRECTIONS[(direction + 2) % 6];
    for (let d = start; d <= end; d++)
      for (let side = -1; side <= 1; side++) {
        const q = dq * d + sq * side,
          r = dr * d + sr * side;
        block(q, 12, r, 'purpur');
        for (let y = 13; y <= 15; y++) block(q, y, r, null);
        if (side) block(q, 13, r, 'purpurSlab');
        if (side && d % 4 === 0) block(q, 14, r, 'endRod');
      }
  };
  const main = { q: 0, r: 0, base: 0, roof: 24 };
  tower(main);
  for (const wing of s.city.wings) tower(wing);
  door(main, 3, 0);
  block(-4, 0, 0, 'purpurSlab');
  for (const wing of s.city.wings) {
    bridge(wing.direction, 3, 8);
    door(wing, (wing.direction + 3) % 6, 12);
  }
  if (s.city.first) bridge(3, 3, 12);
  if (s.city.ship) {
    stampEndShip(world, s.city.ship, put);
    bridge(s.city.shipDirection, 3, 19);
  }
  for (const loot of endCityLoot(world, s))
    put(loot.q, loot.y, loot.r, 'chest');
}

export function endCityLoot(world, s) {
  const towers = [{ q: 0, r: 0, roof: 24 }, ...s.city.wings];
  const gear = ['pick4', 'axe4', 'diamondChest', 'diamondFeet'];
  const chests = towers.map((t, i) => {
    const item =
      gear[
        Math.min(
          gear.length - 1,
          Math.floor(hash(s.q, i + 752, s.r, world.seed) * gear.length),
        )
      ];
    const armor = !!ITEMS[item].armorSlot;
    return {
      q: s.q + t.q + 1,
      y: s.y + t.roof - 5,
      r: s.r + t.r,
      loot: {
        diamond: 2 + Math.floor(hash(s.q, i + 123, s.r, world.seed) * 4),
        goldIngot: 4 + i * 2,
        emerald: 2 + i,
        fireworkRocket: 6 + i * 3,
      },
      stacks: [
        {
          item,
          count: 1,
          wear: {
            value: ITEMS[item].durability,
            enchant: {
              unbreaking: 2,
              [armor ? 'protection' : 'efficiency']: 3,
            },
          },
        },
      ],
    };
  });
  if (s.city.ship)
    chests.push({
      q: s.city.ship.q - 2,
      y: s.city.ship.y + 4,
      r: s.city.ship.r,
      loot: {
        elytra: 1,
        fireworkRocket: 24,
        phantomMembrane: 3,
        diamond: 2,
        goldenApple: 2,
      },
    });
  return chests;
}

export function endCityGuards(s) {
  const spots = [
    { q: 0, y: 1, r: 1 },
    { q: 0, y: 7, r: 1 },
    { q: 0, y: 19, r: 1 },
    ...s.city.wings.map((t) => ({ q: t.q, y: t.roof - 5, r: t.r + 1 })),
  ];
  const guards = spots.map((p) => ({
    q: s.q + p.q,
    y: s.y + p.y,
    r: s.r + p.r,
    kind: 'shulker',
  }));
  if (s.city.ship)
    for (const [q, r] of [
      [-4, 1],
      [4, 0],
    ])
      guards.push({
        q: s.city.ship.q + q,
        y: s.city.ship.y + 4,
        r: s.city.ship.r + r,
        kind: 'shulker',
      });
  return guards;
}
