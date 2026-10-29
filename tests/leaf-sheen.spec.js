import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('actual leaf solar kernel preserves diffuse units and matches normalized sheen with zero-energy and black limits', async ({
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
      legacy =
        0.65 + (0.35 * (1 - 0.6 ** 2)) / (1 + 0.6 ** 2 - 2 * 0.6 * mu) ** 1.5,
      hg =
        (1 - 0.5 ** 2) / (4 * Math.PI * (1 + 0.5 ** 2 - 2 * 0.5 * mu) ** 1.5),
      forward = Math.max(0, Math.min(1, (mu + 0.8) / 0.6));
    for (let c = 0; c < 3; c++) {
      const expected =
          row.irradiance[c] *
          row.transmission[c] *
          (0.2 * legacy * row.albedo[c] +
            (((0.8 * row.amount * hg * forward) / Math.PI) * row.albedo[c]) /
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
      if (!row.irradiance[c] || !row.transmission[c] || !row.albedo[c])
        expect(row.rgb[c]).toBe(0);
    }
  }
  await writeFile(
    info.outputPath('leaf-sheen-kernel.json'),
    JSON.stringify({ result, maxError, errors, warnings }, null, 2),
  );
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});
