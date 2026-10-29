import { Float32BufferAttribute } from 'three';
import { WATER_EXTINCTION } from './fluids.js';
import { BLOCKS, DIRECTIONS, axialToWorld, worldToAxial } from './core.js';
import { blockLight, EMISSION } from './light-data.js';
import { LeafAmbient } from './leaf-ambient.js';

// Independent hex-grid light transport, inspired by Photon LPV's colored
// emitters and normal-offset sampling. No upstream shader code is included.
const HEIGHT = 64;
export const HELD_LIGHTS = {
  redstoneTorch: 'redstoneTorch',
  endRod: 'endRod',
  torch: 'torch',
  lantern: 'lantern',
  glowstone: 'glowstone',
  crystal: 'crystal',
  lavaBucket: 'lava',
  glowBucket: 'glow',
};
const FACE_NORMALS = DIRECTIONS.map(([q, r]) => {
  const p = axialToWorld(q, r);
  return [p.x / Math.sqrt(3), p.z / Math.sqrt(3)];
});

export class VoxelLight {
  constructor(world) {
    this.world = world;
    this.revision = -1;
    this.dirty = true;
    this.timer = 0;
    this.heldSource = null;
    this.heldKey = '';
    this.heldDirty = false;
    this.leafAmbientField = new LeafAmbient();
  }

  setHeld(items, position) {
    const types = [
      ...new Set(
        (Array.isArray(items) ? items : [items])
          .map((item) => HELD_LIGHTS[item])
          .filter(Boolean),
      ),
    ].sort();
    const hex = worldToAxial(position.x, position.z);
    const y = Math.floor(position.y);
    const nextKey = types.length
      ? `${types.join('+')}:${hex.q},${y},${hex.r}`
      : '';
    if (nextKey === this.heldKey) return;
    this.heldKey = nextKey;
    // Both hands emit from the player's cell. Combine channel maxima rather
    // than adding brightness, so holding two torches does not double the light.
    const levels = [0, 1, 2].map((channel) =>
      Math.max(0, ...types.map((type) => EMISSION[type][channel])),
    );
    this.heldSource = types.length ? { q: hex.q, y, r: hex.r, levels } : null;
    this.heldDirty = true;
  }

  update(dt = 0, force = false) {
    this.timer -= dt;
    if (
      !force &&
      (this.timer > 0 ||
        (!this.dirty &&
          !this.heldDirty &&
          this.revision === this.world.lightRevision))
    )
      return false;
    if (force || this.dirty || this.revision !== this.world.lightRevision) {
      this.rebuild();
      this.baseRGB = this.rgb;
    }
    this.rgb = this.baseRGB;
    if (this.heldSource) {
      const { q, y, r, levels } = this.heldSource;
      const i = this.index(q, y, r);
      // Reuse the static sky/occlusion field when only the player moves.
      // Emit from the occupied cell, not the hand tip that can clip a wall.
      if (i >= 0 && this.cost[i] < 16) {
        this.rgb = this.baseRGB.map((channel) => channel.slice());
        for (let channel = 0; channel < 3; channel++) {
          const level = levels[channel];
          if (level <= this.rgb[channel][i]) continue;
          const buckets = Array.from({ length: 16 }, () => []);
          this.rgb[channel][i] = level;
          buckets[level].push(i);
          this.spread(this.rgb[channel], buckets);
        }
      }
    }
    this.timer = 0.25;
    this.dirty = false;
    this.heldDirty = false;
    this.revision = this.world.lightRevision;
    return true;
  }

  index(q, y, r) {
    if (
      q < this.minQ ||
      q >= this.minQ + this.width ||
      r < this.minR ||
      r >= this.minR + this.depth ||
      y < 0 ||
      y >= HEIGHT
    )
      return -1;
    return ((q - this.minQ) * this.depth + r - this.minR) * HEIGHT + y;
  }

  indexKey(key) {
    let i = this.indices.get(key);
    if (i === undefined) {
      i = this.index(...key.split(',').map(Number));
      this.indices.set(key, i);
    }
    return i;
  }

