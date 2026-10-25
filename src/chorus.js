import { DIRECTIONS, hash, hexDistance, key } from './core.js';
import { isChorus, isChorusFlower } from './chorus-data.js';

const neighbors = (q, y, r) => [
  [q, y - 1, r],
  [q, y + 1, r],
  ...DIRECTIONS.map(([dq, dr]) => [q + dq, y, r + dr]),
];
const result = () => ({ changed: [], drops: [] });
function change(world, output, q, y, r, type) {
  world.set(q, y, r, type);
  world.chorus.delete(key(q, y, r));
  output.changed.push({ q, y, r, type });
}
function remove(world, output, q, y, r, direct = false) {
  const type = world.get(q, y, r);
  if (!isChorus(type)) return;
  change(world, output, q, y, r, null);
  const item = isChorusFlower(type)
    ? direct
      ? 'chorusFlower'
      : null
    : Math.random() < 0.5
      ? 'chorusFruit'
      : null;
  if (item) output.drops.push({ q, y, r, item, count: 1 });
}

// Keep a component when it reaches an unloaded edge: its root may be outside
// the simulation area. Edits are committed only after the whole search ends.
export function settleChorus(world, centers) {
  const output = result(),
    visited = new Set();
  for (const center of centers)
    for (const start of [center, ...neighbors(...center)]) {
      if (!isChorus(world.get(...start)) || visited.has(key(...start)))
        continue;
      const queue = [start],
        component = [];
      let supported = false,
        edge = false;
      for (let i = 0; i < queue.length; i++) {
        const [q, y, r] = queue[i],
          k = key(q, y, r);
        if (visited.has(k)) continue;
        visited.add(k);
        component.push([q, y, r]);
        supported ||= world.get(q, y - 1, r) === 'endstone';
        if (component.length >= 4096) {
          edge = true;
          break;
        }
        for (const next of neighbors(q, y, r)) {
          if (next[1] < 0 || next[1] >= 64) continue;
          if (!world.loaded(next[0], next[2])) {
            edge = true;
            continue;
          }
          if (isChorus(world.get(...next)) && !visited.has(key(...next)))
            queue.push(next);
        }
      }
      if (!supported && !edge)
        for (const point of component) remove(world, output, ...point);
      for (const point of component) {
        if (!supported && edge) world.chorusPending.add(key(...point));
        else world.chorusPending.delete(key(...point));
      }
    }
  return output;
}
export function harvestChorus(world, q, y, r, direct = true) {
  const output = result();
  remove(world, output, q, y, r, direct);
  const fallen = settleChorus(world, [[q, y, r]]);
  output.changed.push(...fallen.changed);
  output.drops.push(...fallen.drops);
  return output;
}

export function growChorus(world, dt, occupied) {
  const pending = [...world.chorusPending]
    .filter((k) => {
      const [q, , r] = k.split(',').map(Number);
      return world.loaded(q, r);
    })
    .slice(0, 24);
  for (const k of pending) world.chorusPending.delete(k);
  const output = settleChorus(
    world,
    pending.map((k) => k.split(',').map(Number)),
  );
  const clear = (q, y, r) =>
    y < 62 &&
    world.loaded(q, r) &&
    !world.get(q, y, r) &&
    !world.fluids.get(q, y, r) &&
    !occupied(q, y, r);
  for (const [k, growth] of [...world.chorus]) {
    const [q, y, r] = k.split(',').map(Number);
    if (!world.loaded(q, r)) continue;
    if (world.get(q, y, r) !== 'chorusFlower') {
      world.chorus.delete(k);
      continue;
    }
    growth.time += dt;
    if (growth.time < 20) continue;
    growth.time = 0;
    if (growth.stage >= 4 || world.chorus.size >= 4096) {
      change(world, output, q, y, r, 'chorusFlowerDead');
      continue;
    }
    const stage = growth.stage + 1,
      branches = [];
    const straight =
      clear(q, y + 1, r) &&
      (growth.stage === 0 || hash(q, y + stage * 137, r, world.seed) > 0.35);
    if (straight) branches.push([q, y + 1, r]);
    else {
      const turn = Math.min(5, Math.floor(hash(q, y + 991, r, world.seed) * 6));
      for (const direction of [turn, (turn + 2) % 6]) {
        const [dq, dr] = DIRECTIONS[direction],
          x = q + dq,
          z = r + dr;
        if (clear(x, y, z) && clear(x, y + 1, z)) branches.push([x, y + 1, z]);
      }
    }
    if (!branches.length) {
      change(world, output, q, y, r, 'chorusFlowerDead');
      continue;
    }
    change(world, output, q, y, r, 'chorusPlant');
    for (const [x, h, z] of branches) {
      if (x !== q || z !== r) change(world, output, x, h - 1, z, 'chorusPlant');
      change(world, output, x, h, z, 'chorusFlower');
      world.chorus.set(key(x, h, z), { stage, time: 0 });
    }
  }
  return output;
}

