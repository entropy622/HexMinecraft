import { TREES } from './wood-data.js';
import { WOOD_BUILDINGS } from './building-data.js';

const palettes = {};
for (const [species, label] of [
  ['oak', '橡木村落'],
  ['birch', '白桦村落'],
  ['spruce', '云杉村落'],
]) {
  const tree = TREES[species];
  palettes[species] = {
    label,
    ...WOOD_BUILDINGS[species],
    log: tree.log,
    planks: tree.planks,
    wall: tree.planks,
    roof: tree.planks,
    sapling: tree.sapling,
    foundation: 'brick',
  };
}
palettes.desert = {
  ...palettes.oak,
  label: '砂岩村落',
  wall: 'sandstone',
  roof: 'sandstone',
  log: 'strippedOakWood',
  foundation: 'sandstone',
};
export const villagePalette = (biome) =>
  palettes[
    biome === '白桦林'
      ? 'birch'
      : biome === '雪原'
        ? 'spruce'
        : biome === '沙漠'
          ? 'desert'
          : 'oak'
  ];
