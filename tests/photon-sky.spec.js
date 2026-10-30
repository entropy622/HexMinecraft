import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import {
  normalized,
  photonUv,
  readTable,
  tableFilterBounds,
  oracleSky,
  oracleLighting,
  oracleTransmission,
} from './fixtures/photon-sky-oracle.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('pinned Photon 3D scattering, sun/moon phases and Rec2020 conversion reach the production sky', async ({
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
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!window.__hexwild.graphics.skyEnvironment.atmosphere
              .multipleScattering,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  const groups = [];
  for (const y of [-1, -0.35, -0.09604, 0, 0.015, 0.2678, 0.8, 1])
    for (const rain of [0, 0.6, 1])
      for (const phase of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const sun = [Math.sqrt(Math.max(0, 1 - y * y)), y, 0],
          views = [];
        for (const v of [-1, -0.04, -0.01772, -0.0177, 0, 0.03, 0.35, 1])
          for (const az of [0, 0.7, Math.PI])
            views.push([
              Math.cos(az) * Math.sqrt(1 - v * v),
              v,
              Math.sin(az) * Math.sqrt(1 - v * v),
            ]);
        views.push(
          sun,
          sun.map((v) => -v),
          normalized([sun[0], sun[1] + 0.04, 0.01]),
        );
        groups.push({
          sun,
          rain,
          phase,
          height: [0, 0.02, 1, 5, 90][phase % 5],
          moon: [1, 0.85, 0.5, 0.15, 0, 0.15, 0.5, 0.85][phase],
          views,
        });
      }
  const result = await page.evaluate(async (groups) => {
    const { probePhotonSky } =
      await import('/tests/fixtures/photon-sky-probe.js');
    return probePhotonSky(window.__hexwild.graphics, groups);
  }, groups);
  const bytes = await readFile(
    new URL('../src/assets/photon-scattering.dat', import.meta.url),
  );
  let uvError = 0,
    rawError = 0,
    radianceError = 0,
    invalid = 0,
    badRaw = 0,
    maxRawExcess = -Infinity,
    kernelError = 0,
    transmissionError = 0,
    worst = null;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i],
      got = result.groups[i];
    for (let j = 0; j < group.views.length; j++) {
      const view = normalized(group.views[j]);
      for (const [light, uv] of [
        [group.sun, got.sunUv[j]],
        [group.sun.map((v) => -v), got.moonUv[j]],
      ]) {
        const expected = photonUv(view, light);
        for (let c = 0; c < 3; c++)
          uvError = Math.max(uvError, Math.abs(uv[c] - expected[c]));
      }
      for (const mie of [false, true]) {
        const expected = readTable(bytes, got.sunUv[j], mie),
          bounds = tableFilterBounds(bytes, got.sunUv[j], mie),
          actual = mie ? got.mie[j] : got.rayleighMultiple[j];
        for (let c = 0; c < 3; c++) {
          rawError = Math.max(rawError, Math.abs(actual[c] - expected[c]));
          const excess = Math.max(
            bounds[c][0] - actual[c],
            actual[c] - bounds[c][1],
          );
          maxRawExcess = Math.max(maxRawExcess, excess);
          if (!Number.isFinite(actual[c]) || excess > 0) badRaw++;
        }
      }
      const expected = oracleSky(bytes, view, group);
      const lighting = oracleLighting(group),
        T = oracleTransmission(view[1], group.height);
      for (const [actual, want] of [
        [got.direct[j], lighting.direct],
        [
          got.exposures[j],
          [lighting.sunExposure, lighting.moonExposure, lighting.boost],
        ],
        [got.sunColor[j], lighting.sunColor],
        [got.moonColor[j], lighting.moonColor],
      ])
        for (let c = 0; c < 3; c++)
          kernelError = Math.max(
            kernelError,
            Math.abs(actual[c] - want[c]) / Math.max(0.01, Math.abs(want[c])),
          );
      for (let c = 0; c < 3; c++)
        transmissionError = Math.max(
          transmissionError,
          Math.abs(got.transmission[j][c] - T[c]),
        );
      for (let c = 0; c < 3; c++) {
        const actual = got.radiance[j][c];
        if (!Number.isFinite(actual) || actual < 0) invalid++;
        const error =
          Math.abs(actual - expected[c]) / Math.max(0.01, expected[c]);
        if (error > radianceError) {
          radianceError = error;
          worst = { i, j, c, actual, expected: expected[c], group, view };
        }
      }
    }
  }
  const summary = {
    groups: groups.length,
    rays: groups.length * groups[0].views.length,
    uvError,
    rawError,
    badRaw,
    maxRawExcess,
    radianceError,
    kernelError,
    transmissionError,
    invalid,
    worst,
    result,
    messages,
  };
  await writeFile(
    info.outputPath('photon-sky-contracts.json'),
    JSON.stringify(summary, null, 2),
  );
  expect(uvError).toBeLessThan(0.00001);
  expect(badRaw).toBe(0);
  // Independent CPU RGB16F trilinear vs native texture filtering and float32
  // phase/mapping; the 0.01 denominator keeps tiny twilight residuals bounded.
  expect(radianceError).toBeLessThan(0.015);
  expect(kernelError).toBeLessThan(0.0001);
  expect(transmissionError).toBeLessThan(0.00005);
  expect(invalid).toBe(0);
  expect(result.gl).toBe(0);
  expect(result.texture).toEqual({
    width: 32,
    height: 64,
    depth: 32,
    bytes: 524288,
  });
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});
