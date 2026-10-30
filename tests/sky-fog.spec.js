import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { sampleSkyMap } from './fixtures/photon-skylight-oracle.js';

// Numerical quadrature of the density profile, independently of the shader's
// closed-form segment integral and its base-height crossing branches.
function column(height, y, length, falloff) {
  let sum = 0;
  const n = 8192,
    ds = length / n;
  for (let i = 0; i < n; i++)
    sum +=
      Math.min(1, Math.exp(-(height + (i + 0.5) * ds * y - 8) * falloff)) * ds;
  return sum;
}
const hg = (c, g) =>
  (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * c) ** 1.5);
function phase(c) {
  let r = 0,
    m = 0,
    amount = 1,
    g = 1;
  for (let i = 0; i < 4; i++) {
    r += amount / (4 * Math.PI);
    m += amount * (0.7 * hg(c, 0.5 * g) + 0.3 * hg(c, -0.2 * g));
    amount *= 0.5;
    g *= 0.7;
  }
  return [r, m];
}

test('sky fog uses raw clear incident light, composes the real cloud environment and continues past the old 58-unit limit', async ({
  page,
}, info) => {
  test.setTimeout(480000);
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
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#save-file').setInputFiles({
    name: 'forest-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const settle = async () => {
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 35);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            return !a.pending && a.key !== null && !!a.fogSnapshot;
          }),
        { timeout: 90000 },
      )
      .toBe(true);
  };
  await settle();
  // Refresh after coverage warm-up so the clone and the captured environment
  // observe exactly the same seeded cloud field and lighting snapshot.
  await page.evaluate(() => {
    const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
    a.key = null;
    a.updated = null;
  });
  await settle();
  const result = await page.evaluate(async () => {
    const { probeSkyFog } = await import('/tests/fixtures/sky-fog-probe.js');
    return probeSkyFog(window.__hexwild.graphics);
  });
  await page.screenshot({ path: info.outputPath('forest-morning.png') });
  for (const map of [result.native, result.raw, result.clonedFog, result.noFog])
    map.pixels = map.pixels.map(DataUtils.fromHalfFloat);
  const sample = sampleSkyMap(
    result.raw.pixels,
    result.raw.width,
    result.raw.height,
    [0, 1 / Math.sqrt(1.64), -0.8 / Math.sqrt(1.64)],
  );
  const ambientError = Math.max(
    ...sample.map(
      (v, c) => Math.abs(v * 1.13 - result.ambient[c]) / Math.max(1, v * 1.13),
    ),
  );
  expect(ambientError).toBeLessThan(0.003);
  let clonedError = 0,
    formulaError = 0,
    changed = 0;
  const p = result.parameters,
    checked = [];
  for (const y of [0, 8, 22, 23, 24, 25, 39, 47])
    for (const x of [0, 13, 37, 69, 95]) {
      const u = (x + 0.5) / 96,
        v = (y + 0.5) / 48,
        azimuth = (u - 0.5) * 2 * Math.PI,
        signed = (v - 0.5) * 2,
        elevation = (Math.sign(signed) * signed * signed * Math.PI) / 2,
        direction = [
          Math.cos(elevation) * Math.cos(azimuth),
          Math.sin(elevation),
          Math.cos(elevation) * Math.sin(azimuth),
        ],
        columns = [
          column(
            result.position[1],
            direction[1],
            result.distance,
            (0.14 * 7) / 30,
          ),
          column(result.position[1], direction[1], result.distance, 0.14),
        ],
        cosine = direction.reduce(
          (s, d, i) => s + d * result.lightDirection[i],
          0,
        ),
        ph = phase(cosine),
        offset = (y * 96 + x) * 4,
        expected = [];
      for (let c = 0; c < 3; c++) {
        const tau = p.rayleigh[c] * columns[0] + p.mieExtinction * columns[1],
          T = Math.exp(-tau),
          integral = (1 - T) / Math.max(tau, 1e-6),
          ambient = result.ambient[c] * result.skylight,
          sun = result.direct[c] * p.direct * result.skylight,
          scattering =
            integral *
            (p.rayleigh[c] * columns[0] * (ambient + sun * ph[0]) +
              p.mieScattering * columns[1] * (ambient + sun * ph[1])) *
            p.glow,
          value = result.noFog.pixels[offset + c] * T + scattering,
          native = result.native.pixels[offset + c];
        expected.push(value);
        formulaError = Math.max(
          formulaError,
          Math.abs(value - native) / Math.max(1, Math.abs(value)),
        );
        clonedError = Math.max(
          clonedError,
          Math.abs(native - result.clonedFog.pixels[offset + c]) /
            Math.max(1, Math.abs(native)),
        );
        changed = Math.max(
          changed,
          Math.abs(native - result.noFog.pixels[offset + c]),
        );
      }
      checked.push({ x, y, direction, columns, expected });
    }
  await writeFile(
    info.outputPath('sky-fog-kernel.json'),
    JSON.stringify(
      {
        ambientError,
        clonedError,
        formulaError,
        changed,
        checked,
        result,
        messages,
      },
      null,
      2,
    ),
  );
  expect(result.gl).toBe(0);
  expect(clonedError).toBeLessThan(0.003);
  expect(formulaError).toBeLessThan(0.004);
  expect(changed).toBeGreaterThan(0.005);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await settle();
  await page.screenshot({ path: info.outputPath('forest-morning-1080p.png') });
  const timing = await page.evaluate(async () => {
    const { timeAirHorizon } = await import('/tests/fixtures/sky-fog-probe.js');
    return timeAirHorizon(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('air-horizon-timing.json'),
    JSON.stringify(timing, null, 2),
  );
  expect(timing.supported).toBe(true);
  expect(timing.gl).toBe(0);
  await page.setViewportSize({ width: 900, height: 650 });
  // A clear high sightline uses real native terrain, depth and volume buffers.
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.teleport(-120, 33.35, 4);
    a.lookAt(-98, 57, -4);
    a.graphics.stepOffset = 0;
  });
  await settle();
  const horizon = await page.evaluate(async () => {
    const { probeAirHorizon } =
      await import('/tests/fixtures/sky-fog-probe.js');
    return probeAirHorizon(window.__hexwild.graphics);
  });
  const full = column(
      horizon.height,
      horizon.rayY,
      horizon.length,
      (0.14 * 7) / 30,
    ),
    near = column(horizon.height, horizon.rayY, 58, (0.14 * 7) / 30);
  await writeFile(
    info.outputPath('air-horizon.json'),
    JSON.stringify({ horizon, full, near, messages }, null, 2),
  );
  expect(horizon.values[2]).toBe(1);
  expect(horizon.gl).toBe(0);
  expect(horizon.fogRange).toEqual([87.32, 118]);
  expect(Math.abs(horizon.values[0] - full)).toBeLessThan(0.06);
  expect(horizon.values[0]).toBeGreaterThan(near + 1);
  await page.screenshot({ path: info.outputPath('open-horizon.png') });
  await page.evaluate(() => {
    window.__hexwild.step(308 - window.__hexwild.state.time);
    window.__hexwild.graphics.setQuality(1);
  });
  await settle();
  await page.screenshot({ path: info.outputPath('balanced-twilight.png') });
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(messages).toEqual([]);
});
