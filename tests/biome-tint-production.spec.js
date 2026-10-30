import { test, expect } from './browser-fixture.js';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { writeFile } from 'node:fs/promises';

test('production chooser accepts a palette-only ZIP, restores it after reload and resets native leaf icons', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const leaf = () =>
    page.locator('#hotbar button[data-slot="6"] .cut-icon image').first();
  const icon = () => leaf().getAttribute('href');
  const average = (url) =>
    page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const sums = [0, 0, 0];
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i + 3] > 128) {
          count++;
          for (let c = 0; c < 3; c++) sums[c] += data[i + c];
        }
      return sums.map((v) => v / count);
    }, url);
  await page.goto('/');
  await page.locator('#creative').click();
  const native = await icon();
  expect(native).toMatch(/^data:image\/png/);
  await page.keyboard.press('Escape');
  await page.locator('#material-pack-import').scrollIntoViewIfNeeded();
  const data = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([230, 80, 45, 255], i);
  const png = encode({ width: 256, height: 256, channels: 4, data });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#material-pack-import').click(),
  ]);
  await chooser.setFiles({
    name: 'production-biomes.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'assets/minecraft/textures/colormap/grass.png': png,
        'assets/minecraft/textures/colormap/foliage.png': png,
      }),
    ),
  });
  await expect(page.locator('#material-pack-status')).toContainText(
    'production-biomes.zip',
  );
  await expect(page.locator('#material-pack-status')).toContainText('16×');
  const packed = await icon(),
    before = await average(native),
    after = await average(packed);
  expect(before[1]).toBeGreaterThan(before[0]);
  expect(after[0]).toBeGreaterThan(after[1] * 1.3);
  await page.reload();
  await expect(page.locator('#material-pack-status')).toContainText(
    'production-biomes.zip',
  );
  await page.locator('#creative').click();
  expect(await icon()).toBe(packed);
  await page.keyboard.press('Escape');
  await page.locator('#material-pack-reset').scrollIntoViewIfNeeded();
  await page.locator('#material-pack-reset').click();
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  expect(await icon()).toBe(native);
  await page.screenshot({ path: info.outputPath('palette-only-reset.png') });
  await writeFile(
    info.outputPath('palette-only.json'),
    JSON.stringify({ before, after, restored: true, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
