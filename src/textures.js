import * as THREE from 'three';
import { BLOCKS, hash } from './core.js';

// Original 16px artwork, generated deterministically. Wide gutters prevent color bleeding between mipmapped tiles.
// No Minecraft assets are redistributed. The atlas is shared by all chunk meshes.
const SIZE = 16,
  CELL = 32,
  PAD = 8,
  COLS = 8;
export function createTextures() {
  const names = Object.keys(BLOCKS).flatMap((id) => [
    id + ':top',
    id + ':side',
  ]);
  names.push('water', 'lava', 'tuft', 'flower');
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL;
  canvas.height = Math.ceil(names.length / COLS) * CELL;
  const ctx = canvas.getContext('2d');
  const tiles = new Map();
  const palette = {
    grass: ['#5b9637', '#79553a'],
    dirt: ['#91633e', '#91633e'],
    stone: ['#858585', '#858585'],
    sand: ['#dbc58a', '#dbc58a'],
    wood: ['#b68b52', '#6e4c2d'],
    leaves: ['#407c2b', '#407c2b'],
    planks: ['#ba9158', '#ba9158'],
    coal: ['#777777', '#777777'],
    iron: ['#818181', '#818181'],
    diamond: ['#777e83', '#777e83'],
    crystal: ['#426f6a', '#426f6a'],
    brick: ['#8d918b', '#8d918b'],
    endstone: ['#d6d59b', '#d6d59b'],
    netherrack: ['#773333', '#773333'],
    basalt: ['#514c50', '#514c50'],
    obsidian: ['#30213f', '#30213f'],
    snow: ['#e4f2f5', '#dce9ee'],
    crimsonwood: ['#bb6972', '#703446'],
  };
  names.forEach((name, index) => {
    const tile = document.createElement('canvas');
    tile.width = tile.height = SIZE;
    const c = tile.getContext('2d');
    const [id, face] = name.split(':');
    const top = face === 'top';
    const base =
      palette[id]?.[top ? 0 : 1] ||
      BLOCKS[id]?.[top ? 'color' : 'side'] ||
      '#ffffff';
    const fill = (color, x, y, w = 1, h = 1) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    };
    const rand = (x, y, s = 0) => hash(x + index * 29, y, s, 581);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const color = new THREE.Color(base);
        color.multiplyScalar(0.86 + Math.floor(rand(x, y) * 5) * 0.065);
        fill('#' + color.getHexString(), x, y);
      }
    if (id === 'grass' && !top) {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 3 + Math.floor(rand(x, 0) * 4); y++)
          fill(
            ['#528531', '#659b3d', '#477729'][Math.floor(rand(x, y) * 3)],
            x,
            y,
          );
    }
    if (['wood', 'crimsonwood'].includes(id)) {
      if (top) {
        for (let i = 1; i < 8; i += 2) {
          c.strokeStyle = i % 4 === 1 ? '#68472e' : '#d2a56c';
          c.lineWidth = 1;
          c.strokeRect(i + 0.5, i + 0.5, 15 - 2 * i, 15 - 2 * i);
        }
        fill('#68472e', 7, 7, 2, 2);
      } else {
        for (let x = 1; x < 16; x += 3) {
          fill(id === 'wood' ? '#49351f' : '#492335', x, 0, 1, 16);
          for (let y = 1; y < 16; y += 5)
            fill(id === 'wood' ? '#ad8150' : '#c06e7a', x + 1, y, 1, 3);
        }
      }
    }
    if (['planks', 'workbench', 'chest', 'bed'].includes(id)) {
      for (let y = 3; y < 16; y += 4) {
        fill('#634727', 0, y, 16, 1);
        fill('#d5b37b', 0, y + 1, 16, 1);
        fill('#785331', (y * 3) % 15, y - 3, 1, 3);
      }
      if (id === 'workbench') {
        if (top) {
          for (let a = 3; a < 16; a += 5) {
            fill('#493628', a, 1, 1, 14);
            fill('#493628', 1, a, 14, 1);
          }
        } else {
          fill('#493628', 1, 1, 2, 15);
          fill('#493628', 13, 1, 2, 15);
          fill('#c4b9a2', 6, 5, 5, 2);
          fill('#4d3527', 8, 7, 1, 5);
        }
      }
      if (id === 'chest') {
        fill('#47311e', 0, 0, 16, 2);
        fill('#47311e', 0, 14, 16, 2);
        fill('#47311e', 0, 0, 2, 16);
        fill('#47311e', 14, 0, 2, 16);
        if (!top) {
          fill('#47311e', 0, 7, 16, 2);
          fill('#ead386', 7, 6, 3, 5);
          fill('#85632e', 8, 8, 1, 2);
        }
      }
      if (id === 'bed') {
        fill('#a33b32', 1, top ? 5 : 1, 14, top ? 11 : 10);
        if (top) fill('#eee7cf', 1, 1, 14, 4);
      }
    }
    if (
      [
        'stone',
        'brick',
        'furnace',
        'basalt',
        'endstone',
        'obsidian',
        'netherrack',
      ].includes(id)
    ) {
      for (let y = 0; y < 16; y += 4)
        for (let x = 0; x < 16; x += 6) {
          const xx = (x + (y % 8 ? 3 : 0)) % 16;
          fill(
            id === 'netherrack'
              ? '#502729'
              : id === 'obsidian'
                ? '#181523'
                : id === 'endstone'
                  ? '#aaa777'
                  : '#616261',
            xx,
            y,
            4,
            1,
          );
          if (id === 'brick' || id === 'furnace') fill('#555754', xx, y, 1, 4);
        }
      if (id === 'furnace' && !top) {
        fill('#343634', 3, 3, 10, 4);
        fill('#242624', 3, 10, 10, 4);
        fill('#d66c26', 5, 11, 6, 2);
        fill('#f3b247', 7, 10, 2, 3);
      }
    }
    if (['coal', 'iron', 'diamond', 'crystal', 'glowstone'].includes(id)) {
      const ore = {
        coal: ['#262729', '#393a3d'],
        iron: ['#c69779', '#e0b599'],
        diamond: ['#38bbc9', '#a0f4ee'],
        crystal: ['#57ba9f', '#b2ffe2'],
        glowstone: ['#ca9440', '#fff1a7'],
      }[id];
      for (let i = 0; i < 9; i++) {
        const x = Math.floor(rand(i, 1) * 14),
          y = Math.floor(rand(i, 2) * 14);
        fill(ore[0], x, y, 2, 3);
        fill(ore[1], x, y, 2, 1);
      }
    }
    if (id === 'leaves')
      for (let i = 0; i < 35; i++) {
        const x = Math.floor(rand(i, 1) * 16),
          y = Math.floor(rand(i, 2) * 16);
        fill('#345d26', x, y, 2, 2);
        fill('#5c893b', x, y, 1, 1);
      }
    if (id === 'shroom')
      for (let i = 0; i < 9; i++)
        fill(
          '#ffe1b4',
          Math.floor(rand(i, 1) * 15),
          Math.floor(rand(i, 2) * 15),
          2,
          2,
        );
    if (id === 'farmland')
      for (let x = 1; x < 16; x += 4) {
        fill('#38291e', x, 0, 2, 16);
        fill('#97724a', x + 2, 0, 1, 16);
      }
    if (id === 'glass') {
      c.clearRect(0, 0, 16, 16);
      fill('#bce4ef', 0, 0, 16, 16);
      c.strokeStyle = '#e4f7ff';
      c.strokeRect(0.5, 0.5, 15, 15);
      for (let i = 3; i < 10; i++) fill('#ffffff', i, 13 - i);
    }
    if (id === 'lantern') {
      fill('#493925', 0, 0, 16, 2);
      fill('#493925', 0, 14, 16, 2);
      fill('#493925', 0, 0, 2, 16);
      fill('#493925', 14, 0, 2, 16);
      fill('#fff0ab', 5, 4, 6, 8);
      fill('#fffbd8', 7, 5, 2, 6);
    }
    if (id === 'water' || id === 'lava') {
      fill(id === 'water' ? '#3975be' : '#d94813', 0, 0, 16, 16);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const v =
            Math.sin(x * 0.8 + Math.sin(y * 0.7) * 2) +
            Math.cos(y * 0.9 - x * 0.3);
          if (v > 0.9) fill(id === 'water' ? '#669ed6' : '#ffc334', x, y);
          else if (v < -0.8) fill(id === 'water' ? '#2e60a6' : '#aa2a0c', x, y);
        }
    }
    if (id === 'tuft' || id === 'flower') {
      c.clearRect(0, 0, 16, 16);
      for (let i = 0; i < 6; i++) {
        const x = 2 + i * 2,
          h = 4 + Math.floor(rand(i, 3) * 9);
        for (let y = 15; y > 15 - h; y--)
          fill(
            i % 2 ? '#619c35' : '#37732c',
            x + Math.floor((15 - y) / 5) * (i % 2 ? 1 : -1),
            y,
            2,
            1,
          );
      }
      if (id === 'flower') {
        fill('#3d822e', 8, 4, 1, 12);
        fill('#eee8ce', 5, 3, 7, 3);
        fill('#eee8ce', 7, 1, 3, 7);
        fill('#edc345', 7, 3, 3, 3);
      }
    }
    const ox = (index % COLS) * CELL + PAD,
      oy = Math.floor(index / COLS) * CELL + PAD;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, ox, oy);
    // Duplicate edges and corners through the padded area for minification.
    ctx.drawImage(tile, 0, 0, 16, 1, ox, oy - PAD, 16, PAD);
    ctx.drawImage(tile, 0, 15, 16, 1, ox, oy + 16, 16, PAD);
    ctx.drawImage(tile, 0, 0, 1, 16, ox - PAD, oy, PAD, 16);
    ctx.drawImage(tile, 15, 0, 1, 16, ox + 16, oy, PAD, 16);
    for (const [x, y] of [
      [0, 0],
      [15, 0],
      [0, 15],
      [15, 15],
    ])
      ctx.drawImage(
        tile,
        x,
        y,
        1,
        1,
        ox + (x ? 16 : -PAD),
        oy + (y ? 16 : -PAD),
        PAD,
        PAD,
      );
    tiles.set(name, { x: ox, y: oy, canvas: tile });
  });
  const setup = (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    return t;
  };
  const atlas = setup(new THREE.CanvasTexture(canvas));
  const uv = (name, u, v) => {
    const t = tiles.get(name);
    return [
      (t.x + 0.5 + u * 15) / canvas.width,
      1 - (t.y + 0.5 + (1 - v) * 15) / canvas.height,
    ];
  };
  const singles = new Map();
  const single = (name) => {
    if (!singles.has(name))
      singles.set(name, setup(new THREE.CanvasTexture(tiles.get(name).canvas)));
    return singles.get(name);
  };
  return { atlas, uv, single, canvas };
}
