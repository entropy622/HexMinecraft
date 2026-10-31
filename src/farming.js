import { PLANTS } from './farming-data.js';
import { BLOCKS, axialToWorld, hexDistance, key } from './core.js';
import { treeCells, megaTreeCells, megaTreeRoots } from './tree-layout.js';

export function nearWater(world, q, y, r, radius = 3) {
  for (let dq = -radius; dq <= radius; dq++)
    for (let dr = -radius; dr <= radius; dr++) {
      if (hexDistance(dq, dr) > radius) continue;
      for (const h of [y, y + 1])
        if (world.fluids.get(q + dq, h, r + dr)?.type === 'water') return true;
    }
  return false;
}
export function plantingIssue(world, kind, q, y, r) {
  const def = PLANTS[kind];
  if (!def.soil.includes(world.get(q, y, r)))
    return def.infernal
      ? '下界疣只能种在灵魂沙上。'
      : def.tree
        ? kind === 'spruceSapling'
          ? '云杉树苗需要泥土、草地或雪块。'
          : '树苗需要泥土或草地。'
        : def.perennial
          ? '甘蔗需要水边的泥土、草地或沙地。'
          : '先用锄头把土地翻耕。';
  if (y >= 62 || world.get(q, y + 1, r) || world.fluids.get(q, y + 1, r))
    return '先清理土地上方的空间和液体。';
  if (
    def.perennial &&
    (y + 3 >= 64 ||
      [2, 3].some(
        (h) => world.get(q, y + h, r) || world.fluids.get(q, y + h, r),
      ))
  )
    return '甘蔗上方需要三格生长空间。';
  if (kind === 'sugarCane' && !nearWater(world, q, y, r, 1))
    return '甘蔗旁的一格内需要水。可以用水桶灌溉。';
  return null;
}
export function growthConditions(
  world,
  plant,
  q,
  y,
  r,
  time,
  weather,
  columns,
  lights,
) {
  const def = PLANTS[plant.kind];
  if (def.infernal) return { rate: 1, reason: '灵魂沙滋养 · 无需光照与水' };
  if (
    def.perennial &&
    [2, 3].some((h) => world.get(q, y + h, r) || world.fluids.get(q, y + h, r))
  )
    return { rate: 0, reason: '上方生长空间被挡住' };
  const column = columns.get(world, q, r);
  const exposed = column.roof <= y + 1;
  const p = axialToWorld(q, r);
  const illuminated =
    (world.dimension === 'overworld' && exposed && time % 600 < 300) ||
    lights.some(
      (light) =>
        Math.hypot(
          light.position.x - p.x,
          light.position.y - y - 1,
          light.position.z - p.z,
        ) < 5,
    );
  if (!illuminated) return { rate: 0, reason: '等待日光 / 附近放置火把' };
  const raining =
    world.dimension === 'overworld' &&
    exposed &&
    !['沙漠', '雪原'].includes(column.biome) &&
    weather.rain > 0.2;
  const watered = nearWater(world, q, y, r, def.perennial ? 1 : 3);
  if (def.perennial && !watered) return { rate: 0, reason: '缺少邻接水源' };
  if (def.tree) return { rate: 1, reason: '正在生长' };
  if (raining) return { rate: 1.5, reason: '雨水滋养 · 150%' };
  return watered
    ? { rate: 1, reason: '已灌溉' }
    : { rate: 0.35, reason: '土地干燥 · 靠近水可加速' };
}
export function treePlan(world, q, y, r, occupied, species = 'oak') {
  const cells = treeCells(species, q, y + 1, r, world.seed);
  return clearTreePlan(world, cells, occupied) ? cells : null;
}
function clearTreePlan(world, cells, occupied) {
  if (
    cells.some(
      ([a, b, c]) =>
        b < 0 ||
        b >= world.maxY ||
        !world.loaded(a, c) ||
        world.persistentLeaves.has(key(a, b, c)) ||
        (world.get(a, b, c) &&
          world.get(a, b, c) !== 'vine' &&
          !BLOCKS[world.get(a, b, c)]?.foliage) ||
        world.fluids.get(a, b, c) ||
        occupied(a, b, c),
    )
  )
    return false;
  return true;
}

export function saplingGroup(crops, root) {
  const kind = crops.get(root)?.kind,
    species = PLANTS[kind]?.species;
  if (species !== 'spruce' && species !== 'jungle') return null;
  const [q, y, r] = root.split(',').map(Number),
    candidates = [];
  for (let rotation = 0; rotation < 3; rotation++) {
    for (const [dx, , dz] of megaTreeRoots(0, 0, 0, rotation)) {
      const a = q - dx,
        c = r - dz,
        roots = megaTreeRoots(a, y, c, rotation).map((p) => key(...p));
      if (roots.every((k) => crops.get(k)?.kind === kind))
        candidates.push({ q: a, y, r: c, rotation, roots });
    }
  }
  candidates.sort((a, b) => a.q - b.q || a.r - b.r || a.rotation - b.rotation);
  return candidates[0] || null;
}

// Plan first, then let the caller commit all roots and blocks together. A full
// group that cannot fit must not silently fall back to consuming one sapling.
export function saplingGrowthPlan(world, crops, root, occupied) {
  const def = PLANTS[crops.get(root)?.kind];
  if (!def?.tree) return null;
  const group = saplingGroup(crops, root),
    [q, y, r] = root.split(',').map(Number),
    roots = group?.roots || [root],
    rootSet = new Set(roots);
  if (
    roots.some((k) => {
      const [a, b, c] = k.split(',').map(Number);
      return !world.loaded(a, c) || !def.soil.includes(world.get(a, b, c));
    })
  )
    return null;
  const cells = group
    ? megaTreeCells(
        def.species,
        group.q,
        y + 1,
        group.r,
        world.seed,
        group.rotation,
      )
    : treeCells(def.species, q, y + 1, r, world.seed);
  if (
    !clearTreePlan(
      world,
      cells,
      (a, b, c) =>
        (crops.has(key(a, b - 1, c)) && !rootSet.has(key(a, b - 1, c))) ||
        occupied(a, b, c),
    )
  )
    return null;
  return { cells, roots, mega: !!group, species: def.species };
}
