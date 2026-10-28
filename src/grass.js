import { BLOCKS, DIRECTIONS } from './core.js';
import { isGlass } from './dye-data.js';
import { buildingParts } from './building-shapes.js';
import { HEX_POLYGON } from './cut-blocks.js';

const COLUMNS = [[0, 0], ...DIRECTIONS];
const area = (polygon) =>
  Math.abs(
    polygon.reduce((sum, [x, z], i) => {
      const [nx, nz] = polygon[(i + 1) % polygon.length];
      return sum + x * nz - nx * z;
    }, 0),
  ) / 2;
const FACE_AREA = area(HEX_POLYGON);

function survives(world, q, y, r, light) {
  const fluid = world.fluids.get(q, y + 1, r);
  if (fluid && (fluid.source || fluid.falling)) return false;
  const type = world.get(q, y + 1, r),
    block = BLOCKS[type];
  if (!block || block.nonSolid || block.foliage || isGlass(type)) return true;
  // Optical permeability is distinct from collision: carpet/glass can have a
  // complete collision underside while transmitting light unchanged.
  if (light.cost[light.index(q, y + 1, r)] === 1) return true;
  if (!block.shape) return false;
  let covered = 0;
  for (const part of buildingParts(world, q, y + 1, r, true))
    if (part.polygon && !part.pitch && Math.abs(part.y - part.h / 2) < 1e-6)
      covered += area(part.polygon);
  return covered < FACE_AREA - 1e-6;
}

// Reuse the renderer's static transport, excluding its optional held-light layer.
// A source needs light 9; Java 1.21.5 has no target-light threshold.
export function tickGrass(world, dt, light, time, weather) {
  const changed = [];
  if (
    !(dt > 0) ||
    !Number.isFinite(dt) ||
    light.world !== world ||
    light.revision !== world.lightRevision ||
    !light.baseRGB
  )
    return changed;
  const attempts = Math.round(dt * 60),
    skyLoss =
      world.dimension === 'overworld'
        ? Math.floor(
            11 *
              (1 -
                (time % 600 < 300 ? 1 : 0) *
                  (1 - (weather.rain * 5) / 16) *
                  (1 - (weather.storm * 5) / 16)),
          )
        : 0;
  for (const ck of world.chunks.keys()) {
    const [cq, cr] = ck.split(',').map(Number);
    // Each 8*8*64 chunk has the same 4096-cell volume as a Java section.
    for (let n = 0; n < attempts; n++) {
      const q = cq * 8 + Math.floor(Math.random() * 8),
        r = cr * 8 + Math.floor(Math.random() * 8),
        y = Math.floor(Math.random() * world.maxY);
      if (world.get(q, y, r) !== 'grass') continue;
      if (!survives(world, q, y, r, light)) {
        world.set(q, y, r, 'dirt');
        changed.push([q, y, r]);
        continue;
      }
      const index = light.index(q, y + 1, r),
        sky =
          world.dimension !== 'overworld'
            ? 0
            : index < 0
              ? 15
              : light.sky[index];
      const level = Math.max(
        sky - skyLoss,
        ...light.baseRGB.map((channel) => (index < 0 ? 0 : channel[index])),
      );
      if (level < 9) continue;
      for (let trial = 0; trial < 4; trial++) {
        const [dq, dr] = COLUMNS[Math.floor(Math.random() * COLUMNS.length)],
          a = q + dq,
          b = y + Math.floor(Math.random() * 5) - 3,
          c = r + dr;
        if (
          b < 0 ||
          b >= world.maxY ||
          !world.loaded(a, c) ||
          world.get(a, b, c) !== 'dirt' ||
          world.fluids.get(a, b + 1, c) ||
          !survives(world, a, b, c, light)
        )
          continue;
        world.set(a, b, c, 'grass');
        changed.push([a, b, c]);
      }
    }
  }
  return changed;
}
