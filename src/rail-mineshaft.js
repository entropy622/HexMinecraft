import { DIRECTIONS, key } from './core.js';
import { newChest } from './chests.js';
export function seedMineRails(world, carts, s) {
  const cells = [];
  if (world.structureFeatures.has('legacy-mine:' + s.id)) return cells;
  s.mine.paths.forEach(({ points, dir }, index) => {
    const run = points.slice(2, 6),
      tag = 'rail:' + s.id + ':' + index;
    if (
      run.length < 3 ||
      world.structureFeatures.has(tag) ||
      !run.every((p) => world.loaded(p.q, p.r))
    )
      return;
    world.structureFeatures.add(tag);
    if (
      run.some(
        (p) =>
          [[0, 0], ...DIRECTIONS].some(([dq, dr]) =>
            [p.floor, p.floor + 1, p.floor + 2, p.floor + 3].some((y) =>
              world.edits.has(key(p.q + dq, y, p.r + dr)),
            ),
          ) ||
          world.get(p.q, p.floor, p.r) !== 'planks' ||
          world.get(p.q, p.floor + 1, p.r),
      )
    )
      return;
    const changed = [];
    for (const p of run) {
      const loc = [p.q, p.floor + 1, p.r];
      world.set(...loc, 'rail');
      world.setState(...loc, {
        facing: dir,
        open: false,
        track: [dir, (dir + 3) % 6],
      });
      changed.push(loc);
    }
    if (!world.structureFeatures.has('cart:' + s.id)) {
      world.structureFeatures.add('cart:' + s.id);
      carts.spawn(
        changed[1],
        'chestCart',
        dir,
        world,
        tag,
        newChest({ rail: 5, coal: 3, rawIron: 2 }),
      );
    }
    cells.push(...changed);
  });
  return cells;
}
