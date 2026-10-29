import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('natural forest lighting provenance at a fixed native camera', async ({
  page,
}, info) => {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => {
    window.__photonFreeze = true;
  });
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  const first = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(first + 120);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest.png') });
  const result = await page.evaluate(async () => {
    const { readForestLighting } =
      await import('/tests/fixtures/forest-lighting-probe.js');
    return readForestLighting(window.__hexwild.graphics);
  });
  for (const map of result.maps) {
    await writeFile(
      info.outputPath(`${map.name}.png`),
      Buffer.from(map.png, 'base64'),
    );
    delete map.png;
  }
  await writeFile(
    info.outputPath('lighting.json'),
    JSON.stringify({ result, messages }, null, 2),
  );
  expect(result.leafPixels).toBeGreaterThan(100);
  expect(result.restored).toBe(true);
  expect(result.gl).toBe(0);
  for (const m of result.maps) if (m.stats) expect(m.stats.finite).toBe(true);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
  // Keep the fixed-exposure comparison above intact. Also observe the shipped
  // default adaptation, which referenceSettings intentionally disables.
  const adaptAt = await page.evaluate(async () => {
    const { DEFAULT_POST_SETTINGS } = await import('/src/render-settings.js');
    window.__hexwild.graphics.setPostOptions({
      exposure: DEFAULT_POST_SETTINGS.exposure,
    });
    return window.__photonProbe.rendered;
  });
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 60000,
    })
    .toBeGreaterThanOrEqual(adaptAt + 16);
  const adapted = await page.evaluate(async () => {
    const { readForestExposure } =
      await import('/tests/fixtures/forest-lighting-probe.js');
    return readForestExposure(window.__hexwild.graphics);
  });
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('default-exposure.png') });
  await writeFile(
    info.outputPath('default-exposure.json'),
    JSON.stringify({ adapted, messages }, null, 2),
  );
  expect(adapted.enabled).toBe(true);
  expect(adapted.ready).toBe(true);
  expect(adapted.exposure).toBeGreaterThanOrEqual(0.72);
  expect(adapted.exposure).toBeLessThanOrEqual(2.8);
  expect(adapted.gl).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
