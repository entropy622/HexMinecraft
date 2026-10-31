// Original 16px art, drawn locally. No vanilla or third-party image assets.
import { WOOD_BLOCKS } from './wood-data.js';

export function paintJungle(ctx, id, top = false) {
  const sapling = id === 'jungleSapling',
    leaves = id === 'jungleLeaves',
    log = id === 'jungleWood' || id === 'strippedJungleWood',
    stripped = id === 'strippedJungleWood',
    cocoa = /^cocoa[0-2]$/.test(id);
  if (!sapling && !leaves && !log && !cocoa && !id.startsWith('jungle'))
    return false;
  const pixel = (color, x, y, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  ctx.clearRect(0, 0, 16, 16);
  if (sapling) {
    pixel('#644931', 7, 6, 2, 10);
    pixel('#8b6c3b', 8, 8, 1, 7);
    for (const [x, y, w] of [
      [2, 4, 5],
      [5, 1, 7],
      [9, 5, 6],
      [1, 8, 5],
      [9, 10, 5],
    ]) {
      pixel('#2d602f', x, y + 1, w, 3);
      pixel('#518a36', x, y, w - 1, 2);
      pixel('#79ac45', x + 1, y, 2, 1);
    }
    return true;
  }
  // Keep leaf pigment neutral and bounded before tinting, like imported leaves.
  // Colored highlights above the declared tint would be amplified again later.
  const age = cocoa ? Number(id.at(-1)) : 0,
    colors = cocoa
      ? [
          ['#658c31', '#a5b44c', '#3e6229'],
          ['#b1a14c', '#d5bf69', '#80733a'],
          ['#bf702c', '#eca048', '#85491f'],
        ][age]
      : leaves
        ? ['#b2b2b2', '#e6e6e6', '#7d7d7d']
        : log
          ? top || stripped
            ? ['#ba8761', '#d5a37a', '#8e6044']
            : ['#71623e', '#938252', '#4b4b2e']
          : ['#b78460', '#d09a72', '#875c45'];
  pixel(colors[0], 0, 0, 16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = (x * 13 + y * 7 + x * y * 3) % 17;
      if (n < 4) pixel(colors[1], x, y);
      else if (n > 13) pixel(colors[2], x, y);
    }
  if (leaves) {
    for (let y = 1; y < 16; y += 4)
      for (let x = y % 3; x < 16; x += 5) {
        pixel('#ffffff', x, y, 3, 1);
        pixel('#6a6a6a', x + 1, y + 2, 2, 2);
      }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = WOOD_BLOCKS.jungleLeaves.leafTint;
    ctx.fillRect(0, 0, 16, 16);
    ctx.restore();
  } else if (cocoa) {
    for (let x = 2; x < 16; x += 4) {
      pixel(colors[2], x, 1, 1, 15);
      pixel(colors[1], x + 1, 2, 1, 12);
    }
    if (top) pixel('#6a6331', 6, 0, 4, 4);
  } else if (log && top) {
    for (let i = 1; i <= 6; i += 2) {
      ctx.strokeStyle = colors[2];
      ctx.lineWidth = 1;
      ctx.strokeRect(i + 0.5, i + 0.5, 15 - i * 2, 15 - i * 2);
    }
  } else if (log) {
    for (let x = 1; x < 16; x += 4) {
      pixel(colors[2], x, 0, 1, 16);
      for (let y = x % 3; y < 16; y += 5) {
        pixel(colors[1], x + 1, y, 2, stripped ? 4 : 2);
        if (!stripped) pixel('#586333', x - 1, y + 2, 2, 1);
      }
    }
  } else {
    for (let y = 3; y < 16; y += 4) {
      pixel('#78513e', 0, y, 16, 1);
      pixel('#d9a17a', 0, y + 1, 16, 1);
      pixel('#78513e', (y * 3) % 15, y - 3, 1, 3);
    }
    if (/Door/.test(id) && !top) {
      pixel('#744f3d', 2, 0, 1, 16);
      pixel('#744f3d', 13, 0, 1, 16);
      if (!id.endsWith('Top')) pixel('#dfbb70', 11, 5, 1, 2);
    }
  }
  return true;
}
