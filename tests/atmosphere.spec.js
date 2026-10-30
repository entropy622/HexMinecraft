import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function frames(page, count = 8) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () => (--count ? requestAnimationFrame(next) : resolve());
        requestAnimationFrame(next);
      }),
    count,
  );
}

async function settled(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          const a = g.skyEnvironment.atmosphere,
            angle = ((window.__hexwild.state.time % 600) / 600) * Math.PI * 2,
            direction = [Math.cos(angle) * 78, Math.sin(angle) * 78, -45],
            length = Math.hypot(...direction),
            matches =
              !a ||
              a.uniforms.skySunDirection.value
                .toArray()
                .every((v, i) => Math.abs(v - direction[i] / length) < 0.004);
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            !g.relightQueue.size &&
            !a?.pending &&
            matches
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await frames(page, 16);
  await page.evaluate(() => {
    window.__hexwild.graphics.renderer.shadowMap.needsUpdate = true;
  });
  await frames(page, 2);
}

async function forest(page) {
  const diagnostics = { errors: [], warnings: [] };
  page.on('pageerror', (e) => diagnostics.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') diagnostics.errors.push(e.text());
    if (e.type() === 'warning') diagnostics.warnings.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const app = window.__hexwild,
      g = app.graphics,
      w = app.state.world,
      cells = [];
    app.setPlaying(false);
    app.step(150 - app.state.time);
    g.setPostOptions({
      occlusion: 0.6,
      clouds: true,
      bloom: 0.24,
      exposure: false,
      antialias: true,
    });
    for (let q = -15; q <= 15; q++)
      for (let r = -16; r <= 16; r++) {
        w.set(q, 35, r, 'grass');
        for (let y = 36; y <= 62; y++) {
          w.set(q, y, r, null);
          if (w.fluids.get(q, y, r)) w.fluids.write(q, y, r, null);
        }
        cells.push([q, 35, r]);
      }
    for (const [q, r, height] of [
      [-7, 2, 8],
      [-3, 9, 10],
      [3, 6, 9],
      [8, 1, 8],
      [0, 15, 11],
    ]) {
      for (let y = 36; y < 36 + height; y++) {
        w.set(q, y, r, 'wood');
        cells.push([q, y, r]);
      }
      for (let dq = -3; dq <= 3; dq++)
        for (let dr = -3; dr <= 3; dr++)
          if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= 3)
            for (let dy = -1; dy <= 2; dy++) {
              const y = 35 + height + dy;
              w.set(q + dq, y, r + dr, 'leaves');
              cells.push([q + dq, y, r + dr]);
            }
    }
    for (let q = -5; q <= 4; q++)
      for (let r = -5; r <= 0; r++) {
        w.set(q, 35, r, null);
        w.fluids.source(q, 35, r, 'water');
      }
    // A real sealed cell keeps underground gating and colored local light in view.
    for (let q = 6; q <= 10; q++)
      for (let r = -7; r <= -3; r++)
        for (let y = 36; y <= 40; y++) {
          const wall =
            q === 6 || q === 10 || r === -7 || r === -3 || y === 36 || y === 40;
          w.set(q, y, r, wall ? 'basalt' : null);
          cells.push([q, y, r]);
        }
    w.set(9, 37, -4, 'crystal');
    cells.push([9, 37, -4]);
    g.updateCells(cells);
    g.fluidRenderer.sync(w, new Set(g.chunks.keys()), true);
    app.teleport(0, 37, -11);
    app.lookAt(-3, 43, 7);
    g.stepOffset = 0;
    g.renderer.toneMappingExposure = 1;
  });
  await settled(page);
  diagnostics.device = await page.evaluate(() => {
    const gl = window.__hexwild.graphics.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      gl: gl.getError(),
    };
  });
  return diagnostics;
}

