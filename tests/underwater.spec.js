import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

async function aquarium(page) {
  await page.setViewportSize({ width: 800, height: 600 });
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
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: true,
    });
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++) {
        w.set(q, 28, r, 'calcite');
        for (let y = 29; y <= 42; y++) {
          w.set(q, y, r, null);
          if (y <= 35) w.fluids.source(q, y, r, 'water');
        }
        changed.push([q, 29, r]);
      }
    for (const [q, r] of [
      [-3, 0],
      [0, 8],
    ])
      for (let dq = -1; dq <= 1; dq++)
        for (let y = 29; y <= 35; y++) w.set(q + dq, y, r, 'stone');
    g.graphics.updateCells(changed);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 30.65, -4);
    g.lookAt(-3, 32.3, 4);
  });
}
async function settled(page) {
  // Observe a fresh render first: medium changes can reset the frame counter.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild;
          return {
            revision:
              g.graphics.voxelLight.revision === g.state.world.lightRevision,
            pending: g.graphics.relightQueue.size,
          };
        }),
      { timeout: 30000 },
    )
    .toEqual({ revision: true, pending: 0 });
  const start = await page.evaluate(
    () => window.__hexwild.graphics.composer.effects.temporal.frames,
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.graphics.composer.effects.temporal.frames,
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(start + 16);
}
async function patches(page) {
  await settled(page);
  const result = await page.evaluate(async () => {
    const { axialToWorld } = await import('/src/core.js'),
      g = window.__hexwild.graphics,
      raw = g.composer.passes[0].target,
      final = g.composer.effects.temporal.history[0];
    return [
      [-3, 0],
      [0, 8],
    ].map(([q, r]) => {
      const p = axialToWorld(q, r),
        v = g.camera.position
          .clone()
          .set(p.x, 32.3, p.z - 0.9)
          .project(g.camera),
        x = Math.round((v.x * 0.5 + 0.5) * raw.width),
        y = Math.round((v.y * 0.5 + 0.5) * raw.height);
      if (x < 5 || y < 5 || x >= raw.width - 5 || y >= raw.height - 5)
        throw Error(`Target outside viewport: ${q},${r} at ${x},${y}`);
      const input = new Uint16Array(11 * 11 * 4),
        output = new Uint16Array(input.length);
      g.renderer.readRenderTargetPixels(raw, x - 5, y - 5, 11, 11, input);
      g.renderer.readRenderTargetPixels(final, x - 5, y - 5, 11, 11, output);
      return {
        q,
        r,
        x,
        y,
        input: Array.from(input),
        output: Array.from(output),
      };
    });
  });
  return result.map((p) => {
    const mean = (values) =>
      [0, 1, 2].map((c) => {
        let total = 0;
        for (let i = c; i < values.length; i += 4)
          total += DataUtils.fromHalfFloat(values[i]);
        return total / (values.length / 4);
      });
    return { q: p.q, r: p.r, input: mean(p.input), output: mean(p.output) };
  });
}

test('submerged near and far surfaces receive distinct colored absorption through real HDR rendering', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await aquarium(page);
  const stone = await patches(page);
  await page.screenshot({ path: info.outputPath('underwater-stone.png') });
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (const [q, r] of [
      [-3, 0],
      [0, 8],
    ])
      for (let dq = -1; dq <= 1; dq++)
        for (let y = 29; y <= 35; y++) {
          g.state.world.set(q + dq, y, r, 'calcite');
          cells.push([q + dq, y, r]);
        }
    g.graphics.updateCells(cells);
  });
  const white = await patches(page),
    response = stone.map((before, i) =>
      [0, 1, 2].map((c) =>
        Math.abs(
          (white[i].output[c] - before.output[c]) /
            (white[i].input[c] - before.input[c]),
        ),
      ),
    );
  await page.screenshot({ path: info.outputPath('underwater-calcite.png') });
  await writeFile(
    info.outputPath('absorption.json'),
    JSON.stringify({ stone, white, response, errors }, null, 2),
  );
  for (let i = 0; i < 2; i++)
    for (let c = 0; c < 3; c++)
      expect(Math.abs(white[i].input[c] - stone[i].input[c])).toBeGreaterThan(
        0.005,
      );
  expect(response[1][0]).toBeLessThan(response[0][0] * 0.65);
  expect(response[1][0] / response[1][2]).toBeLessThan(
    (response[0][0] / response[0][2]) * 0.65,
  );
  expect(response[0][0]).toBeLessThan(0.85);
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});

