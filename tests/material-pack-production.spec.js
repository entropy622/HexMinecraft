import { test, expect } from './browser-fixture.js';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { readFile } from 'node:fs/promises';

test('built production UI imports a ZIP through its chooser and keeps v16 world export intact', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error' || /GL_INVALID|Shader Error/.test(e.text()))
      errors.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.locator('#material-pack-import').scrollIntoViewIfNeeded();
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([150, 110, 70, 255], i);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#material-pack-import').click(),
  ]);
  await chooser.setFiles({
    name: 'production-blocks.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'assets/minecraft/textures/block/stone.png': encode({
          width: 16,
          height: 16,
          data,
          channels: 4,
        }),
      }),
    ),
  });
  await expect(page.locator('#material-pack-status')).toContainText(
    'production-blocks.zip',
  );
  await expect(
    page.locator('#hotbar button[data-slot="1"] .cut-icon'),
  ).toHaveCount(1);
  const stored = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('hexwild-material-pack', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            get = db.transaction('packs').objectStore('packs').get('active');
          get.onsuccess = () => {
            resolve(get.result?.name);
            db.close();
          };
          get.onerror = () => {
            reject(get.error);
            db.close();
          };
        };
      }),
  );
  expect(stored).toBe('production-blocks.zip');
  await page.screenshot({ path: info.outputPath('material-pack-menu.png') });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const savePath = info.outputPath('world-v16.json');
  await download.saveAs(savePath);
  expect(JSON.parse(await readFile(savePath, 'utf8')).version).toBe(16);
  await page.locator('#material-pack-reset').click();
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  expect(errors).toEqual([]);
});
