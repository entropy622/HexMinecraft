import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('leaf depth prepass preserves native HDR and depth in wind, water capture and its guard band', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
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
  for (const size of [
    { width: 900, height: 650 },
    { width: 713, height: 509 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const t = window.__hexwild.graphics.composer.passes[0].target;
          return [t.width, t.height];
        }),
      )
      .toEqual([size.width, size.height]);
    const result = await page.evaluate(async () => {
      const { probeFoliageDepth } =
        await import('/tests/fixtures/foliage-depth-probe.js');
      return probeFoliageDepth(window.__hexwild.graphics);
    });
    await writeFile(
      info.outputPath(`foliage-depth-${size.width}x${size.height}.json`),
      JSON.stringify({ result, messages }, null, 2),
    );
    expect(result.pairs).toHaveLength(6);
    for (const row of result.pairs) {
      expect(row.differentColor, `${row.mode}/${row.target} HDR`).toBe(0);
      expect(row.differentDepth, `${row.mode}/${row.target} depth`).toBe(0);
    }
    expect(result.depthDraws).toBe(6);
    expect(result.final).toEqual(result.initial);
    expect(result.gl).toBe(0);
  }
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
