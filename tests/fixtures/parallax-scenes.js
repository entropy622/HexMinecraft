import { World } from '../../src/world.js';
import { axialToWorld } from '../../src/core.js';
import { currentSave } from './current-save.js';
import { validateSave } from '../../src/save.js';

export const parallaxWalls = [
  'stone',
  'cobble',
  'brick',
  'planks',
  'wood',
  'mossybrick',
];

// Close, low-sun walls and floor in natural seed 624; a single camera keeps
// the POM on/off pair comparable.
export function parallaxScene({ time = 24 } = {}) {
  const w = new World(624, 'overworld', { load: false });
  for (let q = -1; q <= 0; q++)
    for (let r = -1; r <= 0; r++) w.generateChunk(q, r);
  for (let q = -10; q <= 10; q++)
    for (let r = -8; r <= 8; r++)
      for (let y = 47; y <= 60; y++)
        w.set(q, y, r, y === 47 ? (r > 2 ? 'stone' : 'cobble') : null);
  parallaxWalls.forEach((id, i) => {
    for (let q = -9 + i * 3; q < -6 + i * 3; q++)
      for (let y = 48; y <= 51; y++) w.set(q, y, -3, id);
  });
  for (let r = -2; r <= 4; r++)
    for (let y = 48; y <= 49; y++) w.set(-10, y, r, r % 2 ? 'brick' : 'cobble');
  const s = currentSave(w),
    eye = axialToWorld(-1, 4),
    look = axialToWorld(-2, -3);
  s.time = time;
  s.creative = s.creativeFlying = true;
  s.position = [eye.x, 50.2, eye.z];
  s.yaw = Math.atan2(-(look.x - eye.x), -(look.z - eye.z));
  s.pitch = Math.atan2(49.2 - 50.2, Math.hypot(look.x - eye.x, look.z - eye.z));
  s.weather = {
    kind: 'clear',
    remaining: 3600,
    sequence: 0,
    rain: 0,
    storm: 0,
    wetness: 0,
  };
  s.dimensions.overworld.position = [...s.position];
  validateSave(s);
  return s;
}