  rebuild() {
    const chunks = [...this.world.chunks.keys()].map((k) =>
      k.split(',').map(Number),
    );
    if (!chunks.length) return;
    this.minQ = Math.min(...chunks.map((c) => c[0])) * 8;
    this.minR = Math.min(...chunks.map((c) => c[1])) * 8;
    this.width = Math.max(...chunks.map((c) => c[0])) * 8 + 8 - this.minQ;
    this.depth = Math.max(...chunks.map((c) => c[1])) * 8 + 8 - this.minR;
    const bounds = `${this.minQ},${this.minR},${this.width},${this.depth}`;
    if (this.indexBounds !== bounds) {
      this.indices = new Map();
      this.indexBounds = bounds;
    }
    const size = this.width * this.depth * HEIGHT;
    const cost = new Uint8Array(size).fill(16);
    this.medium = new Uint8Array(size);
    for (const [cq, cr] of chunks)
      for (let q = cq * 8; q < cq * 8 + 8; q++)
        for (let r = cr * 8; r < cr * 8 + 8; r++) {
          const i = this.index(q, 0, r);
          cost.fill(1, i, i + HEIGHT);
        }
    const emitters = [],
      leafCells = [];
    this.opticalTop = 0;
    for (const [key, type] of this.world.blocks) {
      const i = this.indexKey(key);
      if (i < 0) continue;
      const y = i % HEIGHT,
        q = this.minQ + Math.floor(i / (this.depth * HEIGHT)),
        r = this.minR + (Math.floor(i / HEIGHT) % this.depth),
        data = blockLight(this.world, q, y, r, type),
        emission = (data >>> 9) & 4095;
      cost[i] = data & 31;
      this.opticalTop = Math.max(this.opticalTop, y + 1);
      this.medium[i] = (data >>> 5) & 15;
      if (BLOCKS[type]?.foliage && !BLOCKS[type]?.nonSolid) leafCells.push(i);
      if (emission)
        emitters.push([
          i,
          [emission & 15, (emission >>> 4) & 15, emission >>> 8],
        ]);
    }
    for (const cells of this.world.fluids.chunks.values())
      for (const [key, fluid] of cells) {
        const i = this.indexKey(key);
        if (i < 0 || cost[i] === 16) continue;
        const y = i % HEIGHT,
          q = this.minQ + Math.floor(i / (this.depth * HEIGHT)),
          r = this.minR + (Math.floor(i / HEIGHT) % this.depth);
        cost[i] = fluid.type === 'water' ? 2 : 1;
        this.opticalTop = Math.max(this.opticalTop, y + 1);
        this.medium[i] =
          fluid.type === 'water'
            ? this.world.fluids.height(q, y, r) === 1
              ? 1
              : 2 + fluid.level
            : fluid.type === 'lava'
              ? 10
              : 11;
        if (EMISSION[fluid.type]) emitters.push([i, EMISSION[fluid.type]]);
      }
    this.cost = cost;
    this.leafAmbientField.update(this, leafCells);
    this.leafAmbient = this.leafAmbientField.values;
    this.leafAmbientCells = this.leafAmbientField.cells;
    this.leafAmbientVersion = this.leafAmbientField.version;
    this.sky = new Uint8Array(size);
    this.rgb = Array.from({ length: 3 }, () => new Uint8Array(size));
    const skyBuckets = Array.from({ length: 16 }, () => []);
    for (let column = 0; column < size; column += HEIGHT) {
      let level = this.world.dimension === 'nether' ? 0 : 15;
      for (let y = HEIGHT - 1; y >= 0 && level > 0; y--) {
        const i = column + y;
        if (cost[i] === 16) break;
        if (this.medium[i] >= 1 && this.medium[i] <= 9) {
          // Sky visibility follows optical distance through water. Keeping the
          // running level fractional avoids truncating a full level per cell.
          const q = this.minQ + Math.floor(column / (this.depth * HEIGHT)),
            r = this.minR + ((column / HEIGHT) % this.depth);
          level *= Math.exp(
            -WATER_EXTINCTION[1] * this.world.fluids.height(q, y, r),
          );
        } else level = Math.max(0, level - (cost[i] > 1 ? cost[i] : 0));
        const quantized = Math.floor(level);
        this.sky[i] = quantized;
      }
    }
    if (this.world.dimension !== 'nether') this.seedSkylight(skyBuckets);
    this.spread(this.sky, skyBuckets);
    for (let channel = 0; channel < 3; channel++) {
      const buckets = Array.from({ length: 16 }, () => []),
        field = this.rgb[channel];
      for (const [i, emission] of emitters) {
        if (emission[channel] > field[i]) {
          field[i] = emission[channel];
          buckets[emission[channel]].push(i);
        }
      }
      this.spread(field, buckets);
    }
  }

  seedSkylight(buckets) {
    const field = this.sky,
      stride = this.depth * HEIGHT,
      offsets = DIRECTIONS.map(([q, r]) => q * stride + r * HEIGHT);
    // Direct sky already solves each vertical column. Only a darker receiver
    // beside a brighter column can start lateral transport; queuing every
    // exposed air cell needlessly visits most of the loaded world.
    let i = 0;
    for (let q = 0; q < this.width; q++)
      for (let r = 0; r < this.depth; r++)
        for (let y = 0; y < HEIGHT; y++, i++) {
          if (field[i] >= 14 || this.cost[i] >= 16) continue;
          let level = field[i];
          for (let d = 0; d < 6; d++) {
            const [dq, dr] = DIRECTIONS[d];
            if (
              q + dq < 0 ||
              q + dq >= this.width ||
              r + dr < 0 ||
              r + dr >= this.depth
            )
              continue;
            level = Math.max(level, field[i + offsets[d]] - this.cost[i]);
          }
          if (level > field[i]) {
            field[i] = level;
            buckets[level].push(i);
          }
        }
  }

