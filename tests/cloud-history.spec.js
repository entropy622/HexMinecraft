import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { DataUtils } from 'three';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 640, height: 480 });
});
async function setup(page) {
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  const site = await page.evaluate(async () => {
    const g = window.__hexwild,
      { cloudDensity, cloudWeather, CLOUD_RADIUS } =
        await import('/src/cloud-field.js'),
      { axialToWorld, worldToAxial } = await import('/src/core.js');
    g.setPlaying(false);
    g.step(120 - g.state.time);
    g.graphics.setPostOptions({
      occlusion: 0,
      antialias: true,
      bloom: 0,
      exposure: false,
      clouds: false,
    });
    let best = null;
    for (let q = -10; q <= 10; q++)
      for (let r = -10; r <= 10; r++) {
        const score =
          Math.abs(cloudDensity(q, r, g.state.world.seed) - 0.65) +
          Math.hypot(q, r) * 0.0002;
        if (!best || score < best.score) best = { q, r, score };
      }
    const wind = cloudWeather(g.state.world.seed, 120, 0, 0, 0, 0).winds[0],
      p = axialToWorld(best.q, best.r),
      a = worldToAxial(
        p.x * CLOUD_RADIUS + wind[0],
        p.z * CLOUD_RADIUS + wind[1],
      );
    g.teleport(a.q - 24, 42, a.r);
    g.lookAt(a.q, 55, a.r);
    g.graphics.stepOffset = 0;
    return a;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            g.relightQueue.size === 0 &&
            !g.skyEnvironment.atmosphere.pending
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  // The cloud history is still disabled. Settle the requested sky and terrain
  // before measuring a cold cloud accumulation, including its first frame.
  await frames(page, 32);
  return site;
}
function statistics(frames) {
  const decoded = frames.map((f) => {
      const rgb = f.color.map(DataUtils.fromHalfFloat),
        values = [];
      for (let i = 0; i < rgb.length; i += 3)
        values.push(
          rgb[i] * 0.2126 + rgb[i + 1] * 0.7152 + rgb[i + 2] * 0.0722,
        );
      return values;
    }),
    group = (a) => {
      const mean = a[0].map(
        (_, i) => a.reduce((n, f) => n + f[i], 0) / a.length,
      );
      const variance =
        mean.reduce(
          (sum, m, i) =>
            sum + a.reduce((n, f) => n + (f[i] - m) ** 2, 0) / a.length,
          0,
        ) / mean.length;
      const detail =
        mean.slice(1).reduce((n, m, i) => n + Math.abs(m - mean[i]), 0) /
        (mean.length - 1);
      return { mean, variance, detail };
    },
    early = group(decoded.slice(0, 8)),
    late = group(decoded.slice(-8));
  return {
    earlyVariance: early.variance,
    lateVariance: late.variance,
    ratio: late.variance / early.variance,
    detailRatio: late.detail / early.detail,
    meanError: Math.sqrt(
      late.mean.reduce((n, m, i) => n + (m - early.mean[i]) ** 2, 0) /
        late.mean.length,
    ),
    cloudPixels: frames
      .at(-1)
      .cloud.map(DataUtils.fromHalfFloat)
      .filter((v) => v > 0.02 && v < 0.98).length,
    finite: decoded.flat().every(Number.isFinite),
  };
}
test('cloud integration converges under real projection jitter without erasing spatial detail', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const site = await setup(page);
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__hexwild.graphics,
          frames = [];
        g.setPostOptions({ ...g.postOptions, clouds: true });
        const next = () => {
          const t = g.composer.passes[0].target,
            d = new Uint16Array(128 * 96 * 4),
            a = [],
            color = [],
            output = new Uint16Array(d.length);
          g.renderer.readRenderTargetPixels(
            t,
            Math.floor(t.width / 2) - 64,
            Math.floor(t.height / 2) - 48,
            128,
            96,
            d,
          );
          // The production TAA output has already removed projection jitter.
          // Clouds stay reactive there, so this measures the cloud's own resolve.
          g.renderer.readRenderTargetPixels(
            g.composer.effects.temporal.history[0],
            Math.floor(t.width / 2) - 64,
            Math.floor(t.height / 2) - 48,
            128,
            96,
            output,
          );
          for (let y = 0; y < 96; y += 4)
            for (let x = 0; x < 128; x += 4) {
              const i = (y * 128 + x) * 4;
              a.push(d[i + 3]);
              color.push(output[i], output[i + 1], output[i + 2]);
            }
          frames.push({ color, cloud: a });
          if (frames.length === 48) resolve(frames);
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
  const result = { site, ...statistics(frames), errors };
  await writeFile(
    info.outputPath('cloud-convergence.json'),
    JSON.stringify(result, null, 2),
  );
  await page.screenshot({ path: info.outputPath('converged-clouds.png') });
  expect(result.finite).toBe(true);
  expect(result.cloudPixels).toBeGreaterThan(100);
  expect(result.earlyVariance).toBeGreaterThan(1e-10);
  expect(result.detailRatio).toBeGreaterThan(0.8);
  expect(result.meanError).toBeLessThan(0.025);
  expect(result.ratio).toBeLessThan(0.7);
  expect(errors).toEqual([]);
});

async function frames(page, count) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () => {
          if (--count === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}
async function cloudSample(page, phase = null) {
  const raw = await page.evaluate(async (phase) => {
    if (phase !== null)
      await new Promise((resolve) => {
        const next = () =>
          window.__hexwild.graphics.composer.effects.temporal.phase % 8 ===
          phase
            ? resolve()
            : requestAnimationFrame(next);
        next();
      });
    const g = window.__hexwild.graphics,
      f = g.composer.passes[0],
      t = f.target,
      h = f.clouds.histories.get(t),
      out = new Uint16Array(11 * 11 * 4),
      metadata = new Uint16Array(11 * 11 * 4);
    g.renderer.readRenderTargetPixels(
      t,
      Math.floor(t.width / 2) - 5,
      Math.floor(t.height / 2) - 5,
      11,
      11,
      out,
    );
    const previous = h.history[0];
    g.renderer.readRenderTargetPixels(
      previous,
      Math.floor(previous.width / 2) - 5,
      Math.floor(previous.height / 2) - 5,
      11,
      11,
      metadata,
      undefined,
      1,
    );
    return {
      out: Array.from(out),
      patch: (() => {
        const buffer = new Uint16Array(130 * 98 * 4);
        g.renderer.readRenderTargetPixels(
          t,
          Math.floor(t.width / 2) - 65,
          Math.floor(t.height / 2) - 49,
          130,
          98,
          buffer,
        );
        return Array.from(buffer);
      })(),
      jitter: [
        g.composer.effects.temporal.jitter.x * t.width,
        g.composer.effects.temporal.jitter.y * t.height,
      ],
      metadata: Array.from(metadata),
      phase: g.composer.effects.temporal.phase % 8,
      cloudPhase: f.clouds.volume.uniforms.cloudPhase.value,
      cloudFrames: h.frames,
      time: window.__hexwild.state.time,
      wind: g.cloudSystem.uniforms.cloudLayerWind.value.map((v) => v.toArray()),
      bands: g.cloudSystem.uniforms.cloudLayers.value.map((v) => v.toArray()),
      skyPending: !!g.skyEnvironment.atmosphere.pending,
      lightDirection:
        g.cloudSystem.uniforms.cloudLightDirection.value.toArray(),
      error: g.renderer.getContext().getError(),
    };
  }, phase);
  const rgba = [0, 0, 0, 0],
    data = raw.out.map(DataUtils.fromHalfFloat),
    meta = raw.metadata.map(DataUtils.fromHalfFloat);
  for (let i = 0; i < data.length; i++) rgba[i % 4] += data[i] / 121;
  const field = [],
    alpha = (x, y) => DataUtils.fromHalfFloat(raw.patch[(y * 130 + x) * 4 + 3]);
  for (let y = 0; y < 96; y += 4)
    for (let x = 0; x < 128; x += 4) {
      const px = 1 + x + raw.jitter[0],
        py = 1 + y + raw.jitter[1],
        ix = Math.floor(px),
        iy = Math.floor(py),
        fx = px - ix,
        fy = py - iy;
      field.push(
        (alpha(ix, iy) * (1 - fx) + alpha(ix + 1, iy) * fx) * (1 - fy) +
          (alpha(ix, iy + 1) * (1 - fx) + alpha(ix + 1, iy + 1) * fx) * fy,
      );
    }
  return {
    phase: raw.phase,
    cloudPhase: raw.cloudPhase,
    cloudFrames: raw.cloudFrames,
    time: raw.time,
    wind: raw.wind,
    bands: raw.bands,
    skyPending: raw.skyPending,
    lightDirection: raw.lightDirection,
    rgba,
    field,
    age: meta.filter((_, i) => i % 4 === 2).reduce((a, b) => a + b, 0) / 121,
    finite: [...data, ...meta].every(Number.isFinite),
    error: raw.error,
  };
}
test('wind and camera reprojection reject new buildings, reveal clouds promptly and recover after real WebGL loss', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const site = await setup(page);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, clouds: true });
  });
  await frames(page, 32);
  const initial = await cloudSample(page);
  await page.evaluate((s) => {
    const g = window.__hexwild;
    g.teleport(s.q - 23, 42, s.r);
    g.lookAt(s.q, 55, s.r);
    g.graphics.stepOffset = 0;
  }, site);
  // Advance the real cloud clock gradually so history stays eligible across wind.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 32;
        const next = () => {
          // Stay within the production frame clock's maximum step. A large
          // time jump can legitimately invalidate lighting history on delivery.
          window.__hexwild.step(0.25);
          if (--n === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
  const moving = await cloudSample(page);
  await writeFile(
    info.outputPath('moving-frame.json'),
    JSON.stringify({ moving }, null, 2),
  );
  expect(moving.age).toBeGreaterThan(4);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, clouds: false });
  });
  await frames(page, 2);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, clouds: true });
  });
  await frames(page, 32);
  const reference = await cloudSample(page, moving.phase);
  expect(Math.abs(moving.rgba[3] - reference.rgba[3])).toBeLessThan(0.03);
  const fieldError = (a, b) =>
    Math.sqrt(
      a.field.reduce((n, v, i) => n + (v - b.field[i]) ** 2, 0) /
        a.field.length,
    );
  await writeFile(
    info.outputPath('moving-cloud-field.json'),
    JSON.stringify(
      { moving, reference, error: fieldError(moving, reference) },
      null,
      2,
    ),
  );
  expect(
    reference.field.filter((v) => v > 0.02 && v < 0.98).length,
  ).toBeGreaterThan(100);
  expect(fieldError(moving, reference)).toBeLessThan(0.025);
  // Select the building fixture from the actual low cloud volume, independent
  // of history. A fixed roof two units above the base can sit in empty wisps.
  const buildingSite = await page.evaluate(async () => {
    const a = window.__hexwild,
      g = a.graphics,
      { readCloudShape } = await import('/tests/fixtures/cloud-shape-probe.js'),
      { worldToAxial } = await import('/src/core.js'),
      grid = readCloudShape(g);
    let best = null;
    for (let y = 0; y < grid.levels; y++) {
      const height = grid.band[0] + (y + 0.5) * grid.verticalSpacing;
      if (height < 56 || height > 60) continue;
      for (let z = 0; z < grid.width; z++)
        for (let x = 0; x < grid.width; x++) {
          const dx = (x + 0.5 - grid.width / 2) * grid.spacing,
            dz = (z + 0.5 - grid.width / 2) * grid.spacing,
            distance = Math.hypot(dx, dz),
            density = grid.density[(y * grid.width + z) * grid.width + x];
          if (distance < 15 || distance > 65 || density <= 0.04) continue;
          if (!best || density > best.density)
            best = {
              point: [grid.center[0] + dx, height, grid.center[2] + dz],
              density,
            };
        }
    }
    if (!best)
      throw Error('No buildable low-cloud body in the actual density grid');
    const target = worldToAxial(best.point[0], best.point[2]);
    a.lookAt(target.q, best.point[1], target.r);
    g.stepOffset = 0;
    return {
      ...best,
      target,
      roofHeight: Math.ceil(best.point[1]) + 1,
      band: grid.band,
      camera: g.camera.position.toArray(),
    };
  });
  await frames(page, 32);
  const buildingReference = await cloudSample(page);
  await writeFile(
    info.outputPath('occlusion-site.json'),
    JSON.stringify({ buildingSite, buildingReference }, null, 2),
  );
  expect(buildingSite.roofHeight).toBeLessThan(64);
  expect(buildingReference.rgba[3]).toBeLessThan(0.98);
  // Retain independent unobstructed controls for every projection/noise phase.
  // Immediate reveal still gets only two frames; its control must have the
  // same subpixel coverage, just like the partial-occlusion comparison below.
  const referencePhases = new Map([
    [buildingReference.phase, buildingReference],
  ]);
  for (let phase = 0; phase < 8; phase++)
    if (!referencePhases.has(phase))
      referencePhases.set(phase, await cloudSample(page, phase));
  const occlusion = [];
  let revealed;
  for (const height of [47, buildingSite.roofHeight]) {
    const center = await page.evaluate(async (height) => {
      const { worldToAxial } = await import('/src/core.js'),
        camera = window.__hexwild.graphics.camera,
        direction = camera.getWorldDirection(camera.position.clone()),
        position = camera.position
          .clone()
          .addScaledVector(
            direction,
            (height - camera.position.y) / direction.y,
          );
      return worldToAxial(position.x, position.z);
    }, height);
    for (const solid of [true, false]) {
      await page.evaluate(
        ({ center, height, solid }) => {
          const g = window.__hexwild,
            cells = [];
          for (let q = center.q - 5; q <= center.q + 5; q++)
            for (let r = center.r - 5; r <= center.r + 5; r++) {
              g.state.world.set(q, height, r, solid ? 'calcite' : null);
              cells.push([q, height, r]);
            }
          g.graphics.updateCells(cells);
        },
        { center, height, solid },
      );
      await frames(page, 2);
      const immediate = await cloudSample(page);
      if (solid) {
        if (height === 47) expect(immediate.rgba[3]).toBeCloseTo(1, 3);
        else {
          expect(immediate.rgba[3]).toBeGreaterThan(buildingReference.rgba[3]);
          expect(immediate.rgba[3]).toBeLessThan(0.999);
        }
        await page.evaluate(() => {
          const g = window.__hexwild.graphics;
          g.setPostOptions({ ...g.postOptions, clouds: false });
        });
        await frames(page, 2);
        await page.evaluate(() => {
          const g = window.__hexwild.graphics;
          g.setPostOptions({ ...g.postOptions, clouds: true });
        });
        await frames(page, 32);
        // Match the projection phase at the silhouette: bilinear unjittering
        // alone cannot make different subpixel coverage identical.
        const fresh = await cloudSample(page, immediate.phase),
          error = fieldError(immediate, fresh);
        expect(fresh.phase).toBe(immediate.phase);
        occlusion.push({
          height,
          transmission: immediate.rgba[3],
          freshTransmission: fresh.rgba[3],
          error,
        });
        await writeFile(
          info.outputPath('partial-occlusion.json'),
          JSON.stringify(
            { occlusion, movingFieldError: fieldError(moving, reference) },
            null,
            2,
          ),
        );
        expect(error).toBeLessThan(0.025);
      } else {
        revealed = immediate;
        expect(revealed.rgba[3]).toBeLessThan(0.98);
        const error = fieldError(revealed, referencePhases.get(revealed.phase));
        occlusion.push({
          height,
          phase: revealed.phase,
          revealedTransmission: revealed.rgba[3],
          error,
        });
        await writeFile(
          info.outputPath(`revealed-${height}.json`),
          JSON.stringify(
            { revealed, reference: referencePhases.get(revealed.phase), error },
            null,
            2,
          ),
        );
        expect(error).toBeLessThan(0.03);
      }
    }
  }
  const supported = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      extension = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) return false;
    g.renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => {
        window.cloudRestoreFrames = [
          ...g.composer.passes[0].clouds.histories.values(),
        ].map((s) => s.frames);
      },
      { once: true },
    );
    window.restoreCloudContext = () => extension.restoreContext();
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreCloudContext());
  await expect
    .poll(() => page.evaluate(() => window.cloudRestoreFrames))
    .toBeTruthy();
  const restoredFrames = await page.evaluate(() => window.cloudRestoreFrames);
  // A recreated composer can have no views yet. Every retained view is cold;
  // actual accumulation age and the recovered image are checked after drawing.
  expect(restoredFrames.every((n) => n === 0)).toBe(true);
  await frames(page, 32);
  const restored = await cloudSample(page);
  expect(restored.finite).toBe(true);
  expect(restored.age).toBeGreaterThan(4);
  expect(restored.error).toBe(0);
  expect(restored.rgba[3]).toBeLessThan(0.98);
  const restoredReference = referencePhases.get(restored.phase),
    restoredError = fieldError(restored, restoredReference);
  await page.screenshot({ path: info.outputPath('restored-clouds.png') });
  await writeFile(
    info.outputPath('cloud-motion-recovery.json'),
    JSON.stringify(
      {
        site,
        initial: { ...initial, field: undefined },
        moving: { ...moving, field: undefined },
        reference: { ...reference, field: undefined },
        buildingSite,
        buildingReference: { ...buildingReference, field: undefined },
        restoredReference: { ...restoredReference, field: undefined },
        revealed: { ...revealed, field: undefined },
        restored: { ...restored, field: undefined },
        movingFieldError: fieldError(moving, reference),
        restoredFieldError: restoredError,
        occlusion,
        restoredFrames,
        errors,
      },
      null,
      2,
    ),
  );
  expect(Math.abs(restored.rgba[3] - restoredReference.rgba[3])).toBeLessThan(
    0.03,
  );
  expect(restoredError).toBeLessThan(0.025);
  expect(errors).toEqual([]);
});