function treePlan(world, q, r, height) {
  const cells = [],
    turn = Math.min(5, Math.floor(hash(q, 871, r, world.seed) * 6));
  for (let y = 0; y < 4; y++) cells.push([q, height + y, r, 'chorusPlant']);
  cells.push([q, height + 4, r, 'chorusFlowerDead']);
  for (const direction of [turn, (turn + 2) % 6]) {
    const [dq, dr] = DIRECTIONS[direction],
      x = q + dq,
      z = r + dr;
    cells.push(
      [x, height + 3, z, 'chorusPlant'],
      [x, height + 4, z, 'chorusPlant'],
    );
    const reach = hash(q, direction + 127, r, world.seed) > 0.5;
    if (reach)
      cells.push(
        [x + dq, height + 4, z + dr, 'chorusPlant'],
        [x + dq, height + 5, z + dr, 'chorusFlowerDead'],
      );
    else cells.push([x, height + 5, z, 'chorusFlowerDead']);
  }
  return cells;
}
function site(world, q, r) {
  const h = world.terrainHeight(q, r);
  if (h < 10 || hexDistance(q, r) < 26) return null;
  if (
    DIRECTIONS.some(
      ([dq, dr]) => world.terrainHeight(q + dq * 2, r + dr * 2) > h + 1,
    )
  )
    return null;
  if (
    world.structures(q, r, 0).some((s) => {
      if (s.kind === 'endcity')
        return (
          hexDistance(q - s.q, r - s.r) < 20 ||
          (s.city.ship && hexDistance(q - s.city.ship.q, r - s.city.ship.r) < 9)
        );
      return hexDistance(q - s.q, r - s.r) < (s.kind === 'endship' ? 9 : 8);
    })
  )
    return null;
  return h;
}
export function stampChorus(world, cq, cr) {
  if (world.dimension !== 'end') return;
  const roots = [[43, -21]];
  for (
    let x = Math.floor((cq * 8 - 2) / 7);
    x <= Math.floor((cq * 8 + 9) / 7);
    x++
  )
    for (
      let z = Math.floor((cr * 8 - 2) / 7);
      z <= Math.floor((cr * 8 + 9) / 7);
      z++
    ) {
      const q = x * 7 + Math.floor(hash(x, 148, z, world.seed) * 3),
        r = z * 7 + Math.floor(hash(x, 149, z, world.seed) * 3);
      if (hash(q, 150, r, world.seed) < 0.6) continue;
      if (hexDistance(q - 43, r + 21) < 5) continue;
      roots.push([q, r]);
    }
  for (const [q, r] of roots) {
    if (q < cq * 8 - 2 || q > cq * 8 + 9 || r < cr * 8 - 2 || r > cr * 8 + 9)
      continue;
    const h = site(world, q, r);
    if (h === null) continue;
    for (const [x, y, z, type] of treePlan(world, q, r, h)) {
      if (Math.floor(x / 8) !== cq || Math.floor(z / 8) !== cr) continue;
      const k = key(x, y, z);
      world.blocks.set(k, type);
      world.buildings.add(k);
      world.chorusPending.add(k);
    }
  }
}
