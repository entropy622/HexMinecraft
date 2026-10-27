import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

async function pool(page, base = 28) {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate((base) => {
    const g = window.__hexwild,
      w = g.state.world,
      changes = [];
    g.setPlaying(false);
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: false,
    });
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++) {
        w.set(q, base, r, 'calcite');
        for (let y = base + 1; y <= base + 14; y++) {
          w.set(q, y, r, null);
          if (y <= base + 5) w.fluids.source(q, y, r, 'water');
        }
        changes.push([q, base + 1, r]);
      }
    g.graphics.updateCells(changes);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, base + 1, -3);
    g.lookAt(0, base + 1, 2);
  }, base);
}
async function settle(page) {
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
          return (
            g.graphics.voxelLight.revision === g.state.world.lightRevision &&
            g.graphics.relightQueue.size === 0
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function floor(page, region = [0.23, 0.17, 0.77, 0.43]) {
  await settle(page);
  return page
    .evaluate((region) => {
      const g = window.__hexwild.graphics,
        frame = g.composer.passes[0],
        target = g.fluidRenderer.waterUniforms.waterSceneReady.value
          ? frame.opaque
          : frame.target;
      const data = new Uint16Array(target.width * target.height * 4);
      g.renderer.readRenderTargetPixels(
        target,
        0,
        0,
        target.width,
        target.height,
        data,
      );
      // Same central floor region at fixed camera/time; no post-process fog or grading.
      const pixels = [];
      for (
        let y = Math.floor(target.height * region[1]);
        y < Math.floor(target.height * region[3]);
        y++
      )
        for (
          let x = Math.floor(target.width * region[0]);
          x < Math.floor(target.width * region[2]);
          x++
        )
          pixels.push(data[(y * target.width + x) * 4 + 1]);
      return pixels;
    }, region)
    .then((values) => values.map(DataUtils.fromHalfFloat));
}
function change(a, b) {
  const scale = a.reduce((sum, n) => sum + n, 0) / a.length;
  const ratios = a.map((n, i) => b[i] - n);
  const bias = ratios.reduce((sum, n) => sum + n, 0) / ratios.length;
  return (
    Math.sqrt(
      ratios.reduce((sum, n) => sum + (n - bias) ** 2, 0) / ratios.length,
    ) / scale
  );
}

test('animated refracted sunlight changes the real submerged floor before water fog', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page);
  const a = await floor(page);
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('floor-before.png') });
  await page.evaluate(() => window.__hexwild.step(1.3));
  const b = await floor(page),
    variation = change(a, b);
  await page.screenshot({ path: info.outputPath('floor-after.png') });
  await writeFile(
    info.outputPath('floor-motion.json'),
    JSON.stringify(
      {
        variation,
        finite: a.every(Number.isFinite) && b.every(Number.isFinite),
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(variation).toBeGreaterThan(0.02);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({
      antialias: true,
      exposure: true,
      bloom: 0.08,
    }),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const frame = () => {
          if (++n === 20) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await page.screenshot({
    path: info.outputPath('caustics-light-effects.png'),
  });
});

test('a solid cover and a dry or air-gap receiver suppress focused sunlight while local emitters remain visible', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page);
  const results = {};
  const motion = async () => {
    const a = await floor(page);
    await page.evaluate(() => window.__hexwild.step(1.3));
    const b = await floor(page);
    return {
      variation: change(a, b),
      mean: b.reduce((n, v) => n + v, 0) / b.length,
    };
  };
  results.open = await motion();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++) {
        w.set(q, 35, r, 'stone');
        cells.push([q, 35, r]);
      }
    w.set(-1, 29, 0, 'glowstone');
    g.graphics.updateCells([...cells, [-1, 29, 0]]);
  });
  results.covered = await motion();
  await page.screenshot({ path: info.outputPath('covered-pool.png') });
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++) {
        w.set(q, 35, r, null);
        w.fluids.scoop(q, 29, r);
        cells.push([q, 35, r]);
      }
    w.set(-1, 29, 0, null);
    g.graphics.updateCells([...cells, [-1, 29, 0]]);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 28, -3);
    g.lookAt(0, 29, 2);
  });
  results.airGap = await motion();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        for (let y = 30; y <= 33; y++) w.fluids.scoop(q, y, r);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
  });
  results.dry = await motion();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let y = 29; y <= 33; y++) w.fluids.source(0, y, 0, 'water');
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 30, -3);
    g.lookAt(0, 29, 0);
  });
  const narrowA = await floor(page, [0.49, 0.49, 0.51, 0.51]);
  await page.evaluate(() => window.__hexwild.step(1.3));
  const narrowB = await floor(page, [0.49, 0.49, 0.51, 0.51]);
  results.narrowColumn = { variation: change(narrowA, narrowB) };
  await writeFile(
    info.outputPath('eligibility.json'),
    JSON.stringify({ ...results, errors }, null, 2),
  );
  expect(results.open.variation).toBeGreaterThan(0.02);
  for (const name of ['covered', 'airGap', 'dry'])
    expect(results[name].variation, name).toBeLessThan(0.008);
  expect(results.covered.mean).toBeGreaterThan(0.005);
  expect(results.covered.mean).toBeLessThan(results.open.mean);
  expect(results.narrowColumn.variation).toBeLessThan(0.008);
  expect(errors).toEqual([]);
});

