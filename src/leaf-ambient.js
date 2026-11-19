import { axialToWorld, worldToAxial } from './core.js';

// Geometry-derived ambient transmission for leaves and thin plants. Photon uses a
// screen-space horizon integral; this forward renderer uses the loaded hex
// volume instead. This is local visibility, not an additional sky light source.
const HEIGHT = 64,
  RADIUS = 2,
  EXTINCTION = 1.3,
  EPSILON = 1e-6,
  HALF_WIDTH = Math.sqrt(3) / 2;
const directions = [];
for (let i = 0; i < 6; i++)
  for (const elevation of [-Math.PI / 4, 0, Math.PI / 4]) {
    const angle = (i * Math.PI) / 3;
    directions.push([
      Math.cos(angle) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(angle) * Math.cos(elevation),
    ]);
  }

function exitDistance(p, q, y, r, direction) {
  const center = axialToWorld(q, r),
    x = p[0] - center.x,
    z = p[2] - center.z;
  let distance = direction[1]
    ? ((direction[1] > 0 ? y + 1 : y) - p[1]) / direction[1]
    : Infinity;
  for (const [nx, nz] of [
    [1, 0],
    [0.5, HALF_WIDTH],
    [-0.5, HALF_WIDTH],
  ]) {
    const speed = nx * direction[0] + nz * direction[2];
    if (Math.abs(speed) < EPSILON) continue;
    distance = Math.min(
      distance,
      (HALF_WIDTH - Math.sign(speed) * (nx * x + nz * z)) / Math.abs(speed),
    );
  }
  return distance;
}

// All leaf cells have the same translated prism. Trace the eighteen paths once,
// excluding the receiver's own cell; retain exact occupied lengths thereafter.
const paths = directions.map((direction) => {
  const origin = [0, 0.5, 0],
    start = exitDistance(origin, 0, 0, 0, direction),
    end = start + RADIUS,
    segments = [];
  let t = start;
  for (let i = 0; i < 16 && t < end - EPSILON; i++) {
    const point = origin.map((v, c) => v + direction[c] * (t + EPSILON)),
      { q, r } = worldToAxial(point[0], point[2]),
      y = Math.floor(point[1]),
      next = Math.min(
        end,
        t + EPSILON + exitDistance(point, q, y, r, direction),
      ),
      length = next - t;
    if (length <= 0) throw Error('Leaf ambient path did not cross a hex face.');
    segments.push({ q, y, r, transmission: Math.exp(-EXTINCTION * length) });
    t = next;
  }
  if (t < end - EPSILON)
    throw Error('Leaf ambient path exceeded its cell budget.');
  return segments;
});

// The rays classify a cell as a blocker, a leaf, or a clear segment. A
// different water height, glass tint or emitter does not change any ray.
function sameTransmission(cost, medium, oldCost, oldMedium) {
  for (let i = 0; i < cost.length; i++) {
    if (cost[i] === oldCost[i] && medium[i] === oldMedium[i]) continue;
    const before = oldCost[i] >= 16 || oldMedium[i] === 13;
    const after = cost[i] >= 16 || medium[i] === 13;
    if (
      before !== after ||
      (!after && (oldMedium[i] === 12) !== (medium[i] === 12))
    )
      return false;
  }
  return true;
}

function equalCells(a, b) {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const segmentBounds = paths
  .flat()
  .reduce(
    (box, { q, y, r }) => [
      Math.min(q, box[0]),
      Math.max(q, box[1]),
      Math.min(y, box[2]),
      Math.max(y, box[3]),
      Math.min(r, box[4]),
      Math.max(r, box[5]),
    ],
    [0, 0, 0, 0, 0, 0],
  );

export class LeafAmbient {
  constructor() {
    this.version = 0;
  }

  update(field, cells) {
    const { minQ, minR, width, depth, cost, medium } = field,
      bounds = `${minQ},${minR},${width},${depth}`,
      unchanged =
        bounds === this.bounds &&
        equalCells(cells, this.cells) &&
        sameTransmission(cost, medium, this.cost, this.medium);
    this.bounds = bounds;
    this.cost = cost;
    this.medium = medium;
    if (unchanged) return;
    if (depth !== this.pathDepth) {
      this.pathDepth = depth;
      this.offsetPaths = paths.map((path) =>
        path.map(({ q, y, r, transmission }) => [
          (q * depth + r) * HEIGHT + y,
          transmission,
        ]),
      );
    }
    const [minX, maxX, minY, maxY, minZ, maxZ] = segmentBounds;
    this.cells = Int32Array.from(cells);
    this.values = new Uint8Array(cost.length);
    for (const index of cells) {
      const y = index % HEIGHT,
        column = Math.floor(index / HEIGHT),
        x = Math.floor(column / depth),
        z = column % depth;
      let visible = 0;
      if (
        x + minX >= 0 &&
        x + maxX < width &&
        z + minZ >= 0 &&
        z + maxZ < depth &&
        y + minY >= 0 &&
        y + maxY < HEIGHT
      ) {
        for (const path of this.offsetPaths) {
          let transmission = 1;
          for (const [offset, attenuation] of path) {
            const i = index + offset;
            if (cost[i] >= 16 || medium[i] === 13) {
              transmission = 0;
              break;
            }
            if (medium[i] === 12) transmission *= attenuation;
          }
          visible += transmission;
        }
      } else {
        // Above-world samples leave the volume. Sides and bedrock block.
        for (const path of paths) {
          let transmission = 1;
          for (const segment of path) {
            if (y + segment.y >= HEIGHT) break;
            const i = field.index(
              x + minQ + segment.q,
              y + segment.y,
              z + minR + segment.r,
            );
            if (i < 0 || cost[i] >= 16 || medium[i] === 13) {
              transmission = 0;
              break;
            }
            if (medium[i] === 12) transmission *= segment.transmission;
          }
          visible += transmission;
        }
      }
      this.values[index] = Math.round((255 * visible) / paths.length);
    }
    this.version++;
  }
}
