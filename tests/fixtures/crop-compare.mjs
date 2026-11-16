// Dev helper: node tests/fixtures/crop-compare.mjs out.png x y w h scale a.png b.png ...
import { decode, encode } from 'fast-png';
import { readFileSync, writeFileSync } from 'node:fs';

const [out, x, y, w, h, scale, ...inputs] = process.argv.slice(2);
const [X, Y, W, H, S] = [x, y, w, h, scale].map(Number);
const images = inputs.map((p) => decode(readFileSync(p)));
const width = images.length * (W * S + 4) + 4,
  height = H * S + 8,
  data = new Uint8Array(width * height * 4).fill(30);
images.forEach((img, n) => {
  const c = img.channels;
  for (let j = 0; j < H * S; j++)
    for (let i = 0; i < W * S; i++) {
      const sx = X + Math.floor(i / S),
        sy = Y + Math.floor(j / S),
        s = (sy * img.width + sx) * c,
        d = ((j + 4) * width + 4 + n * (W * S + 4) + i) * 4;
      data.set([img.data[s], img.data[s + 1], img.data[s + 2], 255], d);
    }
});
writeFileSync(out, encode({ width, height, data, channels: 4 }));
