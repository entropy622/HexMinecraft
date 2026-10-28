import { DYE_ITEMS, PIGMENT_PLANTS } from './dye-data.js';

// Original 16px art, shared by atlas tiles and inventory/held item bitmaps.
export function paintPigment(c, id) {
  const def = DYE_ITEMS[id] || PIGMENT_PLANTS[id];
  if (!def) return false;
  const fill = (color, x, y, w, h) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  if (id === 'cactus') {
    fill(def.color, 0, 0, 16, 16);
    for (let x = 1; x < 16; x += 4) fill('#345426', x, 0, 1, 16);
    for (let y = 2; y < 16; y += 5)
      for (let x = 2; x < 16; x += 5) fill('#c2d39a', x, y, 1, 2);
  } else {
    c.clearRect(0, 0, 16, 16);
    if (PIGMENT_PLANTS[id]) {
      fill('#426c30', 7, 5, 2, 10);
      fill('#66933d', 3, 9, 5, 2);
      fill('#709d43', 9, 11, 4, 2);
      fill(def.color, 4, 2, 8, 5);
      fill(def.color, 6, 0, 4, 8);
      fill(id === 'poppy' ? '#442c26' : '#fff1a2', 7, 3, 2, 2);
    } else {
      fill('#4b3a30', 3, 10, 10, 4);
      fill(def.color, 4, 5, 8, 7);
      fill(def.color, 6, 3, 4, 3);
      fill('#ffffff99', 5, 5, 3, 2);
      fill('#00000033', 9, 8, 3, 3);
    }
  }
  return true;
}