test('real hierarchical and instanced mob materials share water lighting and a moving model samples its new location', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page);
  await page.evaluate(async () => {
    const { createMob } = await import('/src/mob-graphics.js'),
      g = window.__hexwild;
    window.causticMob = createMob('sheep', g.graphics.textures);
    window.causticMob.position.set(0, 29, 1.5);
    g.graphics.scene.add(window.causticMob);
    const blaze = createMob('blaze', g.graphics.textures);
    blaze.position.set(2, 29, 1.5);
    g.graphics.scene.add(blaze);
    g.teleport(0, 30, -1);
    g.lookAt(0, 29.85, 1);
  });
  const sample = async () => {
    await settle(page);
    const values = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        m = window.causticMob,
        t = g.composer.passes[0].target;
      const p = m.position
        .clone()
        .add({ x: 0, y: 1.1, z: 0.06 })
        .project(g.camera);
      const x = Math.round((p.x * 0.5 + 0.5) * t.width),
        y = Math.round((p.y * 0.5 + 0.5) * t.height),
        data = new Uint16Array(13 * 13 * 4);
      g.renderer.readRenderTargetPixels(t, x - 6, y - 6, 13, 13, data);
      return {
        values: Array.from(data),
        gl: g.renderer.getContext().getError(),
      };
    });
    return {
      green: values.values
        .filter((_, i) => i % 4 === 1)
        .map(DataUtils.fromHalfFloat),
      gl: values.gl,
    };
  };
  const a = await sample();
  await page.evaluate(() => window.__hexwild.step(1.3));
  const b = await sample();
  const variation = change(a.green, b.green);
  await page.screenshot({ path: info.outputPath('underwater-models.png') });
  await page.evaluate(() => {
    window.causticMob.position.x += 0.75;
    window.__hexwild.lookAt(0.75, 30, 1.5);
  });
  const moved = await sample();
  expect(variation).toBeGreaterThan(0.01);
  expect(moved.green.every(Number.isFinite)).toBe(true);
  expect([a.gl, b.gl, moved.gl]).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('models.json'),
    JSON.stringify(
      {
        variation,
        movedMean: moved.green.reduce((s, n) => s + n, 0) / moved.green.length,
        gl: [a.gl, b.gl, moved.gl],
        errors,
      },
      null,
      2,
    ),
  );
});

