import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('actual SH visibility cone and shadow bounce obey geometry, sky visibility and source energy', async ({
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
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            !g.relightQueue.size &&
            g.voxelLight.revision === g.world.lightRevision
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { probeSurfaceIndirect } =
      await import('/tests/fixtures/surface-indirect-probe.js');
    return probeSurfaceIndirect(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('surface-indirect.json'),
    JSON.stringify({ result, errors, warnings }, null, 2),
  );
  expect(result.nativeSkyEncoding.length).toBeGreaterThan(0);
  for (const s of result.nativeSkyEncoding)
    expect(Math.abs(s.factor - (s.raw / 15) ** 2)).toBeLessThan(1e-7);
  // Integrate the incoming polynomial field over the spherical cap. This
  // quadrature is independent of the production SH/cone convolution formula.
  for (const row of result.fields) {
    const integral = [0, 0, 0],
      n = 384,
      m = 96,
      lo = Math.sqrt(1 - row.ao);
    const normal = row.spec.normal,
      helper = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0],
      tangent = [
        helper[1] * normal[2] - helper[2] * normal[1],
        helper[2] * normal[0] - helper[0] * normal[2],
        helper[0] * normal[1] - helper[1] * normal[0],
      ],
      length = Math.hypot(...tangent);
    for (let c = 0; c < 3; c++) tangent[c] /= length;
    const bitangent = [
      normal[1] * tangent[2] - normal[2] * tangent[1],
      normal[2] * tangent[0] - normal[0] * tangent[2],
      normal[0] * tangent[1] - normal[1] * tangent[0],
    ];
    for (let i = 0; i < n; i++) {
      const mu = lo + ((i + 0.5) * (1 - lo)) / n;
      for (let j = 0; j < m; j++) {
        const phi = ((j + 0.5) * Math.PI * 2) / m,
          t = Math.sqrt(1 - mu * mu),
          direction = normal.map(
            (v, c) =>
              mu * v +
              t * (Math.cos(phi) * tangent[c] + Math.sin(phi) * bitangent[c]),
          ),
          z = direction.reduce((sum, v, c) => sum + v * row.spec.axis[c], 0);
        for (let c = 0; c < 3; c++)
          integral[c] +=
            ((((row.spec.base[c] +
              row.spec.linear[c] * z +
              (row.spec.quadratic[c] * (3 * z * z - 1)) / 2) *
              mu *
              (1 - lo)) /
              n) *
              2 *
              Math.PI) /
            m;
      }
    }
    for (let c = 0; c < 3; c++)
      expect(
        Math.abs(
          row.lit[c] - row.base[c] - (integral[c] * result.albedo[c]) / Math.PI,
        ),
      ).toBeLessThan(0.0005);
  }
  for (const row of result.samples)
    for (let c = 0; c < 3; c++) {
      const expected = row.blocked
        ? 0.033 *
          result.albedo[c] *
          result.sun[c] *
          row.power *
          row.shade *
          Math.pow(row.ao, 1.5) *
          // The renderer input is squared irradiance, while Photon uses
          // the normalized raw lightmap level to the fourth power.
          Math.pow(Math.sqrt(row.sky), 4)
        : 0;
      expect(Math.abs(row.on[c] - row.off[c] - expected)).toBeLessThan(0.0003);
    }
  expect(
    result.samples.find((s) => s.name === 'shadow').on[1] -
      result.samples.find((s) => s.name === 'shadow').off[1],
  ).toBeGreaterThan(0.01);
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});
