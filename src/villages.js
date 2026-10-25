import {
  ITEMS,
  DIRECTIONS,
  hash,
  hexDistance,
  key,
  axialToWorld,
} from './core.js';
import { facingFromDirection } from './building-shapes.js';
import { villagePalette } from './village-palette.js';
import { doorUpper } from './building-data.js';
import { pillarAxis } from './pillar-faces.js';
export const VILLAGE_RADIUS = 12;
const houses = [
  [7, 0, 'smith'],
  [-7, 0, 'merchant'],
  [0, 7, 'home'],
  [0, -7, 'home'],
];
export const ROLES = {
  fisher: {
    name: '渔夫',
    color: '#6b9ba5',
    home: [0, 6],
    work: [3, 4],
    trades: [
      { cost: { emerald: 2 }, give: { fishingRod: 1 } },
      { cost: { rawCod: 10 }, give: { emerald: 1 } },
      { cost: { rawSalmon: 8 }, give: { emerald: 1 } },
      { cost: { tropicalFish: 4 }, give: { emerald: 1 } },
      { cost: { emerald: 1 }, give: { cookedCod: 4 } },
      { cost: { emerald: 2 }, give: { pufferFish: 1 } },
    ],
  },
  farmer: {
    name: '农夫',
    color: '#8d9c4a',
    home: [0, -6],
    work: [-4, 3],
    trades: [
      { cost: { wheat: 12 }, give: { emerald: 1 } },
      { cost: { emerald: 1 }, give: { bread: 5 } },
      { cost: { egg: 8 }, give: { emerald: 1 } },
      { cost: { leather: 6 }, give: { emerald: 1 } },
      { cost: { emerald: 1 }, give: { carrot: 4 } },
      { cost: { emerald: 1 }, give: { potato: 4 } },
      { cost: { emerald: 1 }, give: { sugarCane: 3 } },
      { cost: { carrot: 12 }, give: { emerald: 1 } },
      { cost: { potato: 12 }, give: { emerald: 1 } },
    ],
  },
  smith: {
    name: '铁匠',
    color: '#656477',
    home: [6, 0],
    work: [4, 0],
    trades: [
      { cost: { coal: 12 }, give: { emerald: 1 } },
      { cost: { emerald: 3 }, give: { bucket: 1 } },
      { cost: { emerald: 6 }, give: { ingot: 4 } },
      { cost: { emerald: 5 }, give: { sword: 1 } },
      { cost: { emerald: 8 }, give: { ironChest: 1 } },
      { cost: { emerald: 3 }, give: { flintAndSteel: 1 } },
    ],
  },
  merchant: {
    name: '杂货商',
    color: '#ae7857',
    home: [-6, 0],
    work: [-3, 0],
    trades: [
      { cost: { wood: 16 }, give: { emerald: 1 } },
      { cost: { emerald: 1 }, give: { apple: 5 } },
      { cost: { emerald: 2 }, give: { lantern: 3 } },
      { cost: { emerald: 1 }, give: { arrow: 16 } },
      { cost: { emerald: 1 }, give: { melonSeed: 3 } },
      { cost: { emerald: 2 }, give: { slimeBall: 3 } },
      { cost: { birchWood: 16 }, give: { emerald: 1 } },
      { cost: { spruceWood: 16 }, give: { emerald: 1 } },
    ],
  },
};
export function villagesNear(world, q, r, range = 32) {
  if (world.dimension !== 'overworld') return [];
  const result = [],
    starterQ = 24;
  const add = (id, x, z) => {
    if (
      hexDistance(x - q, z - r) > range + 19 ||
      world.villageExclusions?.has(id)
    )
      return;
    const h = Math.max(9, Math.min(23, world.naturalHeight(x, z)));
    result.push({
      id,
      q: x,
      r: z,
      h,
      name:
        id === 'starter'
          ? '晨谷村'
          : ['麦穗村', '松风村', '石泉村', '琥珀村'][
              Math.floor(hash(x, 413, z, world.seed) * 4)
            ],
      palette: villagePalette(world.biome(x, z)),
    });
  };
  add('starter', starterQ, 0);
  const reach = Math.ceil((range + 40) / 96);
  for (let a = Math.floor(q / 96) - reach; a <= Math.floor(q / 96) + reach; a++)
    for (
      let b = Math.floor(r / 96) - reach;
      b <= Math.floor(r / 96) + reach;
      b++
    ) {
      if (hash(a, 991, b, world.seed) < 0.38) continue;
      const x = a * 96 + 32 + Math.floor(hash(a, 31, b, world.seed) * 28),
        z = b * 96 + 32 + Math.floor(hash(a, 41, b, world.seed) * 28);
      if (hexDistance(x - starterQ, z) < 50 || world.naturalHeight(x, z) < 7)
        continue;
      add(`${a}:${b}`, x, z);
    }
  return result;
}
export function villageAt(world, q, r, padding = 0) {
  return villagesNear(world, q, r, padding).find(
    (v) => hexDistance(q - v.q, r - v.r) <= VILLAGE_RADIUS + padding,
  );
}
export function features(v) {
  const crops = [],
    water = [{ q: v.q, y: v.h - 1, r: v.r }],
    chests = [];
  for (const [x, z] of [
    [-5, 6],
    [5, -6],
  ])
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        if (hexDistance(a, b) <= 2) {
          const p = { q: v.q + x + a, y: v.h - 1, r: v.r + z + b };
          if (!a && !b) water.push(p);
          else
            crops.push({
              ...p,
              kind: x < 0 ? 'wheat' : a < 0 ? 'carrot' : 'potato',
            });
        }
  for (const [x, z, role] of houses)
    chests.push({
      q: v.q + x,
      y: v.h,
      r: v.r + z + 1,
      loot:
        role === 'smith'
          ? { coal: 4, rawIron: 2 }
          : role === 'merchant'
            ? { apple: 3, seed: 4, [v.palette.sapling]: 2, sugarCane: 3 }
            : { wheat: 3, bread: 2 },
    });
  for (let a = -2; a <= 2; a++)
    for (let b = -2; b <= 2; b++)
      if (hexDistance(a, b) <= 2)
        for (const depth of [1, 2])
          water.push({ q: v.q + 5 + a, y: v.h - depth, r: v.r + 5 + b });
  return { crops, water, chests };
}
export function stampVillage(world, v, cq, cr) {
  const palette = v.palette;
  const put = (q, y, r, t) => {
    if (
      q < cq * 8 ||
      q >= cq * 8 + 8 ||
      r < cr * 8 ||
      r >= cr * 8 + 8 ||
      y < 1 ||
      y >= 64
    )
      return;
    world.set(q, y, r, t, false);
  };
  for (let q = cq * 8; q < cq * 8 + 8; q++)
    for (let r = cr * 8; r < cr * 8 + 8; r++) {
      const x = q - v.q,
        z = r - v.r,
        d = hexDistance(x, z);
      if (d > 12) continue;
      for (let y = v.h; y < v.h + 9; y++) put(q, y, r, null);
      if (d <= 3 || Math.abs(x) <= 0 || Math.abs(z) <= 0)
        put(q, v.h - 1, r, palette.foundation);
      for (const [hx, hz, role] of houses) {
        const a = x - hx,
          b = z - hz,
          dist = hexDistance(a, b);
        if (dist > 3) continue;
        if (dist <= 2) {
          put(q, v.h - 1, r, palette.planks);
          const dir = DIRECTIONS.reduce(
            (best, t) =>
              hexDistance(hx + t[0] * 2, hz + t[1] * 2) <
              hexDistance(hx + best[0] * 2, hz + best[1] * 2)
                ? t
                : best,
            DIRECTIONS[0],
          );
          const door = a === dir[0] * 2 && b === dir[1] * 2;
          if (door) {
            world.naturalStates.set(key(q, v.h, r), {
              facing: DIRECTIONS.indexOf(dir),
              open: false,
            });
            const outward = axialToWorld(...dir);
            world.naturalStates.set(key(q, v.h + 2, r), {
              facing: 0,
              open: false,
              axis: pillarAxis({ x: -outward.z, y: 0, z: outward.x }),
            });
          }
          if (dist === 2)
            for (let y = 0; y < 3; y++)
              put(
                q,
                v.h + y,
                r,
                door && y < 2
                  ? y === 0
                    ? palette.door
                    : doorUpper(palette.door)
                  : y === 1 && (a === 0 || b === 0)
                    ? 'glass'
                    : a === 0 || b === 0 || a + b === 0
                      ? palette.log
                      : palette.wall,
              );
          if (!a && !b)
            put(
              q,
              v.h,
              r,
              role === 'smith'
                ? 'furnace'
                : role === 'merchant'
                  ? 'workbench'
                  : 'bed',
            );
          if (role === 'smith' && a === 1 && (b === 0 || b === -1))
            put(q, v.h, r, b === 0 ? 'chippedAnvil' : 'grindstone');
        }
        const roof = palette.roof;
        for (let layer = 0; layer < 3; layer++) {
          if (dist > 3 - layer) continue;
          const edge = dist === 3 - layer;
          put(q, v.h + 3 + layer, r, edge ? roof + 'Stairs' : roof);
          if (edge) {
            const inward = axialToWorld(-a, -b);
            world.naturalStates.set(key(q, v.h + 3 + layer, r), {
              facing: facingFromDirection(inward.x, inward.z),
              open: false,
              upper: false,
              double: false,
            });
          }
        }
        if (!a && !b) put(q, v.h + 6, r, roof + 'Slab');
      }
      // A covered communal well, with a reachable water cell below the rim.
      if (d === 1) put(q, v.h, r, palette.foundation);
      if (d === 0) {
        put(q, v.h - 1, r, null);
        put(q, v.h - 2, r, palette.foundation);
        put(q, v.h + 2, r, 'lantern');
      }
      if (
        [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ].some(([a, b]) => x === a && z === b)
      )
        for (let y = 0; y < 3; y++) put(q, v.h + y, r, palette.log);
      if (d <= 2) put(q, v.h + 3, r, palette.roof + 'Slab');
    }
  const f = features(v);
  for (const p of f.crops) put(p.q, p.y, p.r, 'farmland');
  for (const p of f.water) {
    put(p.q, p.y, p.r, null);
    put(p.q, p.y - 1, p.r, palette.foundation);
  }
  // Seal the pond at the edge of the village without replacing house floors.
  for (let a = -3; a <= 3; a++)
    for (let b = -3; b <= 3; b++)
      if (hexDistance(a, b) === 3)
        for (const depth of [1, 2]) {
          const q = v.q + 5 + a,
            r = v.r + 5 + b,
            y = v.h - depth;
          if (!world.get(q, y, r)) put(q, y, r, palette.foundation);
        }
  for (const p of f.chests) put(p.q, p.y, p.r, 'chest');
  put(v.q - 3, v.h, v.r + 2, 'hayBale');
  put(v.q - 3, v.h + 1, v.r + 2, 'campfire');
  for (const [x, z] of [
    [4, -4],
    [-4, 4],
    [3, 3],
    [-4, -4],
  ]) {
    put(v.q + x, v.h, v.r + z, palette.log);
    put(v.q + x, v.h + 1, v.r + z, 'lantern');
  }
}
export function trade(
  world,
  villager,
  index,
  inventory,
  time,
  creative = false,
) {
  const offer = ROLES[villager.role]?.trades[index];
  if (
    !offer ||
    Object.entries(offer.give).some(
      ([id, n]) => ITEMS[id]?.durability && (inventory[id] || 0) + n > 256,
    )
  )
    return false;
  const id = `${villager.village.id}/${villager.role}/${index}`,
    day = Math.floor(time / 600),
    old = world.villageTrades.get(id),
    used = old?.day === day ? old.used : 0;
  if (
    !creative &&
    (used >= 4 ||
      Object.entries(offer.cost).some(([id, n]) => (inventory[id] || 0) < n))
  )
    return false;
  if (!creative) {
    for (const [id, n] of Object.entries(offer.cost)) inventory[id] -= n;
    world.villageTrades.set(id, { day, used: used + 1 });
  }
  for (const [id, n] of Object.entries(offer.give))
    inventory[id] = (inventory[id] || 0) + n;
  return true;
}
