import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('production geometric materials match Photon lifted directional diffuse and sunlight AO without changing local lights', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.goto('/');
  await page.locator('#creative').click();
  const result = await page.evaluate(async () => {
    window.__hexwild.setPlaying(false);
    const { probeSurfaceDiffuse } =
      await import('/tests/fixtures/surface-diffuse-probe.js');
    return probeSurfaceDiffuse(window.__hexwild.graphics);
  });
  let maxError = 0,
    legacyError = 0,
    localError = 0;
  for (const s of result.samples) {
    if (s.local) {
      for (let c = 0; c < 3; c++)
        localError = Math.max(localError, Math.abs(s.on[c] - s.off[c]));
      continue;
    }
    // Independent source expression, not the production lift/NoL factorization.
    const cosine = Math.max(0, s.noL),
      lift = (cosine + cosine * 0.25) / (1 + cosine * 0.25);
    for (let c = 0; c < 3; c++) {
      const pigment =
        (result.albedo[c] * result.faceShade * result.light[c]) / Math.PI;
      const expected = pigment * lift * (1 - 0.5 * s.amount) * s.ao * s.ao;
      const legacy = pigment * cosine * (1 - 0.5 * s.amount) * s.ao;
      maxError = Math.max(maxError, Math.abs(s.on[c] - expected));
      legacyError = Math.max(legacyError, Math.abs(s.off[c] - legacy));
      expect(Number.isFinite(s.on[c]) && s.on[c] >= 0).toBe(true);
    }
  }
  await writeFile(
    info.outputPath('surface-diffuse.json'),
    JSON.stringify(
      { result, maxError, legacyError, localError, messages },
      null,
      2,
    ),
  );
  expect(result.samples).toHaveLength(255);
  expect(maxError).toBeLessThan(0.00002);
  expect(legacyError).toBeLessThan(0.00002);
  expect(localError).toBe(0);
  expect(result.gl).toBe(0);
  expect(messages).toEqual({ errors: [], warnings: [] });
});
