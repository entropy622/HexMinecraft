import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('actual leaf solar kernel matches Photon primary phase, amount, geometry-ray absorption and sheen', async ({
  page,
}, info) => {
  const errors = [],
    warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const result = await page.evaluate(async () => {
    const { probeLeafSheen } =
      await import('/tests/fixtures/leaf-sheen-probe.js');
    return probeLeafSheen(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('leaf-sheen-raw.json'),
    JSON.stringify({ result, errors, warnings }, null, 2),
  );
  let maxError = 0;
  for (const row of result.samples) {
    const mu = Math.max(-1, Math.min(1, row.cosine)),
      primary =
        0.67 / (4 * Math.PI) +
        (0.33 * (1 - 0.7 ** 2)) /
          (4 * Math.PI * (1 + 0.7 ** 2 - 2 * 0.7 * mu) ** 1.5),
      hg =
        (1 - 0.5 ** 2) / (4 * Math.PI * (1 + 0.5 ** 2 - 2 * 0.5 * mu) ** 1.5),
      forward = Math.max(0, Math.min(1, (mu + 0.8) / 0.6));
    for (let c = 0; c < 3; c++) {
      const expected =
          row.sssAmount === 0
            ? 0
            : row.irradiance[c] *
              row.transmission[c] *
              (5 *
                primary *
                row.sssAmount *
                (2 - row.sssAmount) *
                row.albedo[c] +
                (((0.8 * row.amount * hg * forward) / Math.PI) *
                  row.albedo[c]) /
                  (row.albedo[c] + 1e-6)),
        error = Math.abs(row.rgb[c] - expected) / Math.max(1, expected);
      maxError = Math.max(maxError, error);
      expect(Number.isFinite(row.rgb[c])).toBe(true);
      expect(row.rgb[c]).toBeGreaterThanOrEqual(0);
      // Arithmetic uses an RGBA32F oracle. Separately bound the production
      // RGBA16F read by its actual ULP rather than a guessed relative epsilon.
      expect(error).toBeLessThan(0.00001);
      const ulp =
        Math.abs(row.rgb[c]) < 2 ** -14
          ? 2 ** -24
          : 2 ** (Math.floor(Math.log2(Math.abs(row.rgb[c]))) - 10);
      expect(Math.abs(row.half[c] - row.rgb[c])).toBeLessThanOrEqual(
        ulp * 1.01 + 1e-7,
      );
      if (
        !row.irradiance[c] ||
        !row.transmission[c] ||
        !row.albedo[c] ||
        !row.sssAmount
      )
        expect(row.rgb[c]).toBe(0);
    }
  }
  let maxBeerError = 0;
  for (const row of result.beer) {
    const luminance = row.albedo.reduce(
      (sum, v, c) => sum + v * [0.2126, 0.7152, 0.0722][c],
      0,
    );
    for (let c = 0; c < 3; c++) {
      const pigment = Math.max(
          0,
          Math.min(1, row.albedo[c] / Math.sqrt(luminance + 1e-6)),
        ),
        expected =
          row.sssAmount === 0
            ? 0
            : 2 **
              ((-14 * (1 - 0.75 * pigment) * row.thickness * 0.2) /
                row.sssAmount),
        error = Math.abs(row.rgb[c] - expected);
      maxBeerError = Math.max(maxBeerError, error);
      expect(Number.isFinite(row.rgb[c])).toBe(true);
      expect(row.rgb[c]).toBeGreaterThanOrEqual(0);
      expect(row.rgb[c]).toBeLessThanOrEqual(1);
      expect(error).toBeLessThan(0.00001);
    }
  }
  await writeFile(
    info.outputPath('leaf-sheen-kernel.json'),
    JSON.stringify(
      { result, maxError, maxBeerError, errors, warnings },
      null,
      2,
    ),
  );
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});