test('shallow and flowing water, streamed camera motion, real quality controls and Continue keep sunlight tied to the actual surface', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await pool(page, 44);
  async function point() {
    await settle(page);
    const result = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        f = g.composer.passes[0],
        t = g.fluidRenderer.waterUniforms.waterSceneReady.value
          ? f.opaque
          : f.target;
      const p = g.camera.position.clone().set(0.17, 45, 3.11).project(g.camera);
      const x = Math.round((p.x * 0.5 + 0.5) * t.width),
        y = Math.round((p.y * 0.5 + 0.5) * t.height),
        pixels = new Uint16Array(3 * 3 * 4);
      g.renderer.readRenderTargetPixels(t, x - 1, y - 1, 3, 3, pixels);
      return Array.from(pixels);
    });
    return [0, 1, 2].map(
      (c) =>
        result
          .filter((_, i) => i % 4 === c)
          .reduce((sum, v) => sum + DataUtils.fromHalfFloat(v), 0) / 9,
    );
  }
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-1, 46, -3);
    g.lookAt(0, 45, 2);
  });
  const left = await point();
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(90, 40, 0);
    g.teleport(1, 46, -3);
    g.lookAt(0, 45, 2);
  });
  const right = await point(),
    anchorDifference =
      Math.abs(left[1] - right[1]) / Math.max(left[1], right[1]);
  expect(anchorDifference).toBeLessThan(0.12);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        for (let y = 46; y <= 49; y++) w.fluids.scoop(q, y, r);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 46, -3);
    g.lookAt(0, 45, 2);
  });
  const shallowA = await floor(page);
  await page.evaluate(() => window.__hexwild.step(1.3));
  const shallowB = await floor(page);
  const shallowVariation = change(shallowA, shallowB);
  expect(shallowVariation).toBeGreaterThan(0.004);
  const heights = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 12; r++)
        if (q !== 0 || r !== 0) w.fluids.scoop(q, 45, r);
    g.fluidStep(24);
    const f = w.fluids.get(1, 45, 0);
    return {
      source: w.fluids.height(0, 45, 0),
      flow: w.fluids.height(1, 45, 0),
      level: f?.level,
    };
  });
  expect(heights.source).toBe(0.92);
  expect(heights.flow).toBeGreaterThan(0);
  expect(heights.flow).toBeLessThan(0.92);
  await settle(page);
  await page.screenshot({ path: info.outputPath('shallow-stream.png') });
  await page.setViewportSize({ width: 930, height: 640 });
  await settle(page);
  const textures = await page.evaluate(
    () => window.__hexwild.graphics.renderer.info.memory.textures,
  );
  await page.evaluate(() => window.__hexwild.setPlaying(true));
  await page.keyboard.press('Escape');
  const bypass = [];
  for (const quality of ['0.65', '1', '1.7']) {
    await page.locator('#quality').selectOption(quality);
    await page.locator('#resume').click();
    await page.evaluate(() => window.__hexwild.setPlaying(false));
    await settle(page);
    bypass.push(
      await page.evaluate(() => ({
        quality: window.__hexwild.graphics.quality,
        enabled:
          window.__hexwild.graphics.dynamicLight.uniforms.waterSunlight.value,
        post: !!window.__hexwild.graphics.composer,
      })),
    );
    await page.evaluate(() => window.__hexwild.setPlaying(true));
    await page.keyboard.press('Escape');
  }
  expect(bypass.map((p) => p.enabled)).toEqual([0, 0, 1]);
  expect(bypass.map((p) => p.post)).toEqual([false, false, true]);
  await page.locator('#resume').click();
  await page.evaluate(() => {
    window.__hexwild.setPlaying(false);
    window.__hexwild.save();
  });
  await page.reload();
  await page.locator('#continue').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await settle(page);
  const restored = await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    return {
      height: w.fluids.height(1, 45, 0),
      enabled: g.graphics.dynamicLight.uniforms.waterSunlight.value,
      textures: g.graphics.renderer.info.memory.textures,
    };
  });
  expect(restored.height).toBe(heights.flow);
  expect(restored.enabled).toBe(1);
  expect(restored.textures).toBeLessThan(textures + 5);
  await page.evaluate(() => window.__hexwild.step(300));
  await settle(page);
  const night = await page.evaluate(
    () => window.__hexwild.graphics.dynamicLight.uniforms.waterSunlight.value,
  );
  expect(night).toBe(0);
  const dimensions = [];
  for (const dimension of ['nether', 'end', 'overworld']) {
    await page.evaluate((d) => window.__hexwild.travel(d), dimension);
    await settle(page);
    dimensions.push({
      dimension,
      enabled: await page.evaluate(
        () =>
          window.__hexwild.graphics.dynamicLight.uniforms.waterSunlight.value,
      ),
    });
  }
  expect(dimensions.map((d) => d.enabled)).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('lifecycle.json'),
    JSON.stringify(
      {
        left,
        right,
        anchorDifference,
        shallowVariation,
        heights,
        bypass,
        restored,
        night,
        dimensions,
        errors,
      },
      null,
      2,
    ),
  );
});