async function fogMean(page, side = 32) {
  await settled(page);
  const pixels = await page.evaluate((side) => {
    const g = window.__hexwild.graphics,
      pass = g.composer.passes.find((p) => p.volume && p.composite),
      t = pass.target,
      data = new Uint16Array(side * side * 4);
    g.renderer.readRenderTargetPixels(
      t,
      Math.floor(t.width / 2) - side / 2,
      Math.floor(t.height / 2) - side / 2,
      side,
      side,
      data,
    );
    return Array.from(data);
  }, side);
  return [0, 1, 2, 3].map((c) => {
    let sum = 0;
    for (let i = c; i < pixels.length; i += 4)
      sum += DataUtils.fromHalfFloat(pixels[i]);
    return sum / (pixels.length / 4);
  });
}

test('covered water loses solar scattering while a real emitter lights its occupied volume', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await aquarium(page);
  const open = await fogMean(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++) {
        g.state.world.set(q, 36, r, 'stone');
        cells.push([q, 36, r]);
      }
    g.graphics.updateCells(cells);
  });
  const covered = await fogMean(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(1, 32, -4, 'glowstone');
    g.graphics.updateBlock(1, 32, -4);
  });
  const lit = await fogMean(page);
  await page.screenshot({
    path: info.outputPath('underwater-local-light.png'),
  });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(1, 32, -4, null);
    g.graphics.updateBlock(1, 32, -4);
  });
  const removed = await fogMean(page);
  await writeFile(
    info.outputPath('scattering.json'),
    JSON.stringify({ open, covered, lit, removed, errors }, null, 2),
  );
  expect(covered[1]).toBeLessThan(open[1] * 0.25);
  expect(lit[0]).toBeGreaterThan(covered[0] + 0.001);
  expect(lit[1]).toBeGreaterThan(covered[1] + 0.001);
  expect(removed[0]).toBeLessThan(lit[0] * 0.35);
  // A solid emitter displaces water; occupied path length need not stay equal.
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        if (q % 4 === 0) {
          g.state.world.set(q, 36, r, null);
          cells.push([q, 36, r]);
        }
    g.graphics.updateCells(cells);
    g.graphics.setPostOptions({
      ...g.graphics.postOptions,
      exposure: true,
      bloom: 0.12,
    });
    g.lookAt(4, 35, -8);
  });
  const shafts = await fogMean(page);
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('water-shafts.png') });
  await page.evaluate(() => window.__hexwild.step(3));
  const later = await fogMean(page),
    motion = shafts
      .slice(0, 3)
      .reduce((sum, n, c) => sum + Math.abs(n - later[c]), 0);
  await page.screenshot({ path: info.outputPath('water-shafts-later.png') });
  await writeFile(
    info.outputPath('shafts.json'),
    JSON.stringify({ shafts, later, motion, errors }, null, 2),
  );
  expect(shafts[1]).toBeGreaterThan(covered[1] * 2);
  expect(motion).toBeGreaterThan(0.0001);
  expect(errors).toEqual([]);
});

