import { hexDistance } from './core.js';
import { END_FLOOR, END_PILLARS } from './end-data.js';

export function stampEndArena(world, cq, cr, record = false) {
  if (world.dimension !== 'end') return;
  const put = (q, y, r, block) => {
    if (Math.floor(q / 8) === cq && Math.floor(r / 8) === cr)
      world.set(q, y, r, block, record);
  };
  for (const p of END_PILLARS) {
    for (let dq = -1; dq <= 1; dq++)
      for (let dr = -1; dr <= 1; dr++) {
        if (hexDistance(dq, dr) > 1) continue;
        for (let y = END_FLOOR; y < END_FLOOR + p.height; y++)
          put(p.q + dq, y, p.r + dr, 'obsidian');
      }
    put(p.q, END_FLOOR + p.height, p.r, 'bedrock');
  }
  for (let q = -1; q <= 1; q++)
    for (let r = -1; r <= 1; r++)
      if (hexDistance(q, r) <= 1) put(q, END_FLOOR - 1, r, 'bedrock');
}
