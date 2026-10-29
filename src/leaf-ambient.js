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

function equal(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class LeafAmbient {
  constructor() {
    this.version = 0;
  }

  update(field, cells) {
    const bounds = `${field.minQ},${field.minR},${field.width},${field.depth}`,
      unchanged =
        bounds === this.bounds &&
        equal(cells, this.cells) &&
        equal(field.cost, this.cost) &&
        equal(field.medium, this.medium);
    this.bounds = bounds;
    this.cost = field.cost;
    this.medium = field.medium;
    if (unchanged) return;
    this.cells = Int32Array.from(cells);
    this.values = new Uint8Array(field.cost.length);
    for (const index of cells) {
      const y = index % HEIGHT,
        q = field.minQ + Math.floor(index / (field.depth * HEIGHT)),
        r = field.minR + (Math.floor(index / HEIGHT) % field.depth);
      let visible = 0;
      for (const path of paths) {
        let transmission = 1;
        for (const segment of path) {
          if (y + segment.y >= HEIGHT) break;
          const i = field.index(q + segment.q, y + segment.y, r + segment.r);
          // Unloaded cells, bedrock and partially represented solid shapes
          // are conservative blockers. Air, glass and fluids use the existing
          // skylight field for their attenuation, avoiding a second water tint.
          if (i < 0 || field.cost[i] >= 16 || field.medium[i] === 13) {
            transmission = 0;
            break;
          }
          if (field.medium[i] === 12) transmission *= segment.transmission;
        }
        visible += transmission;
      }
      this.values[index] = Math.round((255 * visible) / paths.length);
    }
    this.version++;
  }
}
