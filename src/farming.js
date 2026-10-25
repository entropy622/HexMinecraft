import { PLANTS } from './farming-data.js';
import { axialToWorld, hexDistance } from './core.js';

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
    return def.tree
      ? '树苗需要泥土或草地。'
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
export function treePlan(world, q, y, r, occupied) {
  if (y + 6 >= 64) return null;
  const cells = [];
  for (let h = 1; h <= 4; h++) cells.push([q, y + h, r, 'wood']);
  for (let dq = -2; dq <= 2; dq++)
    for (let dr = -2; dr <= 2; dr++)
      for (let h = 5; h <= 6; h++)
        if (hexDistance(dq, dr) <= (h === 5 ? 2 : 1))
          cells.push([q + dq, y + h, r + dr, 'leaves']);
  if (
    cells.some(
      ([a, b, c, type]) =>
        !world.loaded(a, c) ||
        (world.get(a, b, c) &&
          !(type === 'leaves' && world.get(a, b, c) === 'leaves')) ||
        world.fluids.get(a, b, c) ||
        occupied(a, b, c),
    )
  )
    return null;
  return cells;
}
