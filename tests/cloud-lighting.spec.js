import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { sourceCloudScattering } from './fixtures/cloud-scattering-oracle.js';
import { oracleCloudLight } from './fixtures/photon-sky-oracle.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('Photon cloud layers use distinct scattering closures and light at cloud altitude', async ({
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
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const cases = [];
  for (const layer of [0, 1, 2])
    for (const albedo of [1, 0.66])
      for (const depth of [2, 180])
        for (const mu of [-0.7, 0.8])
          cases.push({
            layer,
            albedo,
            depth: [depth, depth * 0.5, depth * 2],
            mu,
            density: 0.35,
            opacity: 0.6,
            extinction: [0.1, 0.016, 0.15][layer],
            stratus: 0.4,
            shadow: 0.7,
            elevation: 0.3,
            boost: 1.4,
          });
  for (const layer of [0, 1, 2])
    for (const boundary of ['transparent', 'absorbing'])
      cases.push({
        ...cases.find((s) => s.layer === layer),
        opacity: boundary === 'transparent' ? 0 : 0.6,
        albedo: boundary === 'absorbing' ? 0 : 1,
      });
  const lights = [];
  for (const [sunY, height, moonlit, rain, phase, coverage, layer] of [
    [0.2, 52, false, 0, 0],
    [0.2, 160, false, 0, 0],
    [0.2, 300, false, 0, 0],
    [-0.01, 52, false, 0, 0],
    [-0.01, 300, false, 0, 0],
    [-0.15, 160, true, 0.5, 0],
    [-0.6, 52, true, 0, 4],
    [0.3, 52, false, 1, 0],
    [0.8, 160, false, 0, 0, 0.4, 1],
    [0.8, 160, false, 0, 0, 0.9, 1],
  ])
    lights.push({
      sunY,
      height,
      moonlit,
      rain,
      phase,
      coverage: coverage ?? 0,
      layer: layer ?? 0,
      mu: moonlit ? -sunY : sunY,
    });
  const actual = await page.evaluate(
    async ({ cases, lights }) => {
      const { probeCloudLighting } =
        await import('/tests/fixtures/cloud-lighting-probe.js');
      return probeCloudLighting(window.__hexwild.graphics, cases, lights);
    },
    { cases, lights },
  );
  let kernelError = 0,
    lightError = 0;
  cases.forEach((s, i) =>
    sourceCloudScattering(s).forEach(
      (v, c) =>
        (kernelError = Math.max(
          kernelError,
          Math.abs(actual.kernels[i * 4 + c] - v),
        )),
    ),
  );
  lights.forEach((s, i) =>
    oracleCloudLight(s).forEach(
      (v, c) =>
        (lightError = Math.max(
          lightError,
          Math.abs(actual.light[i][c] - v) / Math.max(1, Math.abs(v)),
        )),
    ),
  );
  await writeFile(
    info.outputPath('cloud-lighting-kernels.json'),
    JSON.stringify(
      { cases, lights, actual, kernelError, lightError, messages },
      null,
      2,
    ),
  );
  expect(actual.kernels.every(Number.isFinite)).toBe(true);
  expect(kernelError).toBeLessThan(0.00002);
  expect(lightError).toBeLessThan(0.003);
  expect(actual.light[2][2]).toBeGreaterThan(actual.light[0][2]);
  expect(actual.light[4][0]).toBeGreaterThan(0);
  expect(actual.light[9][1] / actual.light[8][1]).toBeCloseTo(1.4, 4);
  expect(actual.gl).toBe(0);
  expect(messages).toEqual([]);
});

test('actual cloud histories restart at each cloud sun and moon threshold', async ({
  page,
}, info) => {
  test.setTimeout(480000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) errors.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const pass = window.__hexwild.graphics.composer.passes[0].clouds,
      original = pass.render;
    window.cloudModeEvents = [];
    window.restoreModeObserver = () => (pass.render = original);
    pass.render = function (renderer, source, ...rest) {
      const previous = this.histories.get(source),
        before = previous
          ? { frames: previous.frames, mode: previous.illuminationMode }
          : null;
      const result = original.call(this, renderer, source, ...rest),
        after = this.histories.get(source);
      if (before?.frames >= 8 && before.mode !== after.illuminationMode)
        window.cloudModeEvents.push({
          before,
          after: { frames: after.frames, mode: after.illuminationMode },
          ready: this.resolve.uniforms.cloudReady.value,
        });
      return result;
    };
  });
  try {
    for (const [y, mode] of [
      [-0.039, 0],
      [-0.041, 1],
      [-0.046, 3],
      [-0.051, 7],
      [-0.039, 0],
    ]) {
      await page.evaluate((y) => {
        const a = window.__hexwild,
          t = 300 + (Math.asin((-y * Math.hypot(78, 45)) / 78) * 300) / Math.PI;
        a.step(t - a.state.time);
      }, y);
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ y, mode }) => {
                const g = window.__hexwild.graphics,
                  a = g.skyEnvironment.atmosphere;
                return (
                  !a.pending &&
                  Math.abs(a.uniforms.skySunDirection.value.y - y) < 0.0001 &&
                  [...g.composer.passes[0].clouds.histories.values()].some(
                    (s) => s.frames >= 12 && s.illuminationMode === mode,
                  )
                );
              },
              { y, mode },
            ),
          { timeout: 90000 },
        )
        .toBe(true);
    }
    const events = await page.evaluate(() => window.cloudModeEvents);
    await writeFile(
      info.outputPath('cloud-celestial-history.json'),
      JSON.stringify({ events, errors }, null, 2),
    );
    for (const mode of [1, 3, 7, 0])
      expect(events.some((e) => e.after.mode === mode)).toBe(true);
    for (const e of events) {
      expect(e.after.frames).toBe(1);
      expect(e.ready).toBe(false);
    }
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => window.restoreModeObserver());
  }
});
