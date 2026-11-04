import { BLOCKS } from './core.js';
import { isGlass } from './dye-data.js';

// Original pixel work for native hex shapes and media absent from the pack.
// Full opaque facet tiles remain opaque; shape/SSS/emission masks stay separate.
export function paintNativeSupplement(c, id, top) {
  const fill = (color, x, y, w = 1, h = 1) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const base = (color) => {
    c.clearRect(0, 0, 16, 16);
    fill(color, 0, 0, 16, 16);
  };
  if (isGlass(id)) {
    const rgb = BLOCKS[id].color
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    const shade = (amount) =>
      `rgb(${rgb.map((v) => Math.round(v + (255 - v) * amount)).join(',')})`;
    base(BLOCKS[id].color);
    fill(shade(0.3), 0, 0, 16, 1);
    fill(shade(0.3), 0, 0, 1, 16);
    fill(shade(0.1), 15, 1, 1, 15);
    fill(shade(0.1), 1, 15, 14, 1);
    for (const [x, y] of [
      [3, 5],
      [4, 4],
      [5, 3],
      [10, 12],
      [11, 11],
    ])
      fill(shade(0.65), x, y);
    return true;
  }
  if (id === 'cactus') {
    base(top ? '#668e3f' : '#527c33');
    if (top) {
      for (let i = 2; i < 7; i += 2) {
        c.strokeStyle = i === 2 ? '#395b27' : '#94ae5d';
        c.strokeRect(i + 0.5, i + 0.5, 15 - i * 2, 15 - i * 2);
      }
      fill('#b2bf77', 7, 7, 2, 2);
    } else {
      for (let x = 1; x < 16; x += 4) {
        fill('#365d2a', x, 0, 1, 16);
        fill('#789b46', x + 1, 0, 1, 16);
      }
      for (let y = 2; y < 16; y += 5)
        for (let x = 2; x < 16; x += 5) fill('#bdc894', x, y, 1, 2);
    }
    return true;
  }
  if (id === 'mossBlock') {
    base('#607d38');
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const patch = (Math.floor(x / 3) * 7 + Math.floor(y / 3) * 11) % 9;
        if (patch < 3) fill('#526b31', x, y);
        else if (patch > 6) fill('#78934b', x, y);
        if ((x * 11 + y * 7) % 23 === 0) fill('#97aa5b', x, y);
      }
    return true;
  }
  if (id === 'caveVines' || id === 'caveVinesBerries') {
    base('#4b732f');
    fill('#628a3e', 7, 0, 2, 16);
    for (let y = 1; y < 16; y += 4) {
      const x = y % 8 === 1 ? 1 : 9;
      fill('#6e9847', x, y, 6, 3);
      fill('#85aa55', x + 1, y, 4, 1);
      fill('#375b27', x + 1, y + 2, 4, 1);
    }
    return true;
  }
  if (id === 'sporeBlossom') {
    base('#b45c85');
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.abs(x - 7.5);
        if (d < 3 + y * 0.12) fill('#d980a1', x, y);
        if ((x + y) % 7 === 0) fill('#e7a3b8', x, y);
      }
    return true;
  }
  if (
    [
      'smallAmethystBud',
      'mediumAmethystBud',
      'largeAmethystBud',
      'amethystCluster',
      'crystal',
    ].includes(id)
  ) {
    const cyan = id === 'crystal';
    base(cyan ? '#4f9f90' : '#9771ba');
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const band = (x + Math.floor(y / 3)) % 8;
        if (band < 2) fill(cyan ? '#8edac3' : '#d7b7ec', x, y);
        else if (band > 5) fill(cyan ? '#367669' : '#6f4f94', x, y);
      }
    return true;
  }
  if (id === 'cauldron') {
    base('#4b535b');
    for (let x = 2; x < 16; x += 5) fill('#57616a', x, 1, 2, 14);
    fill('#79858b', 0, 0, 16, 1);
    fill('#29323a', 0, 15, 16, 1);
    for (const x of [2, 13]) {
      fill('#929b9e', x, 2);
      fill('#283039', x, 3);
    }
    return true;
  }
  return false;
}
