import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('real reflection controls persist, release HDR mips and preserve choices across quality changes', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await expect(page.locator('#environment-reflections-toggle')).toBeChecked();
  await expect(page.locator('#sky-reflections-toggle')).toBeChecked();
  await expect(page.locator('#reflection-rays')).toHaveValue('4');
  await expect(page.locator('#reflection-steps')).toHaveValue('8');
  await page.evaluate(() => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      cells = [];
    api.setPlaying(false);
    for (let q = -2; q <= 2; q++)
      for (let r = -2; r <= 2; r++) {
        w.set(q, 49, r, 'ironBlock');
        cells.push([q, 49, r]);
        for (let y = 50; y < 64; y++) {
          w.set(q, y, r, null);
          cells.push([q, y, r]);
        }
      }
    g.updateCells(cells);
    api.teleport(0, 54, 5);
    g.stepOffset = 0;
    g.camera.position.set(0, 54, 9);
    g.camera.lookAt(0, 50, 0);
    g.camera.updateMatrixWorld();
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!window.__hexwild.graphics.composer.effects.wet.radiance.target,
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  await page.evaluate(() => {
    window.reflectionDisposed = false;
    window.__hexwild.graphics.composer.effects.wet.radiance.target.addEventListener(
      'dispose',
      () => {
        window.reflectionDisposed = true;
      },
    );
  });
  await page.locator('#reflection-rays').selectOption('1');
  await page.locator('#reflection-steps').selectOption('32');
  await page.locator('#environment-reflections-toggle').uncheck();
  await expect(page.locator('#reflection-steps')).toBeDisabled();
  expect(
    await page.evaluate(() => ({
      disposed: window.reflectionDisposed,
      target: !!window.__hexwild.graphics.composer.effects.wet.radiance.target,
    })),
  ).toEqual({ disposed: true, target: false });
  await expect(page.locator('#reflection-rays')).toBeEnabled();
  await page.locator('#sky-reflections-toggle').uncheck();
  await expect(page.locator('#reflection-rays')).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.graphics.composer.effects.wet.enabled,
      ),
    )
    .toBe(false);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('hexwild-settings')).post,
  );
  expect(saved.environmentReflections).toBe(false);
  expect(saved.skyReflections).toBe(false);
  expect(saved.reflectionRays).toBe(1);
  expect(saved.reflectionSteps).toBe(32);
  await page.reload();
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await expect(
    page.locator('#environment-reflections-toggle'),
  ).not.toBeChecked();
  await expect(page.locator('#sky-reflections-toggle')).not.toBeChecked();
  await expect(page.locator('#reflection-rays')).toHaveValue('1');
  await expect(page.locator('#reflection-steps')).toHaveValue('32');
  await page.locator('#quality').selectOption('1');
  await expect(page.locator('#environment-reflections-toggle')).toBeDisabled();
  expect(await page.evaluate(() => !!window.__hexwild.graphics.composer)).toBe(
    false,
  );
  await page.locator('#quality').selectOption('1.7');
  await expect(
    page.locator('#environment-reflections-toggle'),
  ).not.toBeChecked();
  await page.locator('#color-reset').click();
  await expect(
    page.locator('#environment-reflections-toggle'),
  ).not.toBeChecked();
  await expect(page.locator('#reflection-steps')).toHaveValue('32');
  await page.locator('#sky-reflections-toggle').check();
  await expect(page.locator('#reflection-rays')).toBeEnabled();
  await expect(page.locator('#reflection-steps')).toBeDisabled();
  expect(
    await page.evaluate(
      () => !!window.__hexwild.graphics.composer.effects.wet.radiance.target,
    ),
  ).toBe(false);
  await page.locator('#environment-reflections-toggle').check();
  await expect(page.locator('#reflection-steps')).toBeEnabled();
  await page
    .locator('#post-settings')
    .screenshot({ path: info.outputPath('reflection-settings.png') });
  await writeFile(
    info.outputPath('reflection-controls.json'),
    JSON.stringify({ saved, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

test('production HDR color mips preserve energy and filter checker frequencies', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  const result = await page.evaluate(async () => {
    window.__hexwild.setPlaying(false);
    const { probeReflectionMips } =
      await import('/tests/fixtures/reflection-mip-probe.js');
    return probeReflectionMips(window.__hexwild.graphics.renderer);
  });
  await writeFile(
    info.outputPath('hdr-mips.json'),
    JSON.stringify({ result, errors }, null, 2),
  );
  for (const level of result.levels) {
    expect(level.invalid).toBe(0);
    for (let c = 0; c < 3; c++)
      expect(Math.abs(level.mean[c] - [4, 2, 1][c])).toBeLessThan(0.001);
  }
  expect(result.levels[0].variance[0]).toBeGreaterThan(10);
  for (const row of result.levels.slice(1))
    expect(Math.max(...row.variance)).toBeLessThan(0.001);
  expect(result.resized).toEqual([63, 35]);
  for (let c = 0; c < 4; c++)
    expect(Math.abs(result.masked[c] - [0, 4, 2, 0.5][c])).toBeLessThan(0.001);
  expect(result.disposed).toBe(true);
  expect(result.released).toBe(true);
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
});
