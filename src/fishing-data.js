export const FISH_ITEMS = {
  rawCod: { name: '生鳕鱼', color: '#b4a580', use: true },
  cookedCod: { name: '烤鳕鱼', color: '#be9562', use: true },
  rawSalmon: { name: '生鲑鱼', color: '#c96f65', use: true },
  cookedSalmon: { name: '烤鲑鱼', color: '#d09273', use: true },
  tropicalFish: { name: '热带鱼', color: '#ed9b4d', use: true },
};

// A radius-two hexagon has 19 cells. Treasure requires two layers of still
// water and two clear cells above every column; tiny artificial pools yield fish.
export function fishingConditions(world, q, y, r, rain = 0) {
  const water = (a, b, c) => {
    const f = world.fluids.get(a, b, c);
    return f?.type === 'water' && !f.falling && f.level <= 2;
  };
  let open = true;
  for (let dq = -2; dq <= 2; dq++)
    for (let dr = -2; dr <= 2; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > 2) continue;
      const a = q + dq,
        c = r + dr;
      if (!water(a, y, c) || !water(a, y - 1, c)) open = false;
      for (let h = 1; h <= 2; h++)
        if (world.get(a, y + h, c) || world.fluids.get(a, y + h, c))
          open = false;
    }
  let sky = true;
  for (let h = y + 1; h < world.maxY; h++)
    if (world.get(q, h, r)) {
      sky = false;
      break;
    }
  const biome = world.biome(q, r);
  const wet =
    sky && !['雪原', '沙漠'].includes(biome) && world.dimension === 'overworld'
      ? rain
      : 0;
  return {
    open,
    sky,
    biome,
    rate: (sky ? 1 : 0.6) * (1 + wet * 0.4),
    raining: wet > 0.3,
  };
}

export function fishingLoot(conditions, random = Math.random) {
  const roll = random();
  if (roll < 0.05 && conditions.open) {
    const n = random();
    return {
      item:
        n < 0.4
          ? 'book'
          : n < 0.75
            ? 'emerald'
            : n < 0.95
              ? 'pearl'
              : 'diamond',
      category: '宝物',
    };
  }
  if (roll >= 0.9) {
    const junk = ['leather', 'string', 'bone', 'wood'];
    return { item: junk[Math.floor(random() * junk.length)], category: '杂物' };
  }
  const fishRoll = random();
  if (fishRoll < 0.12) return { item: 'pufferFish', category: '鱼获' };
  const n = (fishRoll - 0.12) / 0.88,
    cold = conditions.biome === '雪原',
    hot = conditions.biome === '沙漠';
  return {
    item:
      n < (cold ? 0.7 : 0.25)
        ? 'rawSalmon'
        : n > (hot ? 0.7 : 0.94)
          ? 'tropicalFish'
          : 'rawCod',
    category: '鱼获',
  };
}
