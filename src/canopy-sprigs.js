import { hash } from './core.js';

// Original 16px broadleaf silhouette. y=0 is the free tip, y=15 the stem.
// Applying the cutout after atlas tint preserves the resource pack's pigment.
const mask = [
  '........##......',
  '.......####.....',
  '......#####.....',
  '..##..####...##.',
  '.####.###..####.',
  '.#####.##.#####.',
  '..#####.######..',
  '...####.####....',
  '....####.#...##.',
  '.##...#########.',
  '.#####..#.####..',
  '..#####.#..##...',
  '...######.......',
  '.....####.......',
  '.......##.......',
  '.......##.......',
];
export function cutSprig(ctx, x, y, size) {
  const step = size / 16;
  for (let row = 0; row < 16; row++)
    for (let col = 0; col < 16; col++)
      if (mask[row][col] === '.')
        ctx.clearRect(x + col * step, y + row * step, step, step);
}

// Sparse, outward-tilting fans. A world-cell seed keeps chunk rebuilds stable.
export function canopySprig(q, y, r, x, z, face, upper) {
  const variation = hash(q, y, r, 183 + face);
  if (variation < 0.39) return null;
  const angle = (face * Math.PI) / 3 + (variation - 0.65) * 0.85;
  const nx = Math.cos(angle),
    nz = Math.sin(angle);
  const h = hash(q, y, r, 191 + face),
    skew = (h - 0.5) * 0.48;
  const root = 0.65,
    tip = 1.08 + 0.27 * h,
    width = 0.36 + 0.18 * variation;
  const rootY = y + (upper ? 0.94 : 0.67),
    tipY = rootY + (upper ? 0.15 + 0.26 * h : -0.33 - 0.2 * h);
  const point = (d, w, py) => [x + nx * d - nz * w, py, z + nz * d + nx * w];
  return [
    point(root, -width, rootY),
    point(root, width, rootY),
    point(tip, width + skew, tipY),
    point(tip, -width + skew, tipY),
  ];
}
