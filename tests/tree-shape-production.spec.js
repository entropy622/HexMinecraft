import { test, expect } from './browser-fixture.js';
import { readFile } from 'node:fs/promises';

test('production UI round-trips the real grown-tree export without losing branch axes or player edits', async ({
  page,
}, info) => {
  test.skip(
    !process.env.TREE_SHAPE_SAVE,
    'Supply the preceding gameplay export through TREE_SHAPE_SAVE',
  );
  const input = JSON.parse(await readFile(process.env.TREE_SHAPE_SAVE, 'utf8')),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.__hexwild)).toBe('undefined');
  await page.evaluate(() => {
    const hud = document.querySelector('#hud'),
      ready = new MutationObserver(() => {
        if (hud.classList.contains('hidden')) return;
        ready.disconnect();
        for (const type of ['keydown', 'keyup'])
          document.body.dispatchEvent(
            new KeyboardEvent(type, {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
            }),
          );
      });
    ready.observe(hud, { attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('#save-file').setInputFiles(process.env.TREE_SHAPE_SAVE);
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const file = info.outputPath('round-trip-v16.json');
  await download.saveAs(file);
  const output = JSON.parse(await readFile(file, 'utf8'));
  expect(output.version).toBe(16);
  expect(output.dimensions.overworld.edits).toEqual(
    input.dimensions.overworld.edits,
  );
  expect(output.dimensions.overworld.blockStates).toEqual(
    input.dimensions.overworld.blockStates,
  );
  expect(output.time).toBe(input.time);
  expect(output.position).toEqual(input.position);
  expect(
    output.dimensions.overworld.blockStates.some(([, s]) => s.axis > 0),
  ).toBe(true);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('production-grown-tree.png') });
  expect(errors).toEqual([]);
});
