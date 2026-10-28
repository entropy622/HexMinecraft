import {
  DIRECTIONS,
  axialToWorld,
  worldToAxial,
  hexDistance,
  key,
} from './core.js';
import { HEX_POLYGON, polygonContains } from './cut-blocks.js';
import { pigmentSupport } from './pigment-plants.js';

// Java checks entity overlap with the full block, outside its inset collision
// prism. A circle/edge distance test also catches corners between foot samples.
export function cactusContact(world, x, feet, z, height, radius) {
  const cell = worldToAxial(x, z),
    range = Math.ceil((radius + 1) / 1.5);
  for (let dq = -range; dq <= range; dq++)
    for (let dr = -range; dr <= range; dr++) {
      if (hexDistance(dq, dr) > range) continue;
      const q = cell.q + dq,
        r = cell.r + dr;
      if (!world.loaded(q, r)) continue;
      let cactus = false;
      for (
        let y = Math.max(0, Math.floor(feet));
        y < Math.min(world.maxY, Math.ceil(feet + height));
        y++
      )
        if (world.get(q, y, r) === 'cactus') {
          cactus = true;
          break;
        }
      if (!cactus) continue;
      const p = axialToWorld(q, r),
        px = x - p.x,
        pz = z - p.z;
      const overlaps =
        polygonContains(HEX_POLYGON, px, pz) ||
        HEX_POLYGON.some(([ax, az], i) => {
          const [bx, bz] = HEX_POLYGON[(i + 1) % 6],
            dx = bx - ax,
            dz = bz - az,
            t = Math.max(
              0,
              Math.min(
                1,
                ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz),
              ),
            );
          return Math.hypot(px - ax - t * dx, pz - az - t * dz) < radius;
        });
      if (overlaps) return true;
    }
  return false;
}

// The existing plant-maintenance dt supplies the same random-cell sample rate
// as grass. Age is the real saved block state, never a second timer registry.
export function tickCactus(world, dt) {
  const changed = [];
  if (!(dt > 0) || !Number.isFinite(dt)) return changed;
  for (const ck of world.chunks.keys()) {
    const [cq, cr] = ck.split(',').map(Number);
    for (let n = 0; n < Math.round(dt * 60); n++) {
      const q = cq * 8 + Math.floor(Math.random() * 8),
        r = cr * 8 + Math.floor(Math.random() * 8),
        y = Math.floor(Math.random() * world.maxY);
      if (
        world.get(q, y, r) !== 'cactus' ||
        y + 1 >= world.maxY ||
        world.get(q, y + 1, r) ||
        world.fluids.get(q, y + 1, r) ||
        DIRECTIONS.some(([dq, dr]) => !world.loaded(q + dq, r + dr))
      )
        continue;
      const state = world.state(q, y, r),
        age = state.age ?? 0;
      let height = 1;
      while (world.get(q, y - height, r) === 'cactus') height++;
      if (age === 15 && height >= 3) continue;
      if (age === 8 && pigmentSupport(world, 'cactus', q, y + 1, r)) {
        if (Math.random() <= (height < 3 ? 0.1 : 0.25)) {
          world.set(q, y + 1, r, 'cactusFlower');
          changed.push([q, y + 1, r]);
        }
      } else if (age === 15 && height < 3) {
        world.set(q, y + 1, r, 'cactus');
        changed.push([q, y + 1, r]);
      }
      // Natural stems have no edit until their first state change. Recording
      // their type lets the ordinary strict save validator identify this age.
      if (!world.edits.has(key(q, y, r))) world.set(q, y, r, 'cactus');
      world.setState(q, y, r, { ...state, age: age === 15 ? 0 : age + 1 });
    }
  }
  return changed;
}
