import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  oracleGrade,
  sourceColorDefaults,
} from './fixtures/photon-grading-oracle.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('real Photon output and direct-rendered materials match the pinned source color pipeline', async ({
  page,
}, info) => {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const hues = [
    [1, 0, 0],
    [1, 0.5, 0],
    [1, 1, 0],
    [0.5, 1, 0],
    [0, 1, 0],
    [0, 1, 0.5],
    [0, 1, 1],
    [0, 0.5, 1],
    [0, 0, 1],
    [0.5, 0, 1],
    [1, 0, 1],
    [1, 0, 0.5],
    [1, 1, 1],
    [0.2, 0.6, 0.13],
    [0.15, 0.28, 0.7],
  ];
  const colors = [
    ...[-8, -4, -2, 0, 2, 4, 8].flatMap((e) =>
      hues.map((c) => c.map((x) => x * 2 ** e)),
    ),
    [0, 0, 0],
    [-0.01, 0.002, -0.003],
    [65504, 65504, 65504],
    [1e-7, 1e-6, 0.008],
  ];
  const cases = [{ settings: {} }];
  for (const [key, range] of Object.entries({
    brightness: [0, 2],
    contrast: [0, 2],
    saturation: [0, 2],
    whiteBalance: [4000, 9000],
    orangeSaturation: [-0.5, 0.5],
    tealSaturation: [-0.5, 0.5],
    greenSaturation: [-0.5, 0.5],
    greenHue: [-8, 8],
  }))
    for (const value of range) cases.push({ settings: { [key]: value } });
  cases.push(
    {
      settings: {
        brightness: 1.34,
        contrast: 1.2,
        saturation: 1.13,
        whiteBalance: 5600,
        orangeSaturation: 0.2,
        tealSaturation: -0.1,
        greenSaturation: 0.3,
        greenHue: 4.6,
      },
    },
    { settings: {}, exposure: 0.2 },
    { settings: {}, exposure: 2 },
  );
  const result = await page.evaluate(
    async ({ colors, cases }) => {
      const { probePhotonGrading } =
        await import('/tests/fixtures/photon-grading-probe.js');
      return probePhotonGrading(window.__hexwild.graphics, colors, cases);
    },
    { colors, cases },
  );
  let maxError = 0,
    directError = 0,
    alphaError = 0;
  let worst = null;
  result.output.forEach((values, k) =>
    colors.forEach((color, i) => {
      const expected = oracleGrade(
        color,
        cases[k].settings,
        cases[k].exposure ?? 1,
      );
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(values[i * 4 + c] - expected[c]);
        if (error > maxError) {
          maxError = error;
          worst = {
            k,
            i,
            c,
            input: color,
            actual: values[i * 4 + c],
            expected: expected[c],
          };
        }
        expect(Number.isFinite(values[i * 4 + c])).toBe(true);
      }
      alphaError = Math.max(alphaError, Math.abs(values[i * 4 + 3] - 0.37));
    }),
  );
  colors.forEach((color, i) => {
    const expected = oracleGrade(color);
    for (let c = 0; c < 3; c++)
      directError = Math.max(
        directError,
        Math.abs(result.direct[i * 4 + c] / 255 - expected[c]),
      );
  });
  await writeFile(
    info.outputPath('grading-contracts.json'),
    JSON.stringify(
      {
        colors: colors.length,
        cases: cases.length,
        maxError,
        directError,
        alphaError,
        worst,
        result,
        messages,
      },
      null,
      2,
    ),
  );
  expect(maxError).toBeLessThan(0.0001);
  expect(directError).toBeLessThan(2 / 255);
  expect(alphaError).toBeLessThan(1e-6);
  expect(result.gl).toBe(0);
  expect(result.directGl).toBe(0);
  expect(messages).toEqual({ errors: [], warnings: [] });
});

test('native color controls persist, reset independently and survive quality and graphics restoration', async ({
  page,
}, info) => {
  test.setTimeout(360000);
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript((s) => {
    if (!localStorage.getItem('hexwild-settings'))
      localStorage.setItem('hexwild-settings', JSON.stringify(s));
  }, referenceSettings);
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  for (const [key, value] of Object.entries(sourceColorDefaults))
    await expect(page.locator('#color-' + key)).toHaveValue(String(value));
  await page.locator('#color-settings summary').click();
  const maxima = {
    brightness: 2,
    contrast: 2,
    saturation: 2,
    whiteBalance: 9000,
    orangeSaturation: 0.5,
    tealSaturation: 0.5,
    greenSaturation: 0.5,
    greenHue: 8,
  };
  for (const key of Object.keys(maxima)) {
    await page.locator('#color-' + key).focus();
    await page.keyboard.press('End');
  }
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('hexwild-settings')).post,
  );
  expect(saved).toMatchObject(maxima);
  await page.locator('#home').click();
  await page.reload();
  await page.locator('#continue').click();
  await page.keyboard.press('Escape');
  for (const [key, value] of Object.entries(maxima))
    await expect(page.locator('#color-' + key)).toHaveValue(String(value));
  await page.locator('#quality').selectOption('1');
  await expect(page.locator('#color-whiteBalance')).toBeDisabled();
  await expect(page.locator('#color-reset')).toBeDisabled();
  expect(
    await page.evaluate(() => window.__hexwild.graphics.composer),
  ).toBeNull();
  await page.locator('#quality').selectOption('1.7');
  await expect(page.locator('#color-whiteBalance')).toBeEnabled();
  await expect(page.locator('#color-reset')).toBeEnabled();
  const uniforms = () =>
    page.evaluate(() => {
      const u = window.__hexwild.graphics.composer.effects.output.uniforms;
      return {
        input: u.photonInputGrade.value.toArray(),
        selective: u.photonSelective.value.toArray(),
      };
    });
  expect(await uniforms()).toEqual({
    input: [2, 2, 2, 9000],
    selective: [0.5, 0.5, 0.5, 8],
  });
  await page.evaluate(() => {
    const gl = window.__hexwild.graphics.renderer.getContext();
    window.__gradingRestore = gl.getExtension('WEBGL_lose_context');
    window.__gradingRestore.loseContext();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.graphics.renderer.getContext().isContextLost() &&
          !window.__hexwild.graphics.composer,
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__gradingRestore.restoreContext());
  await waitForRecoveredRenderer(page);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!window.__hexwild.graphics.composer &&
            !window.__hexwild.graphics.renderer.getContext().isContextLost(),
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  expect(await uniforms()).toEqual({
    input: [2, 2, 2, 9000],
    selective: [0.5, 0.5, 0.5, 8],
  });
  await page.locator('#exposure-toggle').check();
  await page.locator('#color-reset').click();
  for (const [key, value] of Object.entries(sourceColorDefaults))
    await expect(page.locator('#color-' + key)).toHaveValue(String(value));
  await expect(page.locator('#exposure-toggle')).toBeChecked();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.locator('#color-whiteBalance').scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  await page.screenshot({ path: info.outputPath('color-settings-mobile.png') });
  await writeFile(
    info.outputPath('color-ui.json'),
    JSON.stringify(
      { saved, maxima, reset: await uniforms(), layout, messages },
      null,
      2,
    ),
  );
  expect(messages).toEqual({ errors: [], warnings: [] });
});
