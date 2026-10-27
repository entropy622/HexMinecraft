import { axialToWorld, worldToAxial } from './core.js';
import { HEX_POLYGON, polygonContains } from './cut-blocks.js';
import { ceilingSupport } from './cave-plants.js';
import { pointedTip, dripstoneRoot } from './dripstone.js';
import {
  CAULDRON_BLOCKS,
  CAULDRON_FLOOR,
  CAULDRON_INNER,
  cauldronHeight,
  waterCauldron,
} from './cauldron-data.js';

function dripAbove(world, q, y, r) {
  for (let tip = y + 1; tip <= Math.min(world.maxY - 1, y + 11); tip++) {
    if (world.fluids.get(q, tip, r)) return null;
    const type = world.get(q, tip, r);
    if (!type) continue;
    if (
      type !== 'pointedDripstone' ||
      !world.state(q, tip, r).upper ||
      !pointedTip(world, q, tip, r)
    )
      return null;
    const root = dripstoneRoot(world, q, tip, r);
    if (!ceilingSupport(world, q, root.y + 1, r)) return null;
    const source = world.fluids.get(q, root.y + 2, r);
    return source?.source && ['water', 'lava'].includes(source.type)
      ? source.type
      : null;
  }
  return null;
}

export function tickCauldrons(world, dt, weather, columns) {
  if (dt <= 0) return [];
  const changed = [];
  for (const k of world.buildings) {
    const [q, y, r] = k.split(',').map(Number),
      def = CAULDRON_BLOCKS[world.get(q, y, r)];
    if (!def || def.cauldronLevel === 3) continue;
    const liquid = dripAbove(world, q, y, r);
    let incoming = liquid,
      mean = liquid === 'lava' ? 1200 : 400;
    if (!incoming && world.dimension === 'overworld' && weather.rain > 0.25) {
      const column = columns.get(world, q, r);
      if (!['沙漠', '雪原'].includes(column.biome) && column.surface <= y + 1) {
        incoming = 'water';
        mean = 1200 / weather.rain;
      }
    }
    if (
      !incoming ||
      (def.cauldronLiquid && def.cauldronLiquid !== incoming) ||
      Math.random() >= 1 - Math.exp(-dt / mean)
    )
      continue;
    world.set(
      q,
      y,
      r,
      incoming === 'lava'
        ? 'lavaCauldron'
        : waterCauldron(def.cauldronLevel + 1),
    );
    changed.push([q, y, r]);
  }
  return changed;
}

// Match the existing player's contact sensors, rather than treating the whole
// cell or the non-colliding liquid surface as a solid/full world-fluid block.
export function cauldronContact(world, x, feet, z) {
  for (const [dx, dz] of [
    [0, 0],
    [0.24, 0],
    [-0.24, 0],
    [0, 0.24],
    [0, -0.24],
    [0.17, 0.17],
    [-0.17, -0.17],
  ]) {
    const sampleX = x + dx,
      sampleZ = z + dz,
      { q, r } = worldToAxial(sampleX, sampleZ);
    const y = Math.floor(feet),
      type = world.get(q, y, r),
      def = CAULDRON_BLOCKS[type];
    if (
      !def?.cauldronLevel ||
      feet < y + CAULDRON_FLOOR - 0.1 ||
      feet + 0.05 >= y + cauldronHeight(type)
    )
      continue;
    const p = axialToWorld(q, r);
    if (
      polygonContains(
        HEX_POLYGON,
        (sampleX - p.x) / CAULDRON_INNER,
        (sampleZ - p.z) / CAULDRON_INNER,
      )
    )
      return { q, y, r, liquid: def.cauldronLiquid, level: def.cauldronLevel };
  }
  return null;
}
