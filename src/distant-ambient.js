import { BLOCKS, DIRECTIONS } from './core.js';
import { blockLight } from './light-data.js';
import { skyColumns } from './sky-columns.js';
import { LeafAmbient } from './leaf-ambient.js';

// Reuse the near canopy's actual hex-ray visibility on the worker's real world.
// This temporary field is never transferred, cached or uploaded as a texture.
export function distantAmbient(world, minQ, minR, extent) {
  const height = world.maxY;
  const field = {
    minQ,
    minR,
    width: extent,
    depth: extent,
    cost: new Uint8Array(extent * extent * height).fill(1),
    medium: new Uint8Array(extent * extent * height),
    index(q, y, r) {
      if (
        q < minQ ||
        q >= minQ + extent ||
        r < minR ||
        r >= minR + extent ||
        y < 0 ||
        y >= height
      )
        return -1;
      return ((q - minQ) * extent + r - minR) * height + y;
    },
  };
  const cells = [];
  for (const [key, type] of world.blocks) {
    const [q, y, r] = key.split(',').map(Number),
      index = field.index(q, y, r);
    if (index < 0) continue;
    const data = blockLight(world, q, y, r, type);
    field.cost[index] = data & 31;
    field.medium[index] = (data >>> 5) & 15;
    if (BLOCKS[type]?.foliage && !BLOCKS[type].nonSolid) cells.push(index);
  }
  // LeafAmbient treats fluid categories alike; sky attenuation remains separate.
  for (const entries of world.fluids.chunks.values())
    for (const [key, fluid] of entries) {
      const index = field.index(...key.split(',').map(Number));
      if (index < 0 || field.cost[index] === 16) continue;
      field.cost[index] = fluid.type === 'water' ? 2 : 1;
      field.medium[index] =
        fluid.type === 'water' ? 1 : fluid.type === 'lava' ? 10 : 11;
    }
  const ambient = new LeafAmbient();
  ambient.update(field, cells);
  // A four-column tile halo covers the face sample and three propagation
  // steps. Each pass reads the previous one, including at tile boundaries.
  let sky = skyColumns(world, field),
    next = new Uint8Array(sky.length);
  for (let pass = 0; pass < 3; pass++) {
    next.set(sky);
    for (let q = 1; q < extent - 1; q++)
      for (let r = 1; r < extent - 1; r++) {
        const col = (q * extent + r) * height;
        for (let y = 0; y < height; y++) {
          const i = col + y,
            cost = field.cost[i];
          if (cost >= 16 || sky[i] >= 15 - cost) continue;
          let max = Math.max(
            y ? sky[i - 1] : 0,
            y + 1 < height ? sky[i + 1] : 15,
          );
          for (const [dq, dr] of DIRECTIONS)
            max = Math.max(max, sky[i + (dq * extent + dr) * height]);
          next[i] = Math.max(sky[i], max - cost);
        }
      }
    [sky, next] = [next, sky];
  }
  return { values: ambient.values, medium: field.medium, sky };
}
