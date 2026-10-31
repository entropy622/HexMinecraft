import { referenceSave } from './photon-reference-scenes.js';
import { treeCells } from '../../src/tree-layout.js';

export function distantArchitectureSave() {
  const save = referenceSave({
    eye: [-177.5, 52, 54.5],
    look: [-157.5, 50, 54.5],
  });
  save.time = 120;
  const edits = new Map(),
    states = new Map(),
    put = (q, y, r, type, state) => {
      const key = `${q},${y},${r}`;
      edits.set(key, type);
      if (state) states.set(key, { facing: 0, open: false, ...state });
    };
  // A suspended room spans a data-tile boundary; its front opening is real air.
  for (let q = -94; q <= -82; q++)
    for (let r = 48; r <= 60; r++) {
      put(q, 46, r, 'stone');
      put(q, 54, r, 'planks');
      for (let y = 47; y < 54; y++) {
        if (
          (q !== -94 && q !== -82 && r !== 48 && r !== 60) ||
          (q === -94 && r >= 52 && r <= 56 && y <= 52)
        ) {
          put(q, y, r, null);
          continue;
        }
        put(
          q,
          y,
          r,
          q === -94 && r >= 49 && r <= 51 && y >= 49 && y <= 51
            ? 'blueStainedGlass'
            : 'planks',
        );
      }
    }
  put(-63, 60, 33, 'ironBlock');
  for (let r = 76; r <= 82; r++)
    for (let y = 58; y <= 62; y++) put(-80, y, r, 'redStainedGlass');
  for (let r = 61; r <= 69; r++) put(-83, 56, r, 'wood', { axis: 2 });
  for (let q = -81; q <= -75; q++)
    put(q, 55, 64, 'planksSlab', { upper: q % 2 === 0 });
  put(-74, 57, 65, null);
  save.dimensions.overworld.fluids = [
    ['-74,57,65', { type: 'water', source: true, level: 0, falling: false }],
  ];
  put(-85, 44, 37, 'grass');
  for (const [q, y, r, type, axis = 0] of treeCells('oak', -85, 45, 37, 624, {
    fancy: true,
  })) {
    if (y >= 64)
      throw Error('Architecture tree exceeds the real world ceiling');
    put(q, y, r, type, axis ? { axis } : undefined);
  }
  save.dimensions.overworld.edits = [...edits];
  save.dimensions.overworld.blockStates = [...states];
  return save;
}
