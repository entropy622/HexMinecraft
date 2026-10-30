import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { oracleGrade } from './fixtures/photon-grading-oracle.js';
import { oracleCas } from './fixtures/photon-cas-oracle.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

function messagesFor(page) {
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  return messages;
}
test('actual Photon CAS matches display-space source weights and TAA copies unsharpened history', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const messages = messagesFor(page);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const images = [];
  const make = (name, width, height, sample) =>
    images.push({
      name,
      width,
      height,
      pixels: Array.from({ length: width * height }, (_, i) =>
        sample(i % width, Math.floor(i / width)).map(Math.fround),
      ),
    });
  for (const [name, color] of Object.entries({
    black: [0, 0, 0],
    green: [0, 1, 0],
    gray: [0.18, 0.18, 0.18],
    white: [65504, 65504, 65504],
    dim: [0, 1e-6, 0],
  }))
    make(name, 9, 7, () => color);
  for (const [w, h] of [
    [1, 1],
    [1, 17],
    [19, 1],
    [17, 13],
    [31, 23],
  ]) {
    make('steps-' + w + 'x' + h, w, h, (x, y) =>
      x < w / 2 ? [0.003, 0.007, 0.001] : [4, 0.8, 8],
    );
    make('texture-' + w + 'x' + h, w, h, (x, y) => [
      0.1 + ((x * 7 + y * 13) % 19) / 40,
      0.2 + ((x * 11 + y * 3) % 17) / 18,
      0.015 + ((x * 3 + y * 7) % 11) / 100,
    ]);
  }
  const cases = [
    { sharpening: false },
    ...[0, 0.25, 0.5, 0.75, 1].map((sharpness) => ({
      sharpening: true,
      sharpness,
    })),
    {
      sharpening: true,
      sharpness: 0.5,
      whiteBalance: 4000,
      contrast: 1.2,
      saturation: 1.3,
      greenHue: 4.6,
    },
  ];
  const actual = await page.evaluate(
    async ({ images, cases }) => {
      const { probePhotonCas } =
        await import('/tests/fixtures/photon-cas-probe.js');
      return probePhotonCas(window.__hexwild.graphics, images, cases);
    },
    { images, cases },
  );
  let maxError = 0,
    dcError = 0,
    alphaError = 0,
    invalid = 0,
    count = 0,
    worst = null,
    changed = 0;
  for (let k = 0; k < cases.length; k++)
    for (let im = 0; im < images.length; im++) {
      const image = images[im],
        graded = image.pixels.map((c) => oracleGrade(c, cases[k]));
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
          const i = y * image.width + x,
            expected = cases[k].sharpening
              ? oracleCas(
                  graded,
                  image.width,
                  image.height,
                  x,
                  y,
                  cases[k].sharpness,
                )
              : graded[i],
            values = actual.output[im][k];
          for (let c = 0; c < 3; c++) {
            const value = values[i * 4 + c],
              error = Math.abs(value - expected[c]);
            count++;
            if (!Number.isFinite(value) || value < 0 || value > 5.001)
              invalid++;
            if (error > maxError) {
              maxError = error;
              worst = {
                image: image.name,
                k,
                x,
                y,
                c,
                actual: value,
                expected: expected[c],
              };
            }
            if (im < 5)
              dcError = Math.max(dcError, Math.abs(value - graded[i][c]));
            if (
              k > 0 &&
              im >= 5 &&
              Math.abs(value - actual.output[im][0][i * 4 + c]) > 0.001
            )
              changed++;
          }
          alphaError = Math.max(alphaError, Math.abs(values[i * 4 + 3] - 0.37));
        }
    }
  let copyError = 0;
  for (let i = 0; i < actual.copied.length; i++)
    copyError = Math.max(
      copyError,
      Math.abs(actual.copied[i] - (i % 4 === 3 ? 1 : actual.history[i])),
    );
  const summary = {
    images: images.length,
    cases: cases.length,
    channels: count,
    maxError,
    dcError,
    alphaError,
    copyError,
    invalid,
    changed,
    worst,
    gl: actual.gl,
    messages,
  };
  await writeFile(
    info.outputPath('cas-contracts.json'),
    JSON.stringify(summary, null, 2),
  );
  if (maxError >= 0.0001 || invalid)
    await writeFile(
      info.outputPath('cas-failed-values.json'),
      JSON.stringify({ images, cases, actual }),
    );
  expect(maxError).toBeLessThan(0.0001);
  expect(dcError).toBeLessThan(0.00002);
  expect(alphaError).toBeLessThan(1e-6);
  expect(copyError).toBe(0);
  expect(invalid).toBe(0);
  expect(changed).toBeGreaterThan(100);
  expect(actual.gl).toBe(0);
  expect(messages).toEqual({ errors: [], warnings: [] });
});

test('CAS controls persist independently of temporal AA and color reset through quality and graphics restoration', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const messages = messagesFor(page);
  await page.addInitScript((s) => {
    if (!localStorage.getItem('hexwild-settings'))
      localStorage.setItem('hexwild-settings', JSON.stringify(s));
  }, referenceSettings);
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sharpening-toggle')).toBeChecked();
  await expect(page.locator('#sharpness-strength')).toHaveValue('0.5');
  await page.locator('#sharpness-strength').focus();
  await page.keyboard.press('End');
  await page.locator('#sharpening-toggle').uncheck();
  await expect(page.locator('#sharpness-strength')).toBeDisabled();
  await page.locator('#antialias-toggle').uncheck();
  await page.locator('#color-reset').click();
  await expect(page.locator('#sharpening-toggle')).not.toBeChecked();
  await expect(page.locator('#sharpness-strength')).toHaveValue('1');
  await expect(page.locator('#antialias-toggle')).not.toBeChecked();
  await page.locator('#home').click();
  await page.reload();
  await page.locator('#continue').click();
  await page.keyboard.press('Escape');
  const state = () =>
    page.evaluate(() => {
      const g = window.__hexwild.graphics,
        u = g.composer?.effects.output.uniforms;
      return {
        sharpening: g.postOptions.sharpening,
        sharpness: g.postOptions.sharpness,
        antialias: g.postOptions.antialias,
        enabled: u?.photonCasEnabled.value,
        strength: u?.photonSharpness.value,
      };
    });
  expect(await state()).toEqual({
    sharpening: false,
    sharpness: 1,
    antialias: false,
    enabled: false,
    strength: 1,
  });
  await page.locator('#quality').selectOption('1');
  await expect(page.locator('#sharpening-toggle')).toBeDisabled();
  await page.locator('#quality').selectOption('1.7');
  await page.evaluate(() => {
    const gl = window.__hexwild.graphics.renderer.getContext();
    window.__casRestore = gl.getExtension('WEBGL_lose_context');
    window.__casRestore.loseContext();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !window.__hexwild.graphics.composer &&
          window.__hexwild.graphics.renderer.getContext().isContextLost(),
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.__casRestore.restoreContext());
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
  expect(await state()).toEqual({
    sharpening: false,
    sharpness: 1,
    antialias: false,
    enabled: false,
    strength: 1,
  });
  await page.locator('#sharpening-toggle').check();
  expect(await state()).toMatchObject({ enabled: true, antialias: false });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.locator('#sharpness-strength').scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('cas-settings-mobile.png') });
  await writeFile(
    info.outputPath('cas-ui.json'),
    JSON.stringify({ state: await state(), messages }, null, 2),
  );
  expect(messages).toEqual({ errors: [], warnings: [] });
});
