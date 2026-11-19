// Axial coordinates. Both boards use the same dihedral group and origin-free recipes.
export const TABLE = [
  [-1, 0],
  [0, -1],
  [1, -1],
  [0, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
];
export const PERSONAL = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];
export const rotate = ([q, r]) => [-r, q + r];
export const reflect = ([q, r]) => [-q, q + r];
const boards = [TABLE, PERSONAL].map((points) => ({
  points,
  index: new Map(points.map((p, i) => [p.join(','), i])),
}));
export function* placements(pattern, size) {
  const { points, index } = boards[size === 4 ? 1 : 0],
    seen = new Set();
  const used = pattern.flatMap((v, i) => (v ? [{ v, p: TABLE[i] }] : []));
  for (const mirror of [false, true]) {
    let cells = used.map(({ v, p }) => ({ v, p: mirror ? reflect(p) : p }));
    for (let turn = 0; turn < 6; turn++) {
      for (const [q, r] of points) {
        const dq = q - cells[0].p[0],
          dr = r - cells[0].p[1],
          layout = Array(size).fill(null);
        if (
          !cells.every(({ v, p }) => {
            const i = index.get([p[0] + dq, p[1] + dr].join(','));
            if (i === undefined) return false;
            layout[i] = v;
            return true;
          })
        )
          continue;
        const key = layout.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          yield layout;
        }
      }
      cells = cells.map(({ p, v }) => ({ v, p: rotate(p) }));
    }
  }
}
