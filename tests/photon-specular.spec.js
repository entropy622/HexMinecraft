import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { oracleSurfaceHighlight } from './fixtures/photon-specular-oracle.js';
test('actual Photon optical classes, dielectric/metal GGX and finite sun/moon disks match the pinned source', async ({
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
  const cases = [];
  for (const albedo of [
    [0, 0, 0],
    [0.4, 0.6, 0.2],
    [0.018, 0.08, 0.001],
    [1, 1, 1],
  ])
    for (const mask of [0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 17])
      for (const view of [0, 45, 80])
        for (const light of [0, 30, 70, 100])
          for (const azimuth of [0, 180])
            for (const radius of [0, Math.PI / 90, Math.PI / 60]) {
              const v = (view * Math.PI) / 180,
                l = (light * Math.PI) / 180,
                a = (azimuth * Math.PI) / 180;
              const nl = Math.fround(Math.cos(l)),
                nv = Math.fround(Math.cos(v)),
                lv = Math.fround(
                  Math.max(
                    -1,
                    Math.min(
                      1,
                      Math.sin(l) * Math.sin(v) * Math.cos(a) +
                        Math.cos(l) * Math.cos(v),
                    ),
                  ),
                );
              cases.push({
                albedo: albedo.map(Math.fround),
                mask,
                nl,
                nv,
                lv,
                lh: Math.fround(Math.sqrt(Math.max(0, (1 + lv) / 2))),
                radius: Math.fround(radius),
              });
            }
  const actual = await page.evaluate(async (cases) => {
    window.__hexwild.setPlaying(false);
    const { probePhotonSpecular } =
      await import('/tests/fixtures/photon-specular-probe.js');
    return probePhotonSpecular(window.__hexwild.graphics, cases);
  }, cases);
  let specularError = 0,
    parameterError = 0,
    diskError = 0,
    invalid = 0,
    peak = 0,
    worst = null;
  for (let i = 0; i < cases.length; i++) {
    const expected = oracleSurfaceHighlight(cases[i]),
      params = [
        expected.optics.roughness,
        expected.optics.f0,
        expected.optics.metal,
        expected.nh2,
      ];
    for (let c = 0; c < 3; c++) {
      const value = actual.output[0][i * 4 + c],
        error = Math.abs(value - expected.rgb[c]);
      if (!Number.isFinite(value) || value < 0 || value > 4.00001) invalid++;
      peak = Math.max(peak, value);
      if (error > specularError) {
        specularError = error;
        worst = {
          sample: cases[i],
          actual: value,
          expected: expected.rgb[c],
          c,
        };
      }
    }
    for (let c = 0; c < 4; c++) {
      const error = Math.abs(actual.output[1][i * 4 + c] - params[c]);
      if (c === 3) diskError = Math.max(diskError, error);
      else parameterError = Math.max(parameterError, error);
    }
  }
  const summary = {
    cases: cases.length,
    specularError,
    parameterError,
    diskError,
    invalid,
    peak,
    worst,
    gl: actual.gl,
    messages,
  };
  await writeFile(
    info.outputPath('specular-contracts.json'),
    JSON.stringify(summary, null, 2),
  );
  if (
    specularError >= 0.001 ||
    parameterError >= 0.00001 ||
    diskError >= 0.00001 ||
    invalid
  )
    await writeFile(
      info.outputPath('failed-specular-values.json'),
      JSON.stringify({ cases, actual }),
    );
  expect(cases).toHaveLength(3456);
  expect(specularError).toBeLessThan(0.001);
  expect(parameterError).toBeLessThan(0.00001);
  expect(diskError).toBeLessThan(0.00001);
  expect(invalid).toBe(0);
  expect(peak).toBeGreaterThan(3.99);
  expect(actual.gl).toBe(0);
  expect(messages).toEqual({ errors: [], warnings: [] });
});
