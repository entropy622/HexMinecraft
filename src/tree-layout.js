import { DIRECTIONS, hash, hexDistance, key } from './core.js';
import { TREES } from './wood-data.js';

// Shared by world generation and planted saplings. Trunks win over their own
// crowns, and every generated column is independent of chunk load order.
export function treeCells(species, q, base, r, seed = 1) {
  const tree = TREES[species] || TREES.oak,
    cells = new Map();
  const broadleaf = species === 'oak' || species === 'birch',
    branched = species === 'oak' && hash(q, 749, r, seed) > 0.82;
  const height =
    (branched ? 7 : tree.height) +
    (species === 'jungle'
      ? Math.floor(hash(q, 777, r, seed) * 5)
      : broadleaf
        ? Math.floor(hash(q, 777, r, seed) * 3)
        : species === 'spruce'
          ? Number(hash(q, 777, r, seed) > 0.5)
          : 0);
  const put = (dq, y, dr, type, axis = 0) => {
    const cell = [q + dq, base + y, r + dr, type];
    if (axis) cell.push(axis);
    cells.set(key(q + dq, base + y, r + dr), cell);
  };
  const branches = [];
  if (broadleaf) {
    // Four rounded rows with independently clipped hex corners. Keep the
    // footprint within the world's existing three-column generation halo.
    const crown = (cq, top, cr, wide) => {
      for (let row = -3; row <= 0; row++) {
        const radius = row < -1 && wide ? 2 : 1;
        for (let dq = -radius; dq <= radius; dq++)
          for (let dr = -radius; dr <= radius; dr++) {
            const distance = hexDistance(dq, dr),
              corner = !dq || !dr || dq === -dr,
              chance = row === 0 ? 0.55 : row === -3 ? 0.25 : corner ? 0.2 : 0;
            if (
              distance > radius ||
              hexDistance(cq + dq, cr + dr) > 3 ||
              (distance === radius &&
                hash(q + cq + dq, top + row + 811, r + cr + dr, seed) < chance)
            )
              continue;
            put(cq + dq, top + row, cr + dr, tree.leaves);
          }
      }
    };
    crown(0, height + 1, 0, true);
    if (branched) {
      const direction = Math.floor(hash(q, 823, r, seed) * 6);
      for (const [turn, drop] of [
        [0, 0],
        [2 + Number(hash(q, 829, r, seed) > 0.5), 1],
      ]) {
        const index = (direction + turn) % 6,
          [dq, dr] = DIRECTIONS[index],
          end = height - 2 - drop,
          axis = (index % 3) + 1;
        branches.push(
          [dq, end - 1, dr, axis],
          [dq, end, dr, 0],
          [dq * 2, end, dr * 2, axis],
        );
        crown(dq * 2, end + 2, dr * 2, false);
      }
    }
  } else if (species === 'jungle') {
    // A broad, layered evergreen crown above a clear, tall trunk.
    for (let y = height - 2; y <= height + 1; y++) {
      const radius = y === height + 1 ? 2 : 3;
      for (let dq = -radius; dq <= radius; dq++)
        for (let dr = -radius; dr <= radius; dr++)
          if (
            hexDistance(dq, dr) <= radius &&
            !(
              y === height - 2 &&
              hexDistance(dq, dr) === 3 &&
              hash(q + dq, y, r + dr, seed) < 0.3
            )
          )
            put(dq, y, dr, tree.leaves);
    }
  } else if (species === 'spruce') {
    for (let y = 2; y <= height; y++) {
      let radius = Math.min(2, Math.floor((height - y) / 2) + 1);
      if (y === height) radius = 0;
      else if (y % 2) radius = Math.max(0, radius - 1);
      for (let dq = -radius; dq <= radius; dq++)
        for (let dr = -radius; dr <= radius; dr++)
          if (hexDistance(dq, dr) <= radius) put(dq, y, dr, tree.leaves);
    }
  } else {
    for (let y = height - 1; y <= height + 1; y++) {
      const radius = y === height + 1 ? 1 : 2;
      for (let dq = -radius; dq <= radius; dq++)
        for (let dr = -radius; dr <= radius; dr++)
          if (hexDistance(dq, dr) <= radius) put(dq, y, dr, tree.leaves);
    }
  }
  for (const [dq, y, dr, axis] of branches) put(dq, y, dr, tree.log, axis);
  for (let y = 0; y < height; y++) put(0, y, 0, tree.log);
  return [...cells.values()];
}

