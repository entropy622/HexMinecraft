import { BLOCKS, DIRECTIONS, hash, hexDistance, key } from './core.js';
import { buildingParts } from './building-shapes.js';
import { partSpan } from './shape-columns.js';
import { HEX_POLYGON } from './cut-blocks.js';

// Java's legacy solidity is neither optical opacity nor a full collision face.
// Its explicit overrides include webs, fences/gates and pointed dripstone.
function cactusNeighborSolid(world, q, y, r) {
  const type = world.get(q, y, r),
    block = BLOCKS[type];
  if (!block) return false;
  if (
    ['cobweb', 'pointedDripstone'].includes(type) ||
    ['fence', 'gate'].includes(block.shape)
  )
    return true;
  if (block.nonSolid) return false;
  if (!block.shape) return true;
  const points = [];
  for (const part of buildingParts(world, q, y, r, true)) {
    const polygon = part.polygon || [
      [-part.w / 2, -part.d / 2],
      [part.w / 2, -part.d / 2],
      [part.w / 2, part.d / 2],
      [-part.w / 2, part.d / 2],
    ];
    for (const [x, z] of polygon)
      for (const h of [-part.h / 2, part.h / 2]) {
        const pitch = part.pitch || 0,
          scale = h > 0 ? (part.topScale ?? 1) : 1,
          px = x * scale,
          pz = z * scale * Math.cos(pitch) - h * Math.sin(pitch);
        points.push([
          part.x + px * Math.cos(part.angle) + pz * Math.sin(part.angle),
          part.y + h * Math.cos(pitch) + z * scale * Math.sin(pitch),
          part.z - px * Math.sin(part.angle) + pz * Math.cos(part.angle),
        ]);
      }
  }
  if (!points.length) return false;
  const spans = [0, 1, 2].map(
    (axis) =>
      Math.max(...points.map((p) => p[axis])) -
      Math.min(...points.map((p) => p[axis])),
  );
  // Normalize the two hex footprint axes to a one-block width before applying
  // the original average-bounds threshold (35/48) and full-height condition.
  return (
    spans[1] >= 1 ||
    (spans[0] / Math.sqrt(3) + spans[1] + spans[2] / 2) / 3 >= 35 / 48 - 1e-9
  );
}

export function pigmentSupport(world, type, q, y, r) {
  const below = world.get(q, y - 1, r);
  if (type === 'cactusFlower') {
    if (below === 'cactus' || below === 'farmland') return true;
    const block = BLOCKS[below];
    if (!block || block.nonSolid) return false;
    if (!block.shape) return true;
    const parts = buildingParts(world, q, y - 1, r, true);
    return [
      [0, 0],
      ...HEX_POLYGON.map(([x, z]) => [
        (x * Math.sqrt(3)) / 16,
        (z * Math.sqrt(3)) / 16,
      ]),
    ].every(([x, z]) =>
      parts.some((part) => {
        const span = partSpan(x, z, part);
        return span && span[0] < 1 && span[1] >= 1 - 1e-7;
      }),
    );
  }
  if (type !== 'cactus')
    return ['grass', 'dirt', 'farmland', 'mossBlock'].includes(below);
  return (
    ['sand', 'cactus'].includes(below) &&
    !world.fluids.get(q, y + 1, r) &&
    DIRECTIONS.every(([dq, dr]) => {
      return (
        !cactusNeighborSolid(world, q + dq, y, r + dr) &&
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
