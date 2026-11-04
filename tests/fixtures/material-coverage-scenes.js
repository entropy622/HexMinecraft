import { World } from '../../src/world.js';
import { axialToWorld } from '../../src/core.js';
import { currentSave } from './current-save.js';
import { validateSave } from '../../src/save.js';

export function materialCoverageScene(kind) {
  const w = new World(624, 'overworld', { load: false });
  for (let q = -1; q <= 0; q++)
    for (let r = -1; r <= 0; r++) w.generateChunk(q, r);
  for (let q = -9; q <= 9; q++)
    for (let r = -7; r <= 8; r++)
      for (let y = 47; y <= 59; y++) w.set(q, y, r, y === 47 ? 'stone' : null);
  const samples =
    kind === 'workshop'
      ? [
          ['planks', 'birchPlanks', 'sprucePlanks', 'junglePlanks'],
          ['goldBlock', 'ironBlock', 'copperBlock', 'diamondBlock'],
          ['redWool', 'blueWool', 'greenWool', 'wool'],
        ]
      : [
          ['smoothBasalt', 'deepslate', 'tuff', 'calcite'],
          ['obsidian', 'amethystBlock', 'buddingAmethyst', 'mossBlock'],
          ['endstoneBricks', 'purpur', 'netherrack', 'soulSand'],
        ];
  samples.forEach((row, z) =>
    row.forEach((id, x) => {
      const q = -7 + x * 4,
        r = -5 + z * 4;
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++)
          for (let y = 48; y <= 49; y++) w.set(q + a, y, r + b, id);
    }),
  );
  if (kind === 'workshop') {
    for (let q = -9; q <= 9; q++) {
      for (let y = 48; y <= 52; y++)
        w.set(
          q,
          y,
          -7,
          y === 52
            ? 'brick'
            : q % 6 === 0
              ? 'wood'
              : y === 50 || y === 51
                ? 'glass'
                : 'brick',
        );
    }
    for (const [q, id] of [
      [-7, 'furnace'],
      [-3, 'smoker'],
      [1, 'blastFurnace'],
      [5, 'chest'],
    ])
      w.set(q, 50, -6, id);
    for (const [q, id] of [
      [-7, 'jungleFence'],
      [-3, 'birchFence'],
      [1, 'spruceFence'],
      [5, 'fence'],
    ])
      w.set(q, 48, 7, id);
  } else {
    for (let q = -9; q <= 9; q++)
      for (let y = 48; y <= 54; y++)
        w.set(
          q,
          y,
          -7,
          y < 50
            ? 'tuff'
            : q < -3
              ? 'calcite'
              : q < 4
                ? 'amethystBlock'
                : 'smoothBasalt',
        );
    for (const [q, id] of [
      [-7, 'smallAmethystBud'],
      [-3, 'mediumAmethystBud'],
      [1, 'largeAmethystBud'],
      [5, 'amethystCluster'],
    ]) {
      w.set(q, 50, -5, 'calcite');
      w.set(q, 51, -5, id);
    }
    for (const q of [-8, 8]) {
      w.set(q, 53, 1, 'mossBlock');
      w.set(q, 52, 1, 'caveVines');
      w.set(q, 51, 1, 'caveVinesBerries');
    }
  }
  const s = currentSave(w),
    eye = axialToWorld(0, 17),
    look = axialToWorld(0, -1);
  s.time = 70;
  s.creative = s.creativeFlying = true;
  s.position = [eye.x, 62, eye.z];
  s.yaw = Math.atan2(-(look.x - eye.x), -(look.z - eye.z));
  s.pitch = Math.atan2(
    49.5 - s.position[1],
    Math.hypot(look.x - eye.x, look.z - eye.z),
  );
  s.weather = {
    kind: 'clear',
    remaining: 3600,
    sequence: 0,
    rain: 0,
    storm: 0,
    wetness: 0,
  };
  validateSave(s);
  return s;
}
