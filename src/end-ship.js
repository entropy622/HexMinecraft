import { key } from './core.js';

export function stampEndShip(world, s, put) {
  const block = (q, y, r, type) => put(s.q + q, s.y + y, s.r + r, type);
  for (let q = -6; q <= 6; q++) {
    const width = Math.abs(q) > 4 ? 1 : Math.abs(q) > 2 ? 2 : 3;
    for (let r = -width; r <= width; r++) {
      for (let y = 0; y <= 14; y++) block(q, y, r, null);
      if (Math.abs(q) <= 4 && Math.abs(r) <= Math.max(0, width - 1))
        block(q, 0, r, 'purpur');
      if (Math.abs(r) < width) block(q, 1, r, 'purpur');
      block(q, 2, r, 'purpur');
      block(q, 3, r, 'purpur');
      if (Math.abs(r) === width || Math.abs(q) === 6)
        block(q, 4, r, 'purpurSlab');
    }
  }
  for (let q = -3; q <= -1; q++)
    for (let r = -1; r <= 1; r++) {
      for (let y = 4; y <= 6; y++) {
        const wall = q === -3 || r !== 0;
        block(
          q,
          y,
          r,
          wall ? (y === 5 && r !== 0 ? 'glass' : 'endstone') : null,
        );
      }
      block(q, 7, r, 'purpurSlab');
    }
  block(-2, 4, 0, 'chest');
  for (let y = 4; y <= 13; y++) block(1, y, 0, 'purpur');
  for (let r = -3; r <= 3; r++) block(1, 11, r, 'endstone');
  block(1, 14, 0, 'lantern');
  for (const q of [-5, 4]) for (const r of [-1, 1]) block(q, 5, r, 'lantern');
  for (let y = s.h; y <= s.y + 3; y++) {
    put(s.q - 6, y, s.r, 'purpur');
    if (put(s.q - 5, y, s.r, 'ladder'))
      world.naturalStates.set(key(s.q - 5, y, s.r), { facing: 3, open: false });
  }
}
