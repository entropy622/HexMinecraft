import { test, expect } from './browser-fixture.js';
import { readFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('production high-quality sky renders, toggles clouds through ordinary settings and preserves the native v16 scene', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
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
  const input = referenceSave(referenceScenes[0]);
  await page
    .locator('#save-file')
    .setInputFiles({
      name: 'forest.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(input)),
    });
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(page.locator('#quality')).toHaveValue('1.7');
  for (const enabled of [true, false, true]) {
    await page.locator('#clouds-toggle').setChecked(enabled);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    expect(
      await page.evaluate(() =>
        document.querySelector('#world').getContext('webgl2').getError(),
      ),
    ).toBe(0);
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const file = info.outputPath('forest-v16.json');
  await download.saveAs(file);
  const output = JSON.parse(await readFile(file, 'utf8'));
  expect(output.version).toBe(16);
  expect(output.time).toBe(input.time);
  expect(output.position).toEqual(input.position);
  expect(output.dimensions.overworld.edits).toEqual(
    input.dimensions.overworld.edits,
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('hexwild-settings')).post.clouds,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('production-cloud-controls.png'),
  });
  expect(messages).toEqual([]);
});
