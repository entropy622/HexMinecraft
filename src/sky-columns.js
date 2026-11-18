import { WATER_EXTINCTION } from './fluids.js';

// Direct downwelling light. The near volume and distant worker start from
// identical foliage, water and open-sky attenuation before lateral transport.
export function skyColumns(world, { cost, medium, depth, minQ, minR }) {
  const sky = new Uint8Array(cost.length),
    height = world.maxY;
  for (let column = 0; column < sky.length; column += height) {
    let level = world.dimension === 'nether' ? 0 : 15;
    for (let y = height - 1; y >= 0 && level > 0; y--) {
      const i = column + y;
      if (cost[i] === 16) break;
      if (medium[i] >= 1 && medium[i] <= 9) {
        // Sky visibility follows optical distance through water. Keeping the
        // running level fractional avoids truncating a full level per cell.
        const q = minQ + Math.floor(column / (depth * height)),
          r = minR + ((column / height) % depth);
        level *= Math.exp(-WATER_EXTINCTION[1] * world.fluids.height(q, y, r));
      } else level = Math.max(0, level - (cost[i] > 1 ? cost[i] : 0));
      sky[i] = Math.floor(level);
    }
  }
  return sky;
}
