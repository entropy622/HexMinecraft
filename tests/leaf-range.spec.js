import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('real far-leaf shader keeps occupied-length and opaque gates while matching Photon thickness fade and visibility compensation', async ({
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
    const { probeLeafRange } =
      await import('/tests/fixtures/leaf-range-probe.js');
    return probeLeafRange(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('leaf-range.json'),
    JSON.stringify({ result, errors, warnings }, null, 2),
  );
  const lum = result.albedo.reduce(
    (s, v, c) => s + v * [0.2126, 0.7152, 0.0722][c],
    0,
  );
  for (const row of result.rows)
    for (let c = 0; c < 3; c++) {
      if (row.oracle.blocked) expect(row.rgb[c]).toBe(0);
      else if (row.fade === 1) expect(row.rgb[c]).toBe(1);
      else {
        const extinction =
            14 *
            Math.LN2 *
            0.2 *
            (1 -
              0.75 *
                Math.max(
                  0,
                  Math.min(1, result.albedo[c] / Math.sqrt(lum + 0.000001)),
                )),
          expected = Math.exp(
            -extinction * row.oracle.thickness * (1 - row.fade),
          ),
          depth = -Math.log(row.rgb[c]) / extinction / (1 - row.fade);
        // Bound only the existing 0.002 face push and the independent Riemann
        // discretization; no screen-space brightness threshold substitutes for it.
        if (expected < 2 ** -126)
          expect(row.rgb[c]).toBeLessThanOrEqual(2 ** -126);
        else
          expect(Math.abs(depth - row.oracle.thickness)).toBeLessThan(
            0.002 * row.oracle.leaves + 0.0005,
          );
      }
    }
  for (const row of result.responses) {
    const far =
        (row.ao + Math.PI * row.ambient) *
        (0.8 * Math.max(0, Math.min(1, row.NoL)) + 0.2),
      expected = 1 + (far - 1) * row.fade;
    expect(Math.abs(row.value - expected)).toBeLessThan(0.00001);
  }
  for (const row of result.fades) {
    const edge = Math.min(
        1,
        Math.max(...row.p.map((v) => Math.abs(v * 2 - 1))),
      ),
      expected = Math.max(0, Math.min(1, (edge ** 32 - 0.1) / 0.9));
    expect(Math.abs(row.value - expected)).toBeLessThan(0.00001);
  }
  for (let axis = 0; axis < 3; axis++)
    for (const side of [-1, 1]) {
      const rows = result.fades.filter(
        (r) => r.axis === axis && r.side === side,
      );
      expect(rows[0].value).toBe(0);
      expect(rows.at(-1).value).toBe(1);
      for (let i = 1; i < rows.length; i++)
        expect(rows[i].value).toBeGreaterThanOrEqual(rows[i - 1].value);
    }
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});
