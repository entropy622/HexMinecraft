import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('RGB air: independent height columns, linear lighting, live MRT and bilateral composite', async ({
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
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.setPlaying(false);
    a.graphics.setQuality(1.7);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!window.__hexwild.graphics.composer?.passes.find(
            (p) => p.constructor.name === 'AtmospherePass',
          ),
      ),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 12;
        const tick = () => (--n ? requestAnimationFrame(tick) : resolve());
        requestAnimationFrame(tick);
      }),
  );
  const rays = [
    { height: 8, y: 0, length: 40 },
    { height: 35, y: 0, length: 55 },
    { height: -40, y: 0, length: 100 },
    { height: 300, y: 0, length: 100 },
    { height: 30, y: -0.7, length: 70 },
    { height: -20, y: 0.7, length: 80 },
    { height: 12, y: 1e-7, length: 50 },
    { height: 12, y: -1e-7, length: 50 },
    { height: 40, y: 0.6, length: 70 },
    { height: 50, y: -0.6, length: 25 },
    { height: 35, y: -0.6, length: 25 },
    { height: 50, y: -0.6, length: 50 },
    { height: 8, y: 1, length: 0 },
  ];
  const result = await page.evaluate(async (rays) => {
    const { probeAirTransport } =
      await import('/tests/fixtures/air-transport-probe.js');
    return probeAirTransport(window.__hexwild.graphics, rays);
  }, rays);
  await writeFile(
    info.outputPath('rgb-air.json'),
    JSON.stringify({ rays, result, errors, warnings }, null, 2),
  );
  // Independent midpoint quadrature, not a CPU copy of the shader integral.
  for (let i = 0; i < rays.length; i++)
    for (let c = 0; c < 2; c++) {
      const ray = rays[i],
        n = 8192,
        ds = ray.length / n;
      let sum = 0;
      for (let j = 0; j < n; j++)
        sum +=
          Math.min(
            1,
            Math.exp(
              -(
                ray.height +
                ray.y * (j + 0.5) * ds -
                result.coefficients.base[c]
              ) * result.coefficients.falloff[c],
            ),
          ) * ds;
      expect(Math.abs(result.profiles[i][c] - sum)).toBeLessThan(
        Math.max(0.002, sum * 0.001),
      );
    }
  for (let c = 0; c < 2; c++)
    expect(
      Math.abs(
        result.profiles[9][c] + result.profiles[10][c] - result.profiles[11][c],
      ),
    ).toBeLessThan(0.04);
  expect(result.profiles[1][0]).toBeGreaterThan(result.profiles[1][1] * 3);
  expect(result.transmission[0]).toBeGreaterThan(result.transmission[1]);
  expect(result.transmission[1]).toBeGreaterThan(result.transmission[2]);
  for (let c = 0; c < 3; c++) {
    expect(Math.abs(result.doubled[c] - result.ambient[c] * 2)).toBeLessThan(
      0.0001,
    );
    expect(result.dark[c]).toBe(0);
    expect(
      Math.abs(result.directDoubled[c] - result.direct[c] * 2),
    ).toBeLessThan(0.0001);
    const expected =
      (result.composite.color[c] *
        result.composite.columns.reduce(
          (s, x) =>
            s +
            Math.exp(
              -result.coefficients.rayleigh[c] * x[0] -
                result.coefficients.mie * x[1],
            ),
          0,
        )) /
        4 +
      result.composite.scatter[c];
    expect(Math.abs(result.composite.rgb[c] - expected)).toBeLessThan(0.0005);
  }
  let occupied = 0;
  for (const [r, m, t] of result.liveSamples) {
    expect(Number.isFinite(r + m + t)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(m).toBeGreaterThanOrEqual(0);
    if (r + m > 0.01) occupied++;
    expect(
      Math.abs(
        t -
          Math.exp(
            -result.coefficients.rayleigh[1] * r - result.coefficients.mie * m,
          ),
      ),
    ).toBeLessThan(0.002);
  }
  expect(occupied).toBeGreaterThan(10);
  expect(result.attachments).toEqual([
    { format: 1023, type: 1016 },
    { format: 1030, type: 1016 },
  ]);
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs(
        result.coefficients.skyMean[c] - result.coefficients.expectedSkyMean[c],
      ),
    ).toBeLessThan(1e-8);
  expect(result.gl).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test.describe('fractional DPR air volume', () => {
  test.use({ deviceScaleFactor: 1.25 });
  test('both air attachments resize and release through quality and context recovery', async ({
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
    await page.evaluate(() => {
      window.__hexwild.setPlaying(false);
      window.__hexwild.graphics.setQuality(1.7);
    });
    await page.setViewportSize({ width: 721, height: 537 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics,
            p = g.composer?.passes.find(
              (p) => p.constructor.name === 'AtmospherePass',
            );
          return (
            p?.target.width === Math.ceil(g.renderer.domElement.width / 2) &&
            p?.target.height === Math.ceil(g.renderer.domElement.height / 2)
          );
        }),
      )
      .toBe(true);
    const before = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        p = g.composer.passes.find(
          (p) => p.constructor.name === 'AtmospherePass',
        );
      window.airDisposals = 0;
      p.target.addEventListener('dispose', () => window.airDisposals++);
      const before = {
        size: [p.target.width, p.target.height],
        attachments: p.target.textures.length,
      };
      g.setQuality(0.65);
      return { ...before, released: window.airDisposals, lowPost: g.usePost };
    });
    expect(before).toMatchObject({
      size: [451, 336],
      attachments: 2,
      released: 1,
      lowPost: false,
    });
    await page.evaluate(async () => {
      const g = window.__hexwild.graphics;
      g.setQuality(1.7);
      const gl = g.renderer.getContext(),
        ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) throw Error('WEBGL_lose_context unavailable');
      // Restore after the actual lost event, then resolve in the restored
      // event's microtask. Polling the page can otherwise queue behind the
      // first expensive upload/compile frame and mistake that for no event.
      await new Promise((resolve) => {
        gl.canvas.addEventListener(
          'webglcontextlost',
          (e) => {
            e.preventDefault();
            setTimeout(() => ext.restoreContext(), 0);
          },
          { once: true },
        );
        gl.canvas.addEventListener('webglcontextrestored', () => resolve(), {
          once: true,
        });
        ext.loseContext();
      });
    });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 20;
          const tick = () => (--n ? requestAnimationFrame(tick) : resolve());
          requestAnimationFrame(tick);
        }),
    );
    const after = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        p = g.composer.passes.find(
          (p) => p.constructor.name === 'AtmospherePass',
        );
      return {
        size: [p.target.width, p.target.height],
        formats: p.target.textures.map((t) => t.format),
        columnBinding:
          p.composite.uniforms.fogColumns.value === p.target.textures[1],
        skyFogActive: g.atmosphere.uniforms.airSkyFogActive.value,
        skyFogTargets: g.skyEnvironment.atmosphere.cloudSky.targets.length,
        summary: [
          g.skyEnvironment.atmosphere.targets[2].width,
          g.skyEnvironment.atmosphere.targets[2].height,
        ],
        gl: g.renderer.getContext().getError(),
      };
    });
    await writeFile(
      info.outputPath('rgb-air-lifecycle.json'),
      JSON.stringify({ before, after, errors, warnings }, null, 2),
    );
    expect(after).toEqual({
      size: [451, 336],
      formats: [1023, 1030],
      columnBinding: true,
      skyFogActive: 1,
      skyFogTargets: 2,
      summary: [22, 1],
      gl: 0,
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