  spread(field, buckets) {
    const stride = this.depth * HEIGHT;
    const offsets = DIRECTIONS.map(([q, r]) => q * stride + r * HEIGHT);
    // Descending buckets visit each cell at its strongest level, with no
    // string-map lookups or per-neighbor allocations in the flood fill.
    for (let level = 15; level > 1; level--)
      for (const i of buckets[level]) {
        if (field[i] !== level) continue;
        const column = Math.floor(i / HEIGHT),
          y = i % HEIGHT;
        const q = Math.floor(column / this.depth),
          r = column % this.depth;
        for (let direction = 0; direction < 8; direction++) {
          let n;
          if (direction < 6) {
            const [dq, dr] = DIRECTIONS[direction];
            if (
              q + dq < 0 ||
              q + dq >= this.width ||
              r + dr < 0 ||
              r + dr >= this.depth
            )
              continue;
            n = i + offsets[direction];
          } else {
            if (direction === 6 ? y === 0 : y === HEIGHT - 1) continue;
            n = i + (direction === 6 ? -1 : 1);
          }
          const next = level - this.cost[n];
          if (next > field[n]) {
            field[n] = next;
            buckets[next].push(n);
          }
        }
      }
  }

  // Geometry positions are local to their chunk, including shaped buildings.
  // Pull vertices slightly into each triangle before the normal offset, so
  // corners never accidentally sample through the neighboring solid wall.
  relight(mesh) {
    const origin = mesh.position;
    mesh.traverse((object) => {
      const g = object.geometry;
      if (!g?.attributes.skylight) return;
      const p = g.attributes.position,
        normal = g.attributes.normal;
      if (!g.attributes.blocklight)
        g.setAttribute(
          'blocklight',
          new Float32BufferAttribute(new Float32Array(p.count * 3), 3),
        );
      let cache = g.userData.lightSamples;
      const bounds = `${this.minQ},${this.minR},${this.depth},${this.width}`;
      if (!cache || cache.bounds !== bounds || object.userData.shaped) {
        cache = { bounds, indices: new Int32Array(p.count) };
        for (let t = 0; t < p.count; t += 3) {
          const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
          const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
          const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
          for (let j = t; j < t + 3; j++) {
            const x =
              p.getX(j) * 0.75 + cx * 0.25 + normal.getX(j) * 0.12 + origin.x;
            const z =
              p.getZ(j) * 0.75 + cz * 0.25 + normal.getZ(j) * 0.12 + origin.z;
            const y = Math.floor(
              p.getY(j) * 0.75 + cy * 0.25 + normal.getY(j) * 0.12,
            );
            const hex = worldToAxial(x, z);
            let index = this.index(hex.q, y, hex.r);
            // Thin closed doors occupy an opaque logical cell. Their surfaces
            // sample the adjacent cell on the outward side of the panel.
            if (
              object.userData.shaped &&
              index >= 0 &&
              this.cost[index] === 16
            ) {
              const block = object.userData.shaped;
              let best = -Infinity,
                direction = 0;
              for (let d = 0; d < 6; d++) {
                const score =
                  FACE_NORMALS[d][0] * normal.getX(j) +
                  FACE_NORMALS[d][1] * normal.getZ(j);
                if (score > best) {
                  best = score;
                  direction = d;
                }
              }
              if (Math.abs(normal.getY(j)) > 0.5)
                index = this.index(
                  block.q,
                  block.y + Math.sign(normal.getY(j)),
                  block.r,
                );
              else {
                const [dq, dr] = DIRECTIONS[direction];
                index = this.index(block.q + dq, block.y, block.r + dr);
              }
            }
            cache.indices[j] = index;
          }
        }
        g.userData.lightSamples = cache;
      }
      const sky = g.attributes.skylight,
        rgb = g.attributes.blocklight;
      for (let j = 0; j < p.count; j++) {
        const i = cache.indices[j];
        sky.array[j] = i < 0 ? 1 : (this.sky[i] / 15) ** 2;
        for (let c = 0; c < 3; c++)
          rgb.array[j * 3 + c] = i < 0 ? 0 : (this.rgb[c][i] / 15) ** 2;
      }
      sky.needsUpdate = rgb.needsUpdate = true;
      const ambient = g.attributes.leafAmbient,
        ranges = g.userData.leafRanges;
      if (
        ambient &&
        ranges &&
        g.userData.leafAmbientVersion !== this.leafAmbientVersion
      ) {
        for (let j = 0; j < ranges.length; j += 5) {
          const i = this.index(ranges[j], ranges[j + 1], ranges[j + 2]);
          ambient.array.fill(
            i < 0 ? 0 : this.leafAmbient[i],
            ranges[j + 3],
            ranges[j + 4],
          );
        }
        ambient.needsUpdate = true;
        // Retain a scalar only: hundreds of chunk geometries must not keep
        // older world-sized fields alive after streaming or block updates.
        g.userData.leafAmbientVersion = this.leafAmbientVersion;
      }
    });
  }

  atPosition(position) {
    const hex = worldToAxial(position.x, position.z);
    const i = this.index(hex.q, Math.floor(position.y), hex.r);
    return i < 0 ? 1 : this.sky[i] / 15;
  }
}
