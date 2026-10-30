import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('Photon fixed-exposure defaults and saved adaptive choices work through ordinary settings UI', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const messages = { errors: [], warnings: [] },
    settings = structuredClone(referenceSettings);
  delete settings.post.exposure;
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript((settings) => {
    if (!localStorage.getItem('hexwild-settings'))
      localStorage.setItem('hexwild-settings', JSON.stringify(settings));
  }, settings);
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const check = async (enabled) => {
    if (enabled) await expect(page.locator('#exposure-toggle')).toBeChecked();
    else await expect(page.locator('#exposure-toggle')).not.toBeChecked();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__hexwild.graphics.composer.effects.exposure.enabled,
        ),
      )
      .toBe(enabled);
  };
  await check(false);
  const receipts = [];
  for (const enabled of [true, false]) {
    await page.locator('#exposure-toggle').setChecked(enabled);
    await check(enabled);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('hexwild-settings')).post.exposure,
      ),
    ).toBe(enabled);
    await page.locator('#home').click();
    await expect(page.locator('#start')).toBeVisible();
    await page.reload();
    await page.locator('#continue').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await check(enabled);
    receipts.push({
      enabled,
      persisted: await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('hexwild-settings')).post.exposure,
      ),
    });
  }
  await writeFile(
    info.outputPath('lighting-controls.json'),
    JSON.stringify({ defaultExposure: false, receipts, messages }, null, 2),
  );
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
