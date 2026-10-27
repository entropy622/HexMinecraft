import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

async function pool(page) {
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      changed = [];
    g.setPlaying(false);
    for (let q = -8; q <= 8; q++)
      for (let r = -8; r <= 7; r++) {
        for (let y = 29; y <= 40; y++) w.set(q, y, r, y <= 31 ? 'stone' : null);
        if (q >= -5 && q <= 5 && r >= -3 && r <= 3)
          for (let y = 30; y <= 31; y++) {
            w.set(q, y, r, null);
            w.fluids.source(q, y, r, 'water');
          }
        changed.push([q, 31, r]);
      }
    for (let q = -3; q <= -1; q++)
      for (let y = 32; y <= 38; y++) w.set(q, y, 4, 'crimsonwood');
    g.graphics.updateCells(changed);
    g.teleport(3, 32, -6);
    g.lookAt(0, 32.5, 0);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
  });
  await page.waitForTimeout(500);
}
async function waterSample(page, samplePoint = [0, 31.88, -3]) {
  // Wait for complete production frames, including camera matrix updates.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const result = await page.evaluate(async (samplePoint) => {
    const { worldToAxial } = await import('/src/core.js');
    const { fluidHeight } = await import('/src/fluids.js');
    const cell = worldToAxial(samplePoint[0], samplePoint[2]),
      cellY = Math.floor(samplePoint[1]);
    const fluid = window.__hexwild.state.world.fluids.get(
      cell.q,
      cellY,
      cell.r,
    );
    if (fluid?.type !== 'water')
      throw Error('Water sample has no physical water cell');
    const gfx = window.__hexwild.graphics,
      target = gfx.composer.passes[0].target;
    const point = gfx.camera.position
      .clone()
      .set(samplePoint[0], cellY + fluidHeight(fluid), samplePoint[2])
      .project(gfx.camera);
    const x = Math.round((point.x * 0.5 + 0.5) * target.width),
      y = Math.round((point.y * 0.5 + 0.5) * target.height);
    const pixels = new Uint16Array(21 * 21 * 4);
    if (x < 10 || y < 10 || x >= target.width - 10 || y >= target.height - 10)
      throw Error('Water sample is outside the rendered viewport');
    gfx.renderer.readRenderTargetPixels(target, x - 10, y - 10, 21, 21, pixels);
    const background = new Uint16Array(pixels.length);
    gfx.renderer.readRenderTargetPixels(
      gfx.composer.passes[0].opaque,
      x - 10,
      y - 10,
      21,
      21,
      background,
    );
    const flags = new Uint8Array(7 * 7 * 4),
      history = new Uint16Array(flags.length);
    gfx.renderer.readRenderTargetPixels(
      gfx.composer.effects.protection.target,
      x - 3,
      y - 3,
      7,
      7,
      flags,
    );
    gfx.renderer.readRenderTargetPixels(
      gfx.composer.effects.temporal.history[0],
      x - 3,
      y - 3,
      7,
      7,
      history,
    );
    let reactive = 0,
      fresh = 0;
    for (let i = 0; i < flags.length; i += 4) {
      reactive += flags[i + 1] / 255;
      if (history[i + 3] & 0x8000) fresh++;
    }
    return {
      x,
      y,
      width: target.width,
      height: target.height,
      pixels: Array.from(pixels),
      background: Array.from(background),
      temporal: { reactive: reactive / 49, freshRatio: fresh / 49 },
    };
  }, samplePoint);
  const rgb = [0, 0, 0];
  for (let i = 0; i < result.pixels.length; i += 4)
    for (let c = 0; c < 3; c++)
      rgb[c] += DataUtils.fromHalfFloat(result.pixels[i + c]) / (21 * 21);
  const background = [0, 0, 0];
  for (let i = 0; i < result.background.length; i += 4)
    for (let c = 0; c < 3; c++)
      background[c] +=
        DataUtils.fromHalfFloat(result.background[i + c]) / (21 * 21);
  return {
    x: result.x,
    y: result.y,
    rgb,
    background,
    temporal: result.temporal,
  };
}

