import { BLOCKS, DIRECTIONS, hash, hexDistance, key } from './core.js';
import { FIRST_END_SHIP } from './flight-data.js';
import { stampEndShip } from './end-ship.js';
import { FIRST_END_CITY } from './end-city-data.js';
import {
  endCityPlan,
  stampEndCity,
  endCityLoot,
  endCityGuards,
} from './end-city.js';

export const STRUCTURE_NAMES = {
  ruin: '古老瞭望塔',
  mine: '废弃矿道',
  dungeon: '苔石地牢',
  fortress: '余烬堡垒',
  shrine: '末地遗址',
  endship: '末地船',
  endcity: '末地城',
};
function descriptor(world, id, q, r, kind) {
  const h = world.terrainHeight(q, r);
  if (
    h < 7 ||
    (world.dimension === 'overworld' &&
      world.villages(q, r, 30).some((v) => hexDistance(v.q - q, v.r - r) < 32))
  )
    return null;
  const underground = kind === 'mine' || kind === 'dungeon';
  const result = {
    id,
    q,
    r,
    h,
    y: kind === 'endship' ? h + 10 : underground ? Math.max(3, h - 7) : h,
    kind,
    radius: underground
      ? 30
      : kind === 'fortress'
        ? 15
        : kind === 'endcity'
          ? 34
          : kind === 'endship'
            ? 12
            : 8,
    material:
      kind === 'fortress'
        ? 'netherbrick'
        : kind === 'shrine' || kind === 'endship' || kind === 'endcity'
          ? 'purpur'
          : world.biome(q, r) === '沙漠'
            ? 'sandstone'
            : 'mossybrick',
  };
  if (kind === 'endcity') result.city = endCityPlan(world, result);
  return result;
}
export function structuresNear(world, q, r, range = 32) {
  world.structureCache ||= new Map();
  const result = [],
    seen = new Set();
  const get = (id, x, z, kind) => {
    if (!world.structureCache.has(id))
      world.structureCache.set(id, descriptor(world, id, x, z, kind));
    const s = world.structureCache.get(id);
    if (
      s &&
      !seen.has(id) &&
      hexDistance(q - s.q, r - s.r) <= range + s.radius
    ) {
      seen.add(id);
      result.push(s);
    }
  };
  if (world.dimension === 'overworld') {
    get('starter-ruin', -18, 14, 'ruin');
    get('starter-mine', -32, -16, 'mine');
  }
  if (world.dimension === 'end') {
    get('endship-first', FIRST_END_SHIP.q, FIRST_END_SHIP.r, 'endship');
    get('endcity-first', FIRST_END_CITY.q, FIRST_END_CITY.r, 'endcity');
  }
  const reach = Math.ceil((range + 32) / 96);
  for (let x = Math.floor(q / 96) - reach; x <= Math.floor(q / 96) + reach; x++)
    for (
      let z = Math.floor(r / 96) - reach;
      z <= Math.floor(r / 96) + reach;
      z++
    ) {
      const id = world.dimension + ':' + x + ',' + z;
      if (!world.structureCache.has(id)) {
        const a = x * 96 + 24 + Math.floor(hash(x, 734, z, world.seed) * 30),
          b = z * 96 + 24 + Math.floor(hash(x, 426, z, world.seed) * 30);
        const empty =
          hash(x, 891, z, world.seed) < 0.23 ||
          (world.dimension === 'end' &&
            (hexDistance(a - FIRST_END_CITY.q, b - FIRST_END_CITY.r) < 58 ||
              hexDistance(a - FIRST_END_SHIP.q, b - FIRST_END_SHIP.r) < 40 ||
              hexDistance(a, b) < 32)) ||
          (world.dimension === 'overworld' &&
            (hexDistance(a + 18, b - 14) < 48 ||
              hexDistance(a + 32, b + 16) < 48 ||
              hexDistance(a, b) < 20));
        if (empty) {
          world.structureCache.set(id, null);
          continue;
        }
        const kind =
          world.dimension === 'nether'
            ? 'fortress'
            : world.dimension === 'end'
              ? hash(x, 913, z, world.seed) > 0.3
                ? 'endcity'
                : hash(x, 915, z, world.seed) > 0.5
                  ? 'endship'
                  : 'shrine'
              : ['ruin', 'mine', 'dungeon'][
                  Math.floor(hash(x, 157, z, world.seed) * 3)
                ];
        get(id, a, b, kind);
      } else {
        const s = world.structureCache.get(id);
        if (s && hexDistance(q - s.q, r - s.r) <= range + s.radius)
          result.push(s);
      }
    }
  // Descriptors are cheap to recreate; discovery/loot state is stored separately.
  if (world.structureCache.size > 512) {
    for (const [id, s] of world.structureCache)
      if (!s || hexDistance(s.q - q, s.r - r) > 240)
        world.structureCache.delete(id);
  }
  return result;
}
export function structureLoot(world, s) {
  if (s.kind === 'endcity') return endCityLoot(world, s);
  if (s.kind === 'endship')
    return [
      {
        q: s.q - 2,
        y: s.y + 4,
        r: s.r,
        loot: {
          elytra: 1,
          fireworkRocket: 24,
          phantomMembrane: 3,
          diamond: 2,
          goldenApple: 2,
          book: 1,
        },
      },
    ];
  const roll = hash(s.q, 663, s.r, world.seed);
  const supplies =
    s.kind === 'mine'
      ? { torch: 12, coal: 5, ingot: 3, bread: 3, copperIngot: 5, flint: 3 }
      : s.kind === 'dungeon'
        ? { goldIngot: 4, arrow: 12, bone: 3, emerald: 2 }
        : s.kind === 'fortress'
          ? {
              goldIngot: 6,
              ember: 2,
              obsidian: 3,
              sword: 1,
              blazeRod: 2,
              netherWart: 3,
              soulSand: 4,
            }
          : s.kind === 'shrine'
            ? { pearl: 3, diamond: 2, goldenApple: 1 }
            : { bread: 3, torch: 6, ingot: 2, emerald: 1 };
  if (roll > 0.6) supplies.goldenApple = 1;
  if (roll > 0.83) supplies.diamond = (supplies.diamond || 0) + 1;
  return [
    { q: s.q + 2, y: s.y + 1, r: s.r, loot: supplies },
    ...(s.kind === 'dungeon' || s.kind === 'fortress'
      ? [
          {
            q: s.q - 2,
            y: s.y + 1,
            r: s.r + 1,
            loot: { arrow: 8, bread: 2, goldIngot: 2 },
          },
        ]
      : []),
  ];
}
export function stampStructure(world, s, cq, cr) {
  const put = (q, y, r, type) => {
    if (Math.floor(q / 8) !== cq || Math.floor(r / 8) !== cr || y < 1 || y > 62)
      return false;
    const k = key(q, y, r);
    if (type) world.blocks.set(k, type);
    else world.blocks.delete(k);
    if (type === 'spawner') world.spawners.add(k);
    else world.spawners.delete(k);
    if (BLOCKS[type]?.shape) world.buildings.add(k);
    else world.buildings.delete(k);
    return true;
  };
  if (s.kind === 'endship') {
    stampEndShip(world, s, put);
    return;
  }
  if (s.kind === 'endcity') {
    stampEndCity(world, s, put);
    return;
  }
  const block = (dq, dy, dr, type) => put(s.q + dq, s.y + dy, s.r + dr, type);
  if (!['mine', 'dungeon'].includes(s.kind)) {
    const radius = s.kind === 'fortress' ? 7 : s.kind === 'shrine' ? 5 : 4;
    for (let q = -radius; q <= radius; q++)
      for (let r = -radius; r <= radius; r++) {
        if (hexDistance(q, r) > radius) continue;
        for (
          let y = Math.max(1, world.terrainHeight(s.q + q, s.r + r));
          y < s.y;
          y++
        )
          put(s.q + q, y, s.r + r, s.material);
        for (let y = 1; y <= 8; y++) block(q, y, r, null);
      }
  }
  const room = (radius, height, roof) => {
    for (let q = -radius; q <= radius; q++)
      for (let r = -radius; r <= radius; r++) {
        const d = hexDistance(q, r);
        if (d > radius) continue;
        for (let y = 0; y <= height; y++)
          block(
            q,
            y,
            r,
            y === 0 || (roof && y === height) || d === radius
              ? s.material
              : null,
          );
      }
  };
  if (s.kind === 'mine' || s.kind === 'dungeon') {
    room(5, 5, true);
    if (s.kind === 'mine') {
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = DIRECTIONS[i],
          [sq, sr] = DIRECTIONS[(i + 2) % 6];
        for (let d = 3; d <= 11; d++)
          for (let side = -1; side <= 1; side++) {
            const q = dq * d + sq * side,
              r = dr * d + sr * side;
            block(q, 0, r, 'planks');
            for (let y = 1; y <= 3; y++)
              block(
                q,
                y,
                r,
                d % 4 === 0 && Math.abs(side) === 1 ? 'wood' : null,
              );
            if (d % 4 === 0) block(q, 4, r, 'wood');
          }
      }
      block(-2, 1, 1, 'torch');
      block(0, 1, 3, 'torch');
      block(0, 1, -8, 'spawner');
    } else block(0, 1, 0, 'spawner');
    // A one-block rise per hex column makes a visible, climbable entrance from the surface.
    for (let step = 0; step <= 22; step++) {
      const q = s.q + 5 + step,
        y = s.y + step;
      for (let width = -1; width <= 1; width++) {
        put(q, y, s.r + width, 'planks');
        for (let dy = 1; dy <= 4; dy++) put(q, y + dy, s.r + width, null);
        if (step % 4 === 0 && Math.abs(width) === 1)
          for (let dy = 1; dy <= 3; dy++) put(q, y + dy, s.r + width, 'wood');
      }
      if (step > 2 && y >= world.terrainHeight(q, s.r) + 1) {
        for (const side of [-1, 1]) {
          put(q, y + 1, s.r + side, 'wood');
          put(q, y + 2, s.r + side, 'lantern');
        }
        break;
      }
    }
  } else if (s.kind === 'ruin') {
    room(4, 4, false);
    for (let q = -4; q <= 4; q++)
      for (let r = -4; r <= 4; r++) {
        if (hexDistance(q, r) > 4) continue;
        if (
          hexDistance(q, r) === 4 &&
          hash(s.q + q, 511, s.r + r, world.seed) > 0.48
        )
          for (let y = 2; y <= 4; y++) block(q, y, r, null);
      }
    for (let y = 1; y <= 3; y++) block(4, y, 0, null);
    block(0, 1, 0, 'lantern');
  } else {
    room(s.kind === 'fortress' ? 7 : 5, 1, false);
    const radius = s.kind === 'fortress' ? 7 : 5;
    for (const [dq, dr] of DIRECTIONS) {
      for (let y = 1; y <= 6; y++)
        block(dq * radius, y, dr * radius, s.material);
      block(dq * radius, 7, dr * radius, 'glowstone');
      if (s.kind === 'fortress')
        for (let d = 7; d <= 13; d++) {
          block(dq * d, 0, dr * d, s.material);
          block(dq * d, 1, dr * d, null);
          block(dq * d, 2, dr * d, null);
        }
    }
    if (s.kind === 'fortress') {
      block(0, 1, 0, 'spawner');
      block(-4, 1, 0, 'brewingStand');
      for (const p of structurePlants(s)) put(p.q, p.y, p.r, 'soulSand');
    } else {
      block(0, 1, 0, 'goldBlock');
      block(0, 2, 0, 'lantern');
    }
  }
  for (const chest of structureLoot(world, s))
    put(chest.q, chest.y, chest.r, 'chest');
}
export function structurePlants(s) {
  return s.kind === 'fortress'
    ? [
        [-3, -2],
        [-2, -3],
        [-1, -3],
      ].map(([dq, dr]) => ({
        q: s.q + dq,
        y: s.y,
        r: s.r + dr,
        kind: 'netherWart',
      }))
    : [];
}
export function structureGuards(s) {
  if (s.kind === 'endcity') return endCityGuards(s);
  const spots =
    s.kind === 'endship'
      ? [
          [-4, 4, 1],
          [4, 4, 0],
        ]
      : s.kind === 'shrine'
        ? [
            [-2, 1, 0],
            [1, 1, -2],
          ]
        : [];
  return spots.map(([q, y, r]) => ({
    q: s.q + q,
    y: s.y + y,
    r: s.r + r,
    kind: 'shulker',
  }));
}
