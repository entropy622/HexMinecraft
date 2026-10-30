import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('geometric shade changes diffuse light without changing physical albedo or emission', async ({
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
  const result = await page.evaluate(async () => {
    const { probeMaterialShading } =
      await import('/tests/fixtures/material-shading-probe.js');
    return probeMaterialShading(window.__hexwild.graphics);
  });
  const get = (shade, name) =>
    result.samples.find((s) => s.shade === shade && s.name === name).rgb;
  const differences = {};
  for (const name of ['sun', 'sky', 'emission'])
    differences[name] = [0.25, 1].map((shade) =>
      get(shade, name).map((v, c) => v - get(shade, 'base')[c]),
    );
  await writeFile(
    info.outputPath('material-shading.json'),
    JSON.stringify({ result, differences, errors, warnings }, null, 2),
  );
  for (let c = 0; c < 3; c++) {
    expect(Math.abs(get(0.25, 'albedo')[c] - get(1, 'albedo')[c])).toBeLessThan(
      0.001,
    );
    for (const name of ['sun', 'sky']) {
      expect(differences[name][1][c]).toBeGreaterThan(0.005);
      expect(
        Math.abs(differences[name][0][c] / differences[name][1][c] - 0.25),
      ).toBeLessThan(0.003);
    }
    expect(
      Math.abs(differences.emission[0][c] - differences.emission[1][c]),
    ).toBeLessThan(0.001);
  }
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});
