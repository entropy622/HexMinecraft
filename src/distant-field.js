import { World } from './world.js';
import { BLOCKS } from './core.js';
import { encodeDetail, decodeDetail, FULL_DETAIL } from './distant-detail.js';
import {
  DISTANT_TILE,
  DISTANT_STEP,
  DISTANT_SAMPLES,
  DISTANT_DETAIL_STEP,
  DISTANT_DETAIL_SAMPLES,
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
      extent = DISTANT_SAMPLES * DISTANT_STEP;
    const local = (entries) =>
      [...entries].filter(([key]) => {
        const [q, , r] = key.split(',').map(Number);
        return q >= q0 && q < q0 + extent && r >= r0 && r < r0 + extent;
      });
    const world = new World(this.seed, this.dimension, {
      load: false,
      trackFeatures: true,
      edits: local(this.edits),
      blockStates: local(this.states),
      fluids: local(this.fluids),
      villageExclusions: this.villageExclusions,
    });
    for (let cq = q0 / 8; cq < (q0 + extent) / 8; cq++)
      for (let cr = r0 / 8; cr < (r0 + extent) / 8; cr++)
        world.generateChunk(cq, cr);
    const length = DISTANT_SAMPLES ** 2,
      detailHeight = world.maxY;
    const heights = new Float32Array(length),
      types = new Uint16Array(length),
      offsets = new Uint8Array(length),
      groundHeights = new Float32Array(length),
      groundTypes = new Uint16Array(length),
      groundOffsets = new Uint8Array(length),
      columnHeights = new Float32Array(extent ** 2),
      columnTypes = new Uint16Array(extent ** 2),
      refined = new Uint8Array(length),
      details = new Uint16Array(DISTANT_DETAIL_SAMPLES ** 2 * detailHeight),
      priorities = new Uint8Array(details.length),
      meta = new Map(),
      fine = new Map();
    const sample = (q, y, r) => {
      const block = world.get(q, y, r),
        fluid = world.fluids.get(q, y, r),
        info = BLOCKS[block];
      const solid = block && (!info.nonSolid || block === 'powderSnow');
      if (!solid && !fluid) return null;
      const state =
        solid && (info.pillar || info.shape === 'slab')
          ? world.state(q, y, r)
          : null;
      const bottom =
        state && info.shape === 'slab' && !state.double && state.upper
          ? 0.5
          : 0;
      const top = solid
        ? info.shape === 'slab' && !state.double && !state.upper
          ? 0.5
          : 1
        : world.fluids.height(q, y, r);
      return {
        block,
        fluid,
        info,
        solid,
        bottom,
        top,
        axis: info?.pillar ? state.axis || 0 : 0,
        id: typeIndex.get(solid ? block : '@' + fluid.type),
      };
    };
    const record = (x, y, z, v, exact = false) => {
      if (exact) {
        fine.set(
          (x * extent + z) * detailHeight + y,
          ((v.id + 1) * 65536 + encodeDetail(v.bottom, v.top, v.axis)) >>> 0,
        );
        return;
      }
      const a = Math.floor(x / DISTANT_DETAIL_STEP),
        b = Math.floor(z / DISTANT_DETAIL_STEP),
        cell = (a * DISTANT_DETAIL_SAMPLES + b) * detailHeight + y;
      const priority = v.solid ? (v.info.foliage ? 2 : v.info.log ? 1 : 3) : 0,
        previous = details[cell];
      if (previous && priority < priorities[cell]) return;
      let { bottom, top, axis } = v;
      if (previous === v.id + 1) {
        const old = decodeDetail(meta.get(cell));
        bottom = Math.min(bottom, old.bottom);
        top = Math.max(top, old.top);
        axis = old.axis || axis;
      } else if (
        previous &&
        priority === priorities[cell] &&
        top <= decodeDetail(meta.get(cell)).top
      )
        return;
      details[cell] = v.id + 1;
      priorities[cell] = priority;
      const packed = encodeDetail(bottom, top, axis);
      if (packed === FULL_DETAIL) meta.delete(cell);
      else meta.set(cell, packed);
    };
    for (let x = 0; x < extent; x++)
      for (let z = 0; z < extent; z++) {
        const q = q0 + x,
          r = r0 + z,
          base = world.heights.get(`${q},${r}`),
          group =
            Math.floor(x / DISTANT_STEP) * DISTANT_SAMPLES +
            Math.floor(z / DISTANT_STEP),
          column = x * extent + z;
        for (let y = detailHeight - 1; y >= 0; y--) {
          const v = sample(q, y, r);
          if (!v) continue;
          const height = y + v.top;
          if (height > heights[group]) {
            heights[group] = height;
            types[group] = v.id;
            offsets[group] =
              (x % DISTANT_STEP) * DISTANT_STEP + (z % DISTANT_STEP);
          }
          const key = `${q},${y},${r}`;
          const detail =
            (v.solid &&
              (y >= base ||
                v.info.log ||
                v.info.foliage ||
                world.edits.has(key) ||
                world.featureBlocks.has(key))) ||
            (v.fluid && world.fluids.edits.has(key));
          if (detail) {
            record(
              x,
              y,
              z,
              v,
              !v.solid ||
                world.edits.has(key) ||
                world.featureBlocks.has(key) ||
                (!v.info.log && !v.info.foliage),
            );
            continue;
          }
          columnHeights[column] = height;
          columnTypes[column] = v.id;
          break;
        }
        if (columnHeights[column] < base - 0.001) refined[group] = 1;
      }
    // A precise detail must not disappear beneath a higher pooled neighbour.
    for (const [cell] of fine) {
      const y = cell % detailHeight,
        column = Math.floor(cell / detailHeight),
        x = Math.floor(column / extent),
        z = column % extent,
        a = Math.floor(x / DISTANT_STEP),
        b = Math.floor(z / DISTANT_STEP);
      let max = 0;
      for (let dx = 0; dx < DISTANT_STEP; dx++)
        for (let dz = 0; dz < DISTANT_STEP; dz++)
          max = Math.max(
            max,
            columnHeights[
              (a * DISTANT_STEP + dx) * extent + b * DISTANT_STEP + dz
            ],
          );
      if (y < max) refined[a * DISTANT_SAMPLES + b] = 1;
    }
    for (let a = 0; a < DISTANT_SAMPLES; a++)
      for (let b = 0; b < DISTANT_SAMPLES; b++) {
        const group = a * DISTANT_SAMPLES + b;
        let ground = refined[group] ? Infinity : 0,
          chosen = 0,
          offset = 0;
        for (let dx = 0; dx < DISTANT_STEP; dx++)
          for (let dz = 0; dz < DISTANT_STEP; dz++) {
            const column =
                (a * DISTANT_STEP + dx) * extent + b * DISTANT_STEP + dz,
              height = columnHeights[column];
            if (refined[group] ? height < ground : height > ground) {
              ground = height;
              chosen = columnTypes[column];
              offset = dx * DISTANT_STEP + dz;
            }
          }
        groundHeights[group] = Number.isFinite(ground) ? ground : 0;
        groundTypes[group] = chosen;
        groundOffsets[group] = offset;
        if (!refined[group]) continue;
        // Refine edited surface groups rather than hiding paint/floors beneath a
        // neighbour's pooled terrain. Keep their real remaining cells and gaps.
        for (let dx = 0; dx < DISTANT_STEP; dx++)
          for (let dz = 0; dz < DISTANT_STEP; dz++) {
            const x = a * DISTANT_STEP + dx,
              z = b * DISTANT_STEP + dz,
              column = x * extent + z;
            for (
              let y = Math.floor(ground);
              y < Math.ceil(columnHeights[column]);
              y++
            ) {
              const v = sample(q0 + x, y, r0 + z);
              if (v) record(x, y, z, v, true);
            }
          }
      }
    // Exact blocks and carved air both displace the pooled natural canopy.
    // Retain their real neighbours instead of filling the edited cell again.
    const promote = (x, y, z) => {
      if (
        x < 0 ||
        x >= extent ||
        z < 0 ||
        z >= extent ||
        y < 0 ||
        y >= detailHeight
      )
        return;
      const a = Math.floor(x / DISTANT_DETAIL_STEP),
        b = Math.floor(z / DISTANT_DETAIL_STEP),
        coarse = (a * DISTANT_DETAIL_SAMPLES + b) * detailHeight + y;
      if (!details[coarse]) return;
      details[coarse] = 0;
      meta.delete(coarse);
      for (let dx = 0; dx < DISTANT_DETAIL_STEP; dx++)
        for (let dz = 0; dz < DISTANT_DETAIL_STEP; dz++) {
          const px = a * DISTANT_DETAIL_STEP + dx,
            pz = b * DISTANT_DETAIL_STEP + dz,
            v = sample(q0 + px, y, r0 + pz);
          if (v) record(px, y, pz, v, true);
        }
    };
    for (const cell of [...fine.keys()]) {
      const column = Math.floor(cell / detailHeight);
      promote(
        Math.floor(column / extent),
        cell % detailHeight,
        column % extent,
      );
    }
    for (const keys of [world.edits.keys(), world.featureBlocks.keys()])
      for (const key of keys) {
        const [q, y, r] = key.split(',').map(Number);
        promote(q - q0, y, r - r0);
      }
    const fineDetails = new Uint32Array(
      [...fine]
        .sort((a, b) => a[0] - b[0])
        .flatMap(([cell, value]) => [cell, value]),
    );
    const detailMeta = new Uint32Array(
      [...meta]
        .sort((a, b) => a[0] - b[0])
        .map(([cell, value]) => cell * 65536 + value),
    );
    return {
      tq,
      tr,
      heights,
      types,
      offsets,
      groundHeights,
      groundTypes,
      groundOffsets,
      details,
      detailHeight,
      detailMeta,
      fineDetails,
      residentChunks: world.chunks.size,
      residentBlocks: world.blocks.size,
    };
  }
}