async function capture(page, info, name) {
  await settled(page);
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
  const result = await page.evaluate(async () => {
    const app = window.__hexwild,
      g = app.graphics,
      gl = g.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info'),
      t = g.composer?.passes[0].target,
      a = g.skyEnvironment.atmosphere;
    let hdr = null;
    if (t) {
      const { DataUtils } = await import('/tests/fixtures/bloom-probe.js'),
        data = new Uint16Array(t.width * t.height * 4);
      g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
      let maximum = 0,
        invalid = 0,
        sum = 0;
      for (let i = 0; i < data.length; i += 4)
        for (let c = 0; c < 3; c++) {
          const x = DataUtils.fromHalfFloat(data[i + c]);
          if (!Number.isFinite(x) || x < 0) invalid++;
          maximum = Math.max(maximum, x);
          sum += x;
        }
      const bytes = new Uint8Array(data.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      hdr = {
        width: t.width,
        height: t.height,
        maximum,
        invalid,
        mean: sum / (t.width * t.height * 3),
        base64: btoa(binary),
      };
    }
    return {
      time: app.state.time,
      quality: g.quality,
      position: g.camera.position.toArray(),
      exposure: g.renderer.toneMappingExposure,
      deviceScaleFactor: devicePixelRatio,
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      sunDirection: g.sun.position
        .clone()
        .sub(g.sun.target.position)
        .normalize()
        .toArray(),
      sunColor: g.sun.color.toArray(),
      sunIntensity: g.sun.intensity,
      starsOpacity: g.stars.material.opacity,
      horizon: g.scene.background.toArray(),
      skyCoefficients: a?.probe.sh.toArray() || null,
      hdr,
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      gl: gl.getError(),
    };
  });
  if (result.hdr) {
    await writeFile(
      info.outputPath(`${name}.rgba16f`),
      Buffer.from(result.hdr.base64, 'base64'),
    );
    delete result.hdr.base64;
  }
  await writeFile(
    info.outputPath(`${name}.json`),
    JSON.stringify(result, null, 2),
  );
  expect(result.gl).toBe(0);
  if (result.hdr) expect(result.hdr.invalid).toBe(0);
  expect(result.exposure).toBe(1);
  return result;
}

test('real scene: fixed-exposure forest, sunset, moonlight, sealed light and balanced sky', async ({
  page,
}, info) => {
  const diagnostics = await forest(page),
    label = process.env.ATMO_LABEL || 'new',
    states = {};
  await page.keyboard.press('F1');
  for (const [name, time] of [
    ['sunrise', 30],
    ['noon', 150],
    ['sunset', 292],
    ['twilight', 307],
    ['moon', 450],
    ['newmoon', 2850],
  ]) {
    await page.evaluate((time) => {
      const app = window.__hexwild;
      app.step(time - app.state.time);
    }, time);
    states[name] = await capture(page, info, `${label}-${name}`);
  }
  await page.evaluate(() => {
    const app = window.__hexwild;
    app.teleport(8, 37, -5);
    app.lookAt(9, 37.7, -4);
  });
  states.cave = await capture(page, info, `${label}-sealed`);
  await page.evaluate(() => {
    const app = window.__hexwild;
    app.step(150 - app.state.time);
    app.teleport(0, 37, -11);
    app.lookAt(-3, 43, 7);
    app.graphics.setQuality(1);
  });
  states.balanced = await capture(page, info, `${label}-balanced`);
  expect(states.balanced.quality).toBe(1);
  await writeFile(
    info.outputPath(`${label}-scene.json`),
    JSON.stringify({ states, diagnostics }, null, 2),
  );
  expect(diagnostics.errors).toEqual([]);
  expect(states.sunrise.starsOpacity).toBe(0);
  if (states.moon.skyCoefficients)
    expect(states.newmoon.skyCoefficients[0]).toBeLessThan(
      states.moon.skyCoefficients[0] * 0.5,
    );
});

test('GPU contracts: production sky transport and SH drive real Lambert surfaces', async ({
  page,
}, info) => {
  await page.addInitScript({
    path: fileURLToPath(
      new URL('./fixtures/shader-diagnostics.js', import.meta.url),
    ),
  });
  const diagnostics = await forest(page);
  const result = await page.evaluate(async () => {
    const probe = await import('/tests/fixtures/atmosphere-probe.js');
    return probe.skyContracts(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('sky-shaders.json'),
    JSON.stringify(result.shaderPrograms, null, 2),
  );
  delete result.shaderPrograms;
  await writeFile(
    info.outputPath('sky-contracts.json'),
    JSON.stringify({ result, diagnostics }, null, 2),
  );
  for (const field of result.fields) {
    // Source R2 hemisphere quadrature, sampled map interpolation and FP16.
    expect(field.maxError).toBeLessThan(0.004);
    expect(field.invalid).toBe(0);
  }
  expect(result.transport.invalid).toBe(0);
  expect(result.transport.minimum).toBeGreaterThanOrEqual(0);
  expect(result.transport.maximum).toBeLessThanOrEqual(1);
  expect(result.transport.monotonicError).toBeLessThan(0.002);
  for (const light of result.sunlight) {
    expect(light.rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(
      true,
    );
    if (light.elevation < 0) expect(light.rgb).toEqual([0, 0, 0]);
    if (light.elevation > 0) expect(light.rgb[0]).toBeGreaterThan(light.rgb[2]);
    if (light.aerosol === 6) {
      const clear = result.sunlight.find(
        (v) =>
          v.height === light.height &&
          v.elevation === light.elevation &&
          v.aerosol === 1,
      );
      for (let c = 0; c < 3; c++)
        expect(light.rgb[c]).toBeLessThanOrEqual(clear.rgb[c] + 0.001);
    }
  }
  expect(result.seamError).toBeLessThan(0.012);
  expect(result.staleReadMaximum).toBe(0);
  expect(result.gl).toBe(0);
  expect(diagnostics.errors).toEqual([]);
});

test('live clock: delayed GPU delivery coalesces without starving or mixing sky snapshots', async ({
  page,
}, info) => {
  const diagnostics = await forest(page);
  await page.evaluate(() => {
    const app = window.__hexwild;
    app.step(60 - app.state.time);
  });
  await settled(page);
  const start = await page.evaluate(async () => {
    const app = window.__hexwild,
      renderer = app.graphics.renderer,
      original = renderer.readRenderTargetPixelsAsync,
      originalFrame = app.graphics.frame,
      { createSkySampler } =
        await import('/tests/fixtures/atmosphere-probe.js');
    window.liveSkySampler = createSkySampler(app.graphics);
    window.restoreSkyDevice = () => {
      renderer.readRenderTargetPixelsAsync = original;
      app.graphics.frame = originalFrame;
    };
    renderer.readRenderTargetPixelsAsync = function (...args) {
      return original
        .apply(this, args)
        .then(
          (value) =>
            new Promise((resolve) => setTimeout(() => resolve(value), 450)),
        );
    };
    const sample = { time: app.state.time, ...window.liveSkySampler.sample() };
    window.liveSkyTrace = {
      frames: 0,
      publications: [],
      rendered: 0,
      phases: {},
      maxEnergyError: 0,
      maxMoonUvError: 0,
      maxFogError: 0,
      fogEpochs: 0,
      invalid: 0,
    };
    app.graphics.frame = function (...args) {
      const result = originalFrame.apply(this, args),
        a = this.skyEnvironment.atmosphere,
        t = window.liveSkyTrace,
        phase = a.uniforms.skyMoonPhase.value,
        expected = a.directLight.toArray(),
        colors = [
          this.sun.color.toArray().map((v) => v * this.sun.intensity),
          this.leafUniforms.leafSunColor.value.toArray(),
          this.cloudSystem.uniforms.cloudDirect.value.toArray(),
          this.atmosphere.uniforms.airSunColor.value
            .toArray()
            .map((v) => v * this.atmosphere.uniforms.airSunPower.value),
        ];
      t.rendered++;
      for (const rgb of colors)
        for (let c = 0; c < 3; c++) {
          if (!Number.isFinite(rgb[c])) t.invalid++;
          t.maxEnergyError = Math.max(
            t.maxEnergyError,
            Math.abs(rgb[c] - expected[c]),
          );
        }
      const offset = this.skyEnvironment.moonMap.offset,
        want = [
          ((phase % 4) * 64 + 16) / 256,
          1 - (Math.floor(phase / 4) * 64 + 48) / 128,
        ];
      t.maxMoonUvError = Math.max(
        t.maxMoonUvError,
        Math.abs(offset.x - want[0]),
        Math.abs(offset.y - want[1]),
      );
      if (a.fogSnapshot) {
        const fog = a.fogSnapshot,
          u = this.atmosphere.uniforms;
        for (const [actual, expected] of [
          [u.airRayleigh.value.toArray(), fog.parameters.rayleigh],
          [u.airSkyMean.value.toArray(), fog.ambient.toArray()],
          [
            [
              u.airMieExtinction.value,
              u.airMieScattering.value,
              u.airFogDistance.value,
            ],
            [
              fog.parameters.mieExtinction,
              fog.parameters.mieScattering,
              fog.distance,
            ],
          ],
        ])
          for (let i = 0; i < actual.length; i++)
            t.maxFogError = Math.max(
              t.maxFogError,
              Math.abs(actual[i] - expected[i]),
            );
        t.fogEpochs++;
      }
      t.phases[phase] = (t.phases[phase] || 0) + 1;
      return result;
    };
    let key = '';
    const observe = () => {
      const a = app.graphics.skyEnvironment.atmosphere,
        direction = a.uniforms.skySunDirection.value.toArray(),
        nextKey = direction.join(',');
      window.liveSkyTrace.frames++;
      if (nextKey !== key) {
        window.liveSkyTrace.publications.push({
          time: app.state.time,
          wallTime: performance.now(),
          direction,
          pending: !!a.pending,
        });
        key = nextKey;
      }
      window.liveSkyFrame = requestAnimationFrame(observe);
    };
    window.liveSkyFrame = requestAnimationFrame(observe);
    app.setPlaying(true);
    return sample;
  });
  const samples = [];
  try {
    await expect
      .poll(
        async () => {
          const sample = await page.evaluate(() => {
            const app = window.__hexwild;
            return { time: app.state.time, ...window.liveSkySampler.sample() };
          });
          samples.push(sample);
          return (
            sample.time - start.time > 3 &&
            new Set(samples.map((s) => s.direction.join(','))).size >= 3
          );
        },
        { timeout: 30000, intervals: [250] },
      )
      .toBe(true);
    const end = samples.at(-1),
      change = Math.hypot(
        ...end.direction.map((v, i) => v - start.direction[i]),
      ),
      publications = new Set(samples.map((s) => s.direction.join(','))).size;
    expect(change).toBeGreaterThan(0.012);
    expect(publications).toBeGreaterThanOrEqual(3);
    const phaseSamples = [];
    for (const [time, phase] of [
      [2850, 4],
      [4650, 7],
    ]) {
      await page.evaluate((time) => {
        const a = window.__hexwild;
        a.setPlaying(false);
        a.step(time - a.state.time);
      }, time);
      await expect
        .poll(
          () =>
            page.evaluate((phase) => {
              const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
              return (
                !a.pending &&
                a.uniforms.skyMoonPhase.value === phase &&
                window.liveSkyTrace.phases[phase] > 0
              );
            }, phase),
          { timeout: 30000 },
        )
        .toBe(true);
      phaseSamples.push(
        await page.evaluate(() => ({
          sample: window.liveSkySampler.sample(),
          exposures:
            window.__hexwild.graphics.skyEnvironment.atmosphere.sourceExposures.toArray(),
        })),
      );
    }
    expect(
      phaseSamples[1].exposures[1] / phaseSamples[0].exposures[1],
    ).toBeCloseTo(2, 2);
    for (const s of phaseSamples) samples.push(s.sample);
    for (const sample of samples) {
      expect(sample.mismatch).toBeLessThan(0.002);
      expect(sample.directError).toBeLessThan(0.002);
      expect(sample.weatherError).toBeLessThan(0.003);
      expect(sample.gl).toBe(0);
    }
  } finally {
    const observed = await page.evaluate(() => {
      cancelAnimationFrame(window.liveSkyFrame);
      window.__hexwild.setPlaying(false);
      window.restoreSkyDevice();
      window.liveSkySampler.dispose();
      return window.liveSkyTrace;
    });
    expect(observed.rendered).toBeGreaterThan(30);
    expect(observed.maxEnergyError).toBeLessThan(1e-7);
    expect(observed.maxMoonUvError).toBeLessThan(1e-12);
    expect(observed.maxFogError).toBeLessThan(1e-10);
    expect(observed.fogEpochs).toBeGreaterThan(20);
    expect(observed.invalid).toBe(0);
    await writeFile(
      info.outputPath('live-clock-delayed-device.json'),
      JSON.stringify({ start, samples, observed, diagnostics }, null, 2),
    );
  }
  expect(diagnostics.errors).toEqual([]);
});

test.describe('fractional device DPR', () => {
  test.use({ deviceScaleFactor: 1.25 });
  test('sky lifecycle: resize, DPR, quality, dimensions and restored context keep live bounded resources', async ({
    page,
  }, info) => {
    const diagnostics = await forest(page);
    const before = await capture(page, info, 'lifecycle-before');
    expect(before.deviceScaleFactor).toBe(1.25);
    expect(before.drawingBuffer).toEqual([1125, 812]);
    await page.evaluate(() => {
      const targets =
        window.__hexwild.graphics.skyEnvironment.atmosphere.targets;
      const table =
        window.__hexwild.graphics.skyEnvironment.atmosphere.multipleScattering;
      window.skyTableBefore = table;
      window.skyDisposal = {
        allocated: targets.length,
        disposed: 0,
        tableDisposed: 0,
      };
      table.addEventListener(
        'dispose',
        () => window.skyDisposal.tableDisposed++,
      );
      for (const target of targets)
        target.addEventListener('dispose', () => window.skyDisposal.disposed++);
    });
    await page.setViewportSize({ width: 721, height: 537 });
    await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      g.setQuality(0.65);
    });
    const low = await capture(page, info, 'lifecycle-low');
    expect(low.quality).toBe(0.65);
    const disposal = await page.evaluate(() => window.skyDisposal);
    expect(disposal.allocated).toBeGreaterThan(0);
    expect(disposal.disposed).toBe(disposal.allocated);
    expect(disposal.tableDisposed).toBe(1);
    expect(
      await page.evaluate(
        () =>
          window.__hexwild.graphics.skyEnvironment.atmosphere
            .multipleScattering !== window.skyTableBefore,
      ),
    ).toBe(true);
    await page.evaluate(() => window.__hexwild.graphics.setQuality(1.7));
    await settled(page);
    await page.evaluate(() => {
      const gl = window.__hexwild.graphics.renderer.getContext(),
        ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) throw Error('WEBGL_lose_context unavailable');
      const canvas = gl.canvas;
      window.skyRestored = false;
      canvas.addEventListener(
        'webglcontextlost',
        (event) => event.preventDefault(),
        { once: true },
      );
      canvas.addEventListener(
        'webglcontextrestored',
        () => (window.skyRestored = true),
        { once: true },
      );
      window.restoreSkyContext = () => ext.restoreContext();
      ext.loseContext();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.restoreSkyContext());
    await expect
      .poll(() => page.evaluate(() => window.skyRestored), { timeout: 30000 })
      .toBe(true);
    const restored = await capture(page, info, 'lifecycle-restored');
    expect(restored.drawingBuffer).toEqual([901, 671]);
    expect(restored.skyCoefficients).not.toBeNull();
    const restoredTable = await page.evaluate(() => {
      const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
      return {
        present: !!a.multipleScattering,
        shared:
          a.uniforms.skyMultipleScatteringMap.value === a.multipleScattering &&
          a.work.skyMultipleScatteringMap.value === a.multipleScattering,
        bytes: a.multipleScattering.image.data.byteLength,
      };
    });
    expect(restoredTable).toEqual({
      present: true,
      shared: true,
      bytes: 524288,
    });
    for (let i = 0; i < before.skyCoefficients.length; i++)
      expect(
        Math.abs(restored.skyCoefficients[i] - before.skyCoefficients[i]),
      ).toBeLessThan(0.012);
    await page.keyboard.press('Escape');
    await page.locator('[data-dimension="nether"]').click();
    await expect
      .poll(() => page.evaluate(() => window.__hexwild.state.dimension))
      .toBe('nether');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__hexwild.graphics.skyEnvironment.atmosphere.targets.length,
        ),
      )
      .toBe(0);
    const inactive = await page.evaluate(() => {
      const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
      return {
        active: a.probe.intensity,
        allocated: a.targets.length,
        pending: !!a.pending,
        table: a.multipleScattering,
      };
    });
    expect(inactive).toEqual({
      active: 0,
      allocated: 0,
      pending: false,
      table: null,
    });
    await writeFile(
      info.outputPath('sky-lifecycle.json'),
      JSON.stringify({ before, low, restored, inactive, diagnostics }, null, 2),
    );
    expect(diagnostics.errors).toEqual([]);
  });
});
