import { VINE_BLOCKS } from './vine-data.js';

// Original cutout pixel art; the gray pattern is tinted once into the atlas.
export function paintVine(ctx) {
  ctx.clearRect(0, 0, 16, 16);
  const pixel = (value, x, y, w = 1, h = 1) => {
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.fillRect(x, y, w, h);
  };
  for (let branch = 0; branch < 3; branch++) {
    const x = 2 + branch * 5;
    for (let y = 0; y < 16; y++) {
      const stem = x + Number((y + branch * 2) % 8 >= 4);
      pixel(112, stem, y);
      if ((y + branch) % 4 === 1) {
        const side = (y + branch) % 8 < 4 ? -1 : 1;
        pixel(178, stem + (side < 0 ? -3 : 1), y, 3, 2);
        pixel(235, stem + (side < 0 ? -2 : 1), y, 2, 1);
        pixel(145, stem + (side < 0 ? -2 : 1), y + 2, 2, 1);
      }
    }
  }
  const pixels = ctx.getImageData(0, 0, 16, 16),
    tint = VINE_BLOCKS.vine.leafTint
      .slice(1)
      .match(/../g)
      .map((s) => parseInt(s, 16));
  for (let i = 0; i < pixels.data.length; i += 4)
    for (let c = 0; c < 3; c++) pixels.data[i + c] *= tint[c] / 255;
  ctx.putImageData(pixels, 0, 0);
}