// A 2x2 square becomes a four-cell rhombus on this grid. Three rotations cover
// every orientation without making the player align the planting with a compass.
export function megaTreeRoots(q, y, r, rotation = 0) {
  const a = DIRECTIONS[rotation],
    b = DIRECTIONS[rotation + 1];
  return [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([x, z]) => [q + x * a[0] + z * b[0], y, r + x * a[1] + z * b[1]]);
}

export function megaTreeCells(species, q, base, r, seed = 1, rotation = 0) {
  if (species !== 'jungle' && species !== 'spruce') return [];
  const tree = TREES[species],
    cells = new Map(),
    a = DIRECTIONS[rotation],
    b = DIRECTIONS[rotation + 1],
    roots = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    random = (salt) => hash(q, salt, r, seed),
    // Java 1.21.5 configured-feature trunk heights, with the host's seeded hash.
    height =
      (species === 'jungle' ? 10 : 13) +
      Math.floor(random(881) * 3) +
      Math.floor(random(883) * (species === 'jungle' ? 20 : 15));
  const put = (x, y, z, type, axis = 0) => {
    const point = [
      q + x * a[0] + z * b[0],
      base + y,
      r + x * a[1] + z * b[1],
      type,
    ];
    if (axis) point.push(axis);
    const k = key(...point.slice(0, 3));
    if (type === tree.leaves && cells.get(k)?.[3] === tree.log) return;
    cells.set(k, point);
  };
  const crown = (centres, top, radii, salt) => {
    radii.forEach((radius, row) => {
      const y = top - radii.length + 1 + row,
        lowX = Math.min(...centres.map((p) => p[0])) - radius,
        highX = Math.max(...centres.map((p) => p[0])) + radius,
        lowZ = Math.min(...centres.map((p) => p[1])) - radius,
        highZ = Math.max(...centres.map((p) => p[1])) + radius;
      for (let x = lowX; x <= highX; x++)
        for (let z = lowZ; z <= highZ; z++) {
          const distance = Math.min(
            ...centres.map(([cx, cz]) => hexDistance(x - cx, z - cz)),
          );
          if (
            distance > radius ||
            (radius > 0 &&
              distance === radius &&
              hash(q + x, salt + y, r + z, seed) <
                (row === radii.length - 1 ? 0.38 : 0.16))
          )
            continue;
          put(x, y, z, tree.leaves);
        }
    });
  };
  if (species === 'jungle') {
    crown(roots, height + 1, [3, 4, 3, 2, 1], 907);
    let branch = 0;
    for (
      let y = height - 2 - Math.floor(random(913) * 4);
      y > height / 2;
      y -= 2 + Math.floor(random(919 + branch) * 4)
    ) {
      const direction = Math.floor(random(911 + branch * 11) * 6),
        [dx, dz] = DIRECTIONS[direction],
        root = roots.reduce((best, p) =>
          2 * p[0] * dx + p[0] * dz + p[1] * dx + 2 * p[1] * dz >
          2 * best[0] * dx + best[0] * dz + best[1] * dx + 2 * best[1] * dz
            ? p
            : best,
        ),
        length = 3 + Math.floor(random(929 + branch) * 3),
        axis = ((direction + rotation) % 3) + 1;
      for (let step = 1; step <= length; step++) {
        const previousY = y - 3 + Math.floor((step - 1) / 2),
          nextY = y - 3 + Math.floor(step / 2);
        put(
          root[0] + dx * step,
          previousY,
          root[1] + dz * step,
          tree.log,
          axis,
        );
        if (nextY !== previousY)
          put(root[0] + dx * step, nextY, root[1] + dz * step, tree.log);
      }
      crown(
        [[root[0] + dx * length, root[1] + dz * length]],
        y,
        [2, 2, 1],
        937 + branch,
      );
      branch++;
    }
  } else {
    // Java's mega-pine and mega-spruce have short and long crowns respectively.
    const tall = random(941) < 0.5,
      depth = Math.min(
        height - 1,
        (tall ? 13 : 3) + Math.floor(random(947) * 5),
      );
    for (let offset = 0; offset <= depth; offset++) {
      const radius = Math.min(4, Math.floor((offset / depth) * 4.5)),
        whorl =
          offset > 2 && offset % 3 === 0 ? Math.max(1, radius - 1) : radius;
      crown(roots, height - offset, [whorl], 953);
    }
    put(0, height + 1, 0, tree.leaves);
  }
  // Trunks override their own crowns and branches. All four columns are real
  // blocks, so mining, axes, collision, cocoa and leaf support use existing rules.
  roots.forEach(([x, z], i) => {
    // GiantTrunkPlacer leaves only the first column at the last trunk level.
    for (let y = 0; y < height - Number(i > 0); y++) put(x, y, z, tree.log);
  });
  return [...cells.values()];
}
