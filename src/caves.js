import { DIRECTIONS, hash, hexDistance, key, noise } from './core.js';

const SPACING = 40;

// Each region owns a complete cave, including its walkable surface approach.
// Descriptors depend only on seed/terrain; stamping never reads a neighbour chunk.
export function cavesNear(world, q, r, range = 0) {
  if (world.dimension !== 'overworld') return [];
  const caves = [],
    reach = range + 26;
  for (
    let a = Math.floor((q - reach) / SPACING);
    a <= Math.floor((q + reach) / SPACING);
    a++
  )
    for (
      let b = Math.floor((r - reach) / SPACING);
      b <= Math.floor((r + reach) / SPACING);
      b++
    ) {
      const cq =
          a * SPACING + 18 + Math.floor(hash(a, 7, b, world.seed + 810) * 9),
        cr = b * SPACING + 18 + Math.floor(hash(a, 8, b, world.seed + 810) * 9),
        h = world.terrainHeight(cq, cr);
      if (
        hexDistance(cq, cr) < 24 ||
        h < 13 ||
        hexDistance(cq - q, cr - r) > reach
      )
        continue;
      if (
        world
          .villages(cq, cr, 44)
          .some((v) => hexDistance(v.q - cq, v.r - cr) < 44)
      )
        continue;
      if (
        world
          .structures(cq, cr, 32)
          .some((s) => hexDistance(s.q - cq, s.r - cr) < 32)
      )
        continue;
      const radius = 5 + Math.floor(hash(a, 11, b, world.seed + 810) * 3),
        rampStart = radius + 2,
        floor = Math.max(2, Math.min(6, h - 10)),
        first = Math.floor(hash(a, 9, b, world.seed + 810) * 6);
      let path = null;
      for (let turn = 0; turn < 6 && !path; turn++) {
        const direction = (first + turn) % 6,
          points = [{ q: cq, r: cr }];
        for (let i = 1; i <= 18; i++) {
          const [dq, dr] =
              DIRECTIONS[(direction + (i > 6 && i <= 11 ? 1 : 0)) % 6],
            p = points.at(-1);
          points.push({ q: p.q + dq, r: p.r + dr });
        }
        const end = points.at(-1),
          surface = world.terrainHeight(end.q, end.r);
        if (
          surface < 8 ||
          surface - 1 - floor > 18 - rampStart ||
          hexDistance(end.q, end.r) < 12
        )
          continue;
        const candidate = points.map((p, i) => ({
          ...p,
          floor: Math.round(
            floor +
              ((surface - 1 - floor) * Math.max(0, i - rampStart)) /
                (18 - rampStart),
          ),
        }));
        // Keep the approach underground until it breaks the hillside at its mouth.
        if (
          candidate.some(
            (p, i) => i < 16 && p.floor >= world.terrainHeight(p.q, p.r),
          )
        )
          continue;
        path = candidate;
      }
      if (!path) continue;
      const lush = hash(a, 10, b, world.seed + 810) > 0.48;
      caves.push({
        q: cq,
        r: cr,
        floor,
        radius,
        path,
        kind: lush ? 'lush' : 'limestone',
        name: lush ? '苔光溶洞' : '方解石溶洞',
      });
    }
  return caves;
}

export function caveColumn(cave, q, r) {
  const dq = q - cave.q,
    dr = r - cave.r,
    distance = Math.sqrt(dq * dq + dq * dr + dr * dr) / cave.radius;
  let floor = Infinity,
    ceiling = -Infinity;
  if (distance < 1) {
    floor =
      cave.floor +
      (distance > 0.6 && noise(q * 0.3, r * 0.3, cave.q + cave.r) > 0.6
        ? 1
        : 0);
    ceiling =
      floor +
      3 +
      Math.floor(Math.sqrt(1 - distance * distance) * 4) -
      Math.floor(noise(q * 0.35, r * 0.35, cave.q - cave.r) * 2);
  }
  for (const p of cave.path)
    if (hexDistance(p.q - q, p.r - r) <= 1) {
      floor = Math.min(floor, p.floor);
      ceiling = Math.max(ceiling, p.floor + 4);
    }
  return ceiling > floor ? { floor, ceiling } : null;
}

export function stampCaves(world, cq, cr) {
  const caves = cavesNear(world, cq * 8 + 4, cr * 8 + 4, 8);
  for (const cave of caves)
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++) {
        const column = caveColumn(cave, q, r);
        if (!column) continue;
        const { floor, ceiling } = column;
        // An unbroken foundation also prevents the old noise pockets from
        // turning the approach into pits. Bedrock is never touched.
        for (let y = Math.max(1, floor - 1); y <= floor; y++)
          world.blocks.set(
            key(q, y, r),
            cave.kind === 'lush' && y === floor ? 'mossBlock' : 'tuff',
          );
        for (let y = floor + 1; y <= ceiling; y++)
          world.blocks.delete(key(q, y, r));
        const roof = ceiling + 1;
        if (
          roof < world.terrainHeight(q, r) &&
          (!world.get(q, roof, r) ||
            ['gravel', 'sand'].includes(world.get(q, roof, r)))
        )
          world.blocks.set(key(q, roof, r), 'tuff');
        if (
          world.get(q, roof, r) &&
          hexDistance(q - cave.q, r - cave.r) <= cave.radius + 1
        ) {
          const patch = noise(q * 0.27, r * 0.27, world.seed + 812);
          if (patch > 0.4)
            world.blocks.set(
              key(q, roof, r),
              cave.kind === 'lush' ? 'mossBlock' : 'calcite',
            );
          // Sparse embedded crystals illuminate the chamber without filling
          // its route or replacing the naturally exposed ore walls.
          if (hash(q, roof, r, world.seed + 813) > 0.975)
            world.blocks.set(key(q, roof, r), 'crystal');
        }
        if (
          cave.kind === 'limestone' &&
          noise(q * 0.22, r * 0.22, world.seed + 814) > 0.48
        )
          world.blocks.set(key(q, floor, r), 'calcite');
        if (
          cave.kind === 'lush' &&
          world.get(q, roof, r) &&
          hexDistance(q - cave.q, r - cave.r) < cave.radius
        ) {
          const decoration = hash(q, roof, r, world.seed + 815);
          if (decoration > 0.975)
            world.blocks.set(key(q, ceiling, r), 'sporeBlossom');
          else if (decoration > 0.72) {
            const length = Math.min(
              ceiling - floor - 2,
              2 + (Math.floor(decoration * 11) % 4),
            );
            for (let i = 0; i < length; i++)
              world.blocks.set(
                key(q, ceiling - i, r),
                hash(q, ceiling - i, r, world.seed + 816) > 0.64
                  ? 'caveVinesBerries'
                  : 'caveVines',
              );
          }
        }
      }
  return caves;
}
