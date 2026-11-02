import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { reflectionAirGallery } from './fixtures/reflection-air-gallery.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { referenceReflectionAir } from './fixtures/reflection-air-oracle.js';

test('actual screen-space reflection hits transport RGB air once and recover with the shared sky', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (row) => {
    if (['error', 'warning'].includes(row.type())) messages.push(row.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    {
      ...referenceSettings,
      post: {
        ...referenceSettings.post,
        clouds: false,
        antialias: false,
        bloom: 0,
        occlusion: 0,
      },
    },
  );
  await page.goto('/');
  await page.locator('#save-file').setInputFiles({
    name: 'reflection-air-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(reflectionAirGallery())),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await page.keyboard.press('F1');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 180000 },
    )
    .toBe(true);
  const frame = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const density = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      u = g.composer.effects.wet.material.uniforms;
    window.__airDensityUniform = u.airDensity;
    u.airDensity = { value: 0 };
    return g.atmosphere.uniforms.airDensity.value;
  });
  await frame();
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('reflection-air-off.png') });
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.composer.effects.wet.material.uniforms.airDensity =
      window.__airDensityUniform;
  });
  await frame();
  expect(
    await page.evaluate(
      () => window.__hexwild.graphics.atmosphere.uniforms.airDensity.value,
    ),
  ).toBe(density);
  expect(density).toBeGreaterThan(0);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('reflection-air.png') });
  const probe = () =>
    page.evaluate(async () => {
      const { probeReflectionAir } =
        await import('/tests/fixtures/reflection-air-probe.js');
      return probeReflectionAir(window.__hexwild.graphics);
    });
  function check(result) {
    expect(result.gl).toBe(0);
    expect(result.hits).toBeGreaterThan(500);
    expect(result.samples.length).toBeGreaterThan(100);
    let maxError = 0,
      maxDarkError = 0,
      maxBypassError = 0,
      maxChange = 0,
      minLength = Infinity,
      maxLength = 0,
      invalid = 0;
    const types = new Set();
    for (const sample of result.samples) {
      types.add(sample.type);
      const expected = referenceReflectionAir(sample, result.coeff),
        dark = referenceReflectionAir(sample, result.coeff, 0);
      minLength = Math.min(minLength, expected.length);
      maxLength = Math.max(maxLength, expected.length);
      for (let c = 0; c < 3; c++) {
        if (!Number.isFinite(sample.actual[c]) || sample.actual[c] < 0)
          invalid++;
        maxError = Math.max(
          maxError,
          Math.abs(sample.actual[c] - expected.rgb[c]),
        );
        maxDarkError = Math.max(
          maxDarkError,
          Math.abs(sample.dark[c] - dark.rgb[c]),
        );
        maxBypassError = Math.max(
          maxBypassError,
          Math.abs(sample.bypass[c] - sample.raw[c]),
        );
        maxChange = Math.max(
          maxChange,
          Math.abs(sample.actual[c] - sample.raw[c]),
        );
      }
    }
    expect([...types].sort()).toEqual(['blueWool', 'redWool']);
    expect(invalid).toBe(0);
    expect(maxError).toBeLessThan(0.0002);
    expect(maxDarkError).toBeLessThan(0.0002);
    expect(maxBypassError).toBe(0);
    expect(maxChange).toBeGreaterThan(0.005);
    expect(maxLength - minLength).toBeGreaterThan(2);
    return {
      maxError,
      maxDarkError,
      maxBypassError,
      maxChange,
      minLength,
      maxLength,
      samples: result.samples.length,
      hits: result.hits,
    };
  }
  const first = await probe();
  await writeFile(
    info.outputPath('reflection-air.json'),
    JSON.stringify({ first, messages }, null, 2),
  );
  const initial = check(first);
  await page.evaluate(async () => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__airRestore = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      document
        .querySelector('#world')
        .addEventListener('webglcontextrestored', resolve, { once: true });
      window.__airRestore.restoreContext();
    });
  });
  await waitForRecoveredRenderer(page);
  const restored = await probe();
  await writeFile(
    info.outputPath('reflection-air.json'),
    JSON.stringify({ first, restored, messages, initial }, null, 2),
  );
  const recovery = check(restored);
  await writeFile(
    info.outputPath('summary.json'),
    JSON.stringify({ initial, recovery, messages }, null, 2),
  );
  expect(messages).toEqual([]);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
});