// An actual tower changes above the water, while the camera, water, clock and
// lighting stay fixed. Only a real scene reflection should change this patch.
test('water reflects current scene geometry and releases optical targets across presets', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page);
  const red = await waterSample(page);
  expect(red.temporal.reactive).toBeGreaterThan(0.9);
  expect(red.temporal.freshRatio).toBeGreaterThan(0.9);
  await page.screenshot({ path: info.outputPath('water-red-tower.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    for (let q = -3; q <= -1; q++)
      for (let y = 32; y <= 38; y++) g.state.world.set(q, y, 4, 'diamondBlock');
    g.graphics.updateCells([[-2, 32, 4]]);
  });
  await page.waitForTimeout(700);
  const cyan = await waterSample(page);
  expect([cyan.x, cyan.y]).toEqual([red.x, red.y]);
  await page.screenshot({ path: info.outputPath('water-cyan-tower.png') });
  const difference = red.rgb.reduce(
    (sum, n, i) => sum + Math.abs(n - cyan.rgb[i]),
    0,
  );
  await writeFile(
    info.outputPath('water-optics.json'),
    JSON.stringify({ red, cyan, difference, errors }, null, 2),
  );
  expect(difference).toBeGreaterThan(0.025);
  expect(cyan.rgb[2] - cyan.rgb[0]).toBeGreaterThan(
    red.rgb[2] - red.rgb[0] + 0.01,
  );
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.graphics.composer.passes[0].opaque.addEventListener(
      'dispose',
      () => (window.waterTargetDisposed = true),
    );
    g.setPlaying(true);
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('0.65');
  await page.locator('#resume').click();
  expect(
    await page.evaluate(() => ({
      disposed: window.waterTargetDisposed,
      composer: window.__hexwild.graphics.composer,
      ready:
        window.__hexwild.graphics.fluidRenderer.waterUniforms.waterSceneReady
          .value,
      depthWrite:
        window.__hexwild.graphics.fluidRenderer.materials.water.depthWrite,
    })),
  ).toEqual({ disposed: true, composer: null, ready: 0, depthWrite: false });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await page.setViewportSize({ width: 960, height: 640 });
  await waterSample(page);
  const resized = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      f = g.composer.passes[0];
    return {
      size: [f.opaque.width, f.opaque.height],
      uniforms: g.fluidRenderer.waterUniforms.waterResolution.value.toArray(),
      ready: g.fluidRenderer.waterUniforms.waterSceneReady.value,
    };
  });
  expect(resized).toEqual({ size: [960, 640], uniforms: [960, 640], ready: 1 });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 30.05, 0);
    g.lookAt(0, 35, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.graphics.fluidRenderer.waterUniforms.waterSceneReady
            .value,
      ),
    )
    .toBe(1);
  await page.screenshot({ path: info.outputPath('underwater.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 70, 0);
    g.lookAt(0, 110, -10);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.graphics.fluidRenderer.waterUniforms.waterSceneReady
            .value,
      ),
    )
    .toBe(0);
  await page.evaluate(() => {
    window.__hexwild.teleport(3, 32, -6);
    window.__hexwild.lookAt(0, 32.5, 0);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hexwild.graphics.fluidRenderer.waterUniforms.waterSceneReady
            .value,
      ),
    )
    .toBe(1);
  await writeFile(
    info.outputPath('water-lifecycle.json'),
    JSON.stringify(
      {
        disposedOnLowPreset: true,
        resized,
        underwaterCaptureEnabled: true,
        offscreenCaptureDisabled: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('deeper water absorbs more red light while a shallow pool retains its floor', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    const cells = [];
    for (let q = 1; q <= 5; q++)
      for (let r = -3; r <= 3; r++) {
        w.set(q, 25, r, 'stone');
        for (let y = 26; y <= 29; y++) {
          w.set(q, y, r, null);
          w.fluids.source(q, y, r, 'water');
        }
        cells.push([q, 29, r]);
      }
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 36, 0);
    g.lookAt(0, 29, 0);
  });
  const shallow = await waterSample(page, [-Math.sqrt(3) * 2, 31.88, 0]);
  const deep = await waterSample(page, [Math.sqrt(3) * 2, 31.88, 0]);
  await page.screenshot({ path: info.outputPath('shallow-deep-water.png') });
  const shallowRatio = shallow.rgb[2] / shallow.rgb[0],
    deepRatio = deep.rgb[2] / deep.rgb[0];
  await page.evaluate(() => {
    const g = window.__hexwild;
    for (let q = -5; q <= 5; q++)
      for (let r = -3; r <= 3; r++)
        g.state.world.set(q, q > 0 ? 25 : 29, r, 'calcite');
    g.graphics.updateCells([
      [-2, 29, 0],
      [2, 25, 0],
    ]);
  });
  const whiteShallow = await waterSample(page, [-Math.sqrt(3) * 2, 31.88, 0]);
  const whiteDeep = await waterSample(page, [Math.sqrt(3) * 2, 31.88, 0]);
  for (const [before, after] of [
    [shallow, whiteShallow],
    [deep, whiteDeep],
  ])
    expect(
      Math.abs(after.background[0] - before.background[0]),
    ).toBeGreaterThan(0.005);
  const response = (before, after) =>
    [0, 1, 2].map((c) =>
      Math.abs(
        (after.rgb[c] - before.rgb[c]) /
          (after.background[c] - before.background[c]),
      ),
    );
  const shallowResponse = response(shallow, whiteShallow),
    deepResponse = response(deep, whiteDeep);
  await writeFile(
    info.outputPath('water-depth.json'),
    JSON.stringify(
      {
        shallow,
        deep,
        whiteShallow,
        whiteDeep,
        shallowRatio,
        deepRatio,
        shallowResponse,
        deepResponse,
        errors,
      },
      null,
      2,
    ),
  );
  // Changing the real floor isolates transmitted light from additive sky,
  // scattering and highlights, and normalizes each floor's own illumination.
  expect(shallowResponse[0]).toBeGreaterThan(deepResponse[0] * 1.5);
  expect(deepResponse[0] / deepResponse[2]).toBeLessThan(
    (shallowResponse[0] / shallowResponse[2]) * 0.75,
  );
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('an elevated source pool and falling water render together at their physical heights', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page);
  const flow = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = 4; q <= 8; q++)
      for (let r = -2; r <= 1; r++) {
        w.set(q, 37, r, 'stone');
        for (let y = 38; y <= 39; y++) {
          const wall = q === 4 || q === 8 || r === -2 || r === 1;
          w.set(q, y, r, wall ? 'stone' : null);
          if (!wall) w.fluids.source(q, y, r, 'water');
        }
        cells.push([q, 39, r]);
      }
    w.set(4, 39, 0, null);
    g.fluidStep(40);
    g.graphics.updateCells(cells);
    g.teleport(2, 42, -5);
    g.lookAt(4, 37, 0);
    return {
      upper: w.fluids.get(6, 39, 0),
      falling: w.fluids.get(3, 35, 0),
      lower: w.fluids.get(2, 31, 0),
    };
  });
  expect(flow.upper.source).toBe(true);
  expect(flow.falling.falling).toBe(true);
  expect(flow.lower.type).toBe('water');
  const sample = await waterSample(page, [Math.sqrt(3) * 6, 39.88, 0]);
  expect(sample.rgb.every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
  expect(sample.rgb.reduce((a, b) => a + b)).toBeGreaterThan(0.02);
  await page.screenshot({
    path: info.outputPath('elevated-pool-and-waterfall.png'),
  });
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('waterfall.json'),
    JSON.stringify({ flow, sample, errors }, null, 2),
  );
});