test('physical waterlines, changed flow levels, liquid identity and quality/save lifecycle stay synchronized', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await aquarium(page);
  // Tiny cuts cross only the physical waterline, below the old camera-cut threshold.
  async function transition(feet, type) {
    return page.evaluate(
      async ({ feet, type }) => {
        const g = window.__hexwild,
          w = g.state.world;
        if (type) {
          w.fluids.scoop(0, 35, -4);
          w.fluids.source(0, 35, -4, type);
        }
        g.teleport(0, feet, -4);
        g.lookAt(-3, feet + 1.65, 4);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return {
          medium: g.graphics.fluidRenderer.medium,
          water: g.graphics.atmosphere.uniforms.waterCamera.value,
          frames: g.graphics.composer.effects.temporal.frames,
        };
      },
      { feet, type },
    );
  }
  const interior = await transition(31.3);
  expect(interior.medium).toBe('water');
  const below = await transition(34.24),
    above = await transition(34.3);
  expect(below.medium).toBe('water');
  expect(above.medium).toBe(null);
  expect(above.water).toBe(0);
  expect(above.frames).toBeLessThanOrEqual(3);
  const water = await transition(34.24),
    glow = await transition(34.24, 'glow');
  expect(water.water).toBe(1);
  expect(glow).toMatchObject({ medium: 'glow', water: 0 });
  expect(glow.frames).toBeLessThanOrEqual(3);
  await transition(34.24, 'water');
  // Drive actual fluid simulation: only the camera cell retains a source,
  // surrounding top cells become lower streams rather than full-height water.
  const sourceFog = await fogMean(page, 8);
  const stream = await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        if (q !== 0 || r !== -4) w.fluids.scoop(q, 35, r);
    g.fluidStep(120);
    return w.fluids.get(1, 35, -4);
  });
  const streamFog = await fogMean(page, 8);
  expect(stream.source).toBe(false);
  expect(stream.level).toBeGreaterThan(0);
  expect(streamFog[3]).toBeLessThan(sourceFog[3] * 0.5);
  await page.evaluate(() => {
    const g = window.__hexwild;
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        g.state.world.fluids.source(q, 35, r, 'water');
  });
  const refilledFog = await fogMean(page, 8);
  expect(refilledFog[3]).toBeGreaterThan(streamFog[3] * 1.5);
  const flow = await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world;
    w.fluids.scoop(0, 35, -4);
    g.fluidStep(80);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      medium: g.graphics.fluidRenderer.medium,
      height: (await import('/src/fluids.js')).fluidHeight(
        w.fluids.get(0, 35, -4),
      ),
    };
  });
  expect(flow.height).toBeLessThan(0.89);
  expect(flow.medium).toBe(null);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.fluids.source(0, 35, -4, 'water');
    g.teleport(0, 30.65, -4);
    g.setPlaying(true);
  });
  await expect
    .poll(() =>
      page.locator('#underwater').evaluate((e) => getComputedStyle(e).display),
    )
    .toBe('none');
  await page.evaluate(() => {
    const pass = window.__hexwild.graphics.composer.passes.find(
      (p) => p.volume && p.composite,
    );
    pass.target.addEventListener(
      'dispose',
      () => (window.waterFogDisposed = true),
    );
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('0.65');
  await page.locator('#resume').click();
  await expect
    .poll(() =>
      page.locator('#underwater').evaluate((e) => getComputedStyle(e).display),
    )
    .toBe('block');
  expect(await page.evaluate(() => window.waterFogDisposed)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await expect
    .poll(() =>
      page.locator('#underwater').evaluate((e) => getComputedStyle(e).display),
    )
    .toBe('none');
  await page.setViewportSize({ width: 840, height: 620 });
  const fogSize = () =>
    page.evaluate(() => {
      const pass = window.__hexwild.graphics.composer.passes.find(
        (p) => p.volume && p.composite,
      );
      return [pass.target.width, pass.target.height];
    });
  await expect.poll(fogSize).toEqual([420, 310]);
  const size = await fogSize();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__hexwild.save());
  await page.reload();
  await page.locator('#continue').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__hexwild.graphics.atmosphere.uniforms.waterCamera.value,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.locator('#underwater').evaluate((e) => getComputedStyle(e).display),
    )
    .toBe('none');
  await page.screenshot({ path: info.outputPath('water-restored.png') });
  await page.keyboard.press('Escape');
  await page.locator('[data-dimension="nether"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.world.dimension))
    .toBe('nether');
  expect(
    await page.evaluate(
      () => window.__hexwild.graphics.atmosphere.uniforms.waterCamera.value,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  await writeFile(
    info.outputPath('lifecycle.json'),
    JSON.stringify(
      {
        interior,
        below,
        above,
        water,
        glow,
        flow,
        stream,
        sourceFog,
        streamFog,
        refilledFog,
        disposed: true,
        size,
        restored: true,
        netherClearsWater: true,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('deep water retains visible floor illumination instead of exhausting sky light in a few layers', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await aquarium(page);
  await page.evaluate(() => window.__hexwild.lookAt(0, 29, 0));
  async function floorInput() {
    await settled(page);
    const pixels = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        t = g.composer.passes[0].target,
        data = new Uint16Array(11 * 11 * 4);
      g.renderer.readRenderTargetPixels(
        t,
        Math.floor(t.width / 2) - 5,
        Math.floor(t.height / 2) - 5,
        11,
        11,
        data,
      );
      return Array.from(data);
    });
    return [0, 1, 2].map((c) => {
      let sum = 0;
      for (let i = c; i < pixels.length; i += 4)
        sum += DataUtils.fromHalfFloat(pixels[i]);
      return sum / (pixels.length / 4);
    });
  }
  const wet = await floorInput();
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, exposure: true, bloom: 0.12 });
  });
  await settled(page);
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('underwater-lit-floor.png') });
  await page.evaluate(() => {
    const g = window.__hexwild;
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        for (let y = 29; y <= 35; y++) g.state.world.fluids.scoop(q, y, r);
  });
  const dry = await floorInput(),
    ratio = wet[1] / dry[1];
  await writeFile(
    info.outputPath('floor-light.json'),
    JSON.stringify(
      { wet, dry, greenIlluminationRatio: ratio, errors },
      null,
      2,
    ),
  );
  expect(ratio).toBeGreaterThan(0.1);
  expect(ratio).toBeLessThan(1);
  expect(errors).toEqual([]);
});
