import { BLOCKS, DIRECTIONS, hash, hexDistance, key } from './core.js';

export function pigmentSupport(world, type, q, y, r) {
  const below = world.get(q, y - 1, r);
  if (type !== 'cactus')
    return ['grass', 'dirt', 'farmland', 'mossBlock'].includes(below);
  return (
    ['sand', 'cactus'].includes(below) &&
    DIRECTIONS.every(([dq, dr]) => {
      const neighbor = world.get(q + dq, y, r + dr);
      return (
        (!neighbor || BLOCKS[neighbor]?.nonSolid) &&
        world.fluids.get(q + dq, y, r + dr)?.type !== 'lava'
      );
    })
  );
}

export function stampPigments(world, cq, cr) {
  if (world.dimension !== 'overworld') return;
  const structures = world.structures(cq * 8 + 4, cr * 8 + 4, 24),
    villages = world.villages(cq * 8 + 4, cr * 8 + 4, 24);
  for (let q = cq * 8; q < cq * 8 + 8; q++)
    for (let r = cr * 8; r < cr * 8 + 8; r++) {
      const h = world.terrainHeight(q, r),
        roll = hash(q, h, r, world.seed + 1181),
        ground = world.get(q, h - 1, r);
      if (h < 8 || h > 56 || roll < 0.965) continue;
      if (
        [...structures, ...villages].some(
          (s) => hexDistance(q - s.q, r - s.r) < 16,
        )
      )
        continue;
      if (
        Array.from({ length: 7 }, (_, i) => world.get(q, h + i, r)).some(
          Boolean,
        )
      )
        continue;
      const cactus = ground === 'sand' && world.biome(q, r) === '沙漠';
      if (!cactus && ground !== 'grass') continue;
      if (
        cactus &&
        DIRECTIONS.some(([dq, dr]) => world.terrainHeight(q + dq, r + dr) > h)
      )
        continue;
      const type = cactus
        ? 'cactus'
        : hash(q, h, r, world.seed + 1182) < 0.5
          ? 'poppy'
          : 'dandelion';
      const height = cactus
        ? 1 + Math.min(2, Math.floor(hash(q, h, r, world.seed + 1183) * 3))
        : 1;
      for (let i = 0; i < height; i++) {
        const k = key(q, h + i, r);
        world.blocks.set(k, type);
        world.buildings.add(k);
      }
    }
}
