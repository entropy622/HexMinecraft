import { World } from './world.js';
import { BLOCKS } from './core.js';
import {
  DISTANT_TILE,
  DISTANT_STEP,
  DISTANT_SAMPLES,
} from './distant-config.js';
export {
  DISTANT_TILE,
  DISTANT_STEP,
  DISTANT_SAMPLES,
} from './distant-config.js';
export const DISTANT_TYPES = [
  ...Object.keys(BLOCKS),
  '@water',
  '@lava',
  '@glow',
];
const typeIndex = new Map(DISTANT_TYPES.map((type, i) => [type, i]));

// A visual field uses the real generator in its own world. Each job owns only
// one tile plus the shared forward-gradient halo; no gameplay world is loaded
// or simulated by the distant renderer.
export class DistantField {
  constructor({ seed, dimension = 'overworld', ...snapshot }) {
    this.seed = seed;
    this.dimension = dimension;
    this.edits = new Map(structuredClone(snapshot.edits || []));
    this.states = new Map(structuredClone(snapshot.blockStates || []));
    this.fluids = new Map(structuredClone(snapshot.fluids || []));
    this.villageExclusions = [...(snapshot.villageExclusions || [])];
  }

  patch(cells) {
    for (const { key, edit, state, fluid } of cells) {
      for (const [map, value] of [
        [this.edits, edit],
        [this.states, state],
        [this.fluids, fluid],
      ]) {
        if (value === undefined) map.delete(key);
        else map.set(key, structuredClone(value));
      }
    }
  }

  tile(tq, tr) {
    const q0 = tq * DISTANT_TILE,
      r0 = tr * DISTANT_TILE,
      extent = DISTANT_SAMPLES * DISTANT_STEP,
      local = (entries) =>
        [...entries].filter(([key]) => {
          const [q, , r] = key.split(',').map(Number);
          return q >= q0 && q < q0 + extent && r >= r0 && r < r0 + extent;
        }),
      world = new World(this.seed, this.dimension, {
        load: false,
        edits: local(this.edits),
        blockStates: local(this.states),
        fluids: local(this.fluids),
        villageExclusions: this.villageExclusions,
      }),
      length = DISTANT_SAMPLES ** 2,
      heights = new Float32Array(length),
      types = new Uint16Array(length),
      offsets = new Uint8Array(length),
      groundHeights = new Float32Array(length),
      groundTypes = new Uint16Array(length),
      groundOffsets = new Uint8Array(length);
    // Max-pool complete 4x4 column footprints. Thin authored towers and the
    // highest real canopy contribute even when they miss the coarse lattice.
    for (let cq = q0 / 8; cq < (q0 + extent) / 8; cq++)
      for (let cr = r0 / 8; cr < (r0 + extent) / 8; cr++)
        world.generateChunk(cq, cr);
    for (let iq = 0; iq < DISTANT_SAMPLES; iq++)
      for (let ir = 0; ir < DISTANT_SAMPLES; ir++) {
        const index = iq * DISTANT_SAMPLES + ir;
        for (let dq = 0; dq < DISTANT_STEP; dq++)
          for (let dr = 0; dr < DISTANT_STEP; dr++) {
            const q = q0 + iq * DISTANT_STEP + dq,
              r = r0 + ir * DISTANT_STEP + dr;
            let top = false;
            for (let y = world.maxY - 1; y >= 0; y--) {
              const block = world.get(q, y, r),
                fluid = world.fluids.get(q, y, r),
                solid =
                  block && (!BLOCKS[block].nonSolid || block === 'powderSnow');
              if (!solid && !fluid) continue;
              const height = y + (solid ? 1 : world.fluids.height(q, y, r));
              if (!top && height > heights[index]) {
                heights[index] = height;
                types[index] = typeIndex.get(solid ? block : '@' + fluid.type);
                offsets[index] = dq * DISTANT_STEP + dr;
              }
              top = true;
              const naturalTree =
                solid &&
                (BLOCKS[block].foliage || BLOCKS[block].log) &&
                !world.edits.has(`${q},${y},${r}`);
              if (!naturalTree) {
                if (height > groundHeights[index]) {
                  groundHeights[index] = height;
                  groundTypes[index] = typeIndex.get(
                    solid ? block : '@' + fluid.type,
                  );
                  groundOffsets[index] = dq * DISTANT_STEP + dr;
                }
                break;
              }
            }
          }
      }
    return {
      tq,
      tr,
      heights,
      types,
      offsets,
      groundHeights,
      groundTypes,
      groundOffsets,
      residentChunks: world.chunks.size,
      residentBlocks: world.blocks.size,
    };
  }
}
