import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 720, height: 540 });
});
async function frames(page, n = 3) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const next = () => (--n ? requestAnimationFrame(next) : resolve());
        requestAnimationFrame(next);
      }),
    n,
  );
}
async function fresh(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            g.relightQueue.size === 0
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await frames(page);
}
async function setup(page) {
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    g.setPlaying(false);
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: false,
    });
    for (let q = -12; q <= 12; q++)
      for (let r = -12; r <= 12; r++) {
        w.set(q, 39, r, 'calcite');
        for (let y = 40; y <= 62; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(0, 57, 9);
    g.lookAt(-2, 40, 2);
    g.graphics.stepOffset = 0;
  });
  await fresh(page);
}
async function clock(page, time) {
  await page.evaluate((time) => {
    const g = window.__hexwild;
    g.step(time - g.state.time);
    g.teleport(0, 57, time === 450 ? -9 : 9);
    g.lookAt(time === 450 ? 2 : -2, 40, time === 450 ? -2 : 2);
    g.graphics.stepOffset = 0;
    g.graphics.renderer.shadowMap.needsUpdate = true;
  }, time);
  await frames(page);
}
async function caster(page, height) {
  await page.evaluate((height) => {
    const g = window.__hexwild,
      w = g.state.world;
    for (const y of [41, 49]) w.set(0, y, 0, y === height ? 'stone' : null);
    g.graphics.updateCells([
      [0, 41, 0],
      [0, 49, 0],
    ]);
  }, height);
  await fresh(page);
}
async function line(page, height) {
  const raw = await page.evaluate((height) => {
    const g = window.__hexwild.graphics,
      t = g.composer.passes[0].target,
      data = new Uint16Array(t.width * t.height * 4),
      light = g.sun.position.clone().sub(g.sun.target.position).normalize(),
      center = {
        x: (-(height + 0.5 - 40) * light.x) / light.y,
        z: (-(height + 0.5 - 40) * light.z) / light.y,
      },
      length = Math.hypot(light.x, light.z),
      axis = { x: light.z / length, z: -light.x / length };
    const read = () => {
      const result = [];
      g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
      for (let i = 0; i <= 400; i++) {
        const offset = (i - 200) * 0.015,
          v = g.camera.position
            .clone()
            .set(center.x + axis.x * offset, 40.015, center.z + axis.z * offset)
            .project(g.camera),
          x = Math.round((v.x * 0.5 + 0.5) * t.width),
          y = Math.round((v.y * 0.5 + 0.5) * t.height);
        if (x < 0 || y < 0 || x >= t.width || y >= t.height)
          throw Error('Ground scan leaves the viewport');
        const p = (y * t.width + x) * 4;
        result.push(data[p], data[p + 1], data[p + 2]);
      }
      return result;
    };
    // Paired real scene draws isolate the sun/moon term. A low floating block
    // also changes voxel ambient light, which is not the penumbra under test.
    const intensity = g.sun.intensity,
      target = g.renderer.getRenderTarget(),
      lit = read();
    try {
      g.sun.intensity = 0;
      g.composer.passes[0].beauty.render(g.renderer, null, t);
      return { lit, ambient: read() };
    } finally {
      g.sun.intensity = intensity;
      g.composer.passes[0].beauty.render(g.renderer, null, t);
      g.renderer.setRenderTarget(target);
    }
  }, height);
  const rgb = raw.lit.map((v, i) =>
    Math.max(
      0,
      DataUtils.fromHalfFloat(v) - DataUtils.fromHalfFloat(raw.ambient[i]),
    ),
  );
  return Array.from(
    { length: 401 },
    (_, i) =>
      rgb[i * 3] * 0.2126 + rgb[i * 3 + 1] * 0.7152 + rgb[i * 3 + 2] * 0.0722,
  );
}
function penumbra(lit, shadowed) {
  const ratio = lit.map((v, i) => shadowed[i] / Math.max(v, 0.00001)),
    min = Math.min(...ratio.slice(150, 251)),
    occlusion = ratio.map((v) =>
      Math.max(0, Math.min(1, (1 - v) / Math.max(0.01, 1 - min))),
    ),
    smooth = occlusion.map(
      (_, i) =>
        occlusion
          .slice(Math.max(0, i - 2), Math.min(401, i + 3))
          .reduce((a, b) => a + b, 0) /
        (Math.min(401, i + 3) - Math.max(0, i - 2)),
    ),
    widths = [-1, 1].map((side) => {
      const edge = (threshold) => {
        for (let i = 0; i <= 200; i++)
          if (smooth[200 + side * i] < threshold) return i * 0.015;
        throw Error('Shadow edge not found');
      };
      return edge(0.1) - edge(0.9);
    });
  return {
    width: (widths[0] + widths[1]) / 2,
    widths,
    minRatio: min,
    finite: ratio.every(Number.isFinite),
    ratio,
  };
}

test('real suspended blocks produce wider daylight and moonlight penumbras than contact shadows', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  const results = [];
  for (const time of [120, 450]) {
    await clock(page, time);
    await caster(page, null);
    const litLow = await line(page, 41),
      litHigh = await line(page, 49);
    await caster(page, 41);
    const low = penumbra(litLow, await line(page, 41));
    await page.screenshot({ path: info.outputPath(`contact-${time}.png`) });
    await caster(page, 49);
    const high = penumbra(litHigh, await line(page, 49));
    await page.screenshot({ path: info.outputPath(`suspended-${time}.png`) });
    results.push({ time, low, high });
    await writeFile(
      info.outputPath('penumbras.json'),
      JSON.stringify({ results, errors }, null, 2),
    );
    expect(low.finite && high.finite).toBe(true);
    expect(low.minRatio).toBeLessThan(0.85);
    expect(high.minRatio).toBeLessThan(0.85);
    expect(high.width).toBeGreaterThan(low.width * 1.6);
    expect(high.width - low.width).toBeGreaterThan(0.15);
  }
  expect(results[1].high.width).toBeLessThan(results[0].high.width * 0.95);
  await clock(page, 120);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.set(-4, 41, 0, 'stone');
    g.graphics.updateCells([[-4, 41, 0]]);
    g.teleport(6, 43, 6);
    g.lookAt(-1, 44, 2);
    g.graphics.stepOffset = 0;
  });
  await fresh(page);
  await page.keyboard.press('F1');
  await page.screenshot({
    path: info.outputPath('soft-shadow-comparison.png'),
  });
  expect(errors).toEqual([]);
});

test('real water, building and mob materials survive quality, resize and graphics context restoration', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  await clock(page, 120);
  await page.evaluate(async () => {
    const { createMob } = await import('/src/mob-graphics.js'),
      g = window.__hexwild,
      w = g.state.world,
      cells = [];
    w.set(-2, 40, 0, 'fence');
    w.set(-3, 40, 0, 'dropper');
    w.setState(-3, 40, 0, { facing: 7, open: false, powered: false });
    for (let q = 2; q <= 4; q++)
      for (let r = 1; r <= 3; r++) w.fluids.source(q, 40, r, 'water');
    cells.push([-2, 40, 0], [-3, 40, 0], [3, 40, 2]);
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    const mob = createMob('pig', g.graphics.textures);
    mob.position.set(1.732, 40, 0);
    g.graphics.scene.add(mob);
    g.give('dropper', 1);
    g.selectItem('dropper');
    g.graphics.setPostOptions({ antialias: true });
  });
  await fresh(page);
  const states = [];
  for (const quality of [1.7, 1, 0.65, 1.7]) {
    await page.evaluate(
      (quality) => window.__hexwild.graphics.setQuality(quality),
      quality,
    );
    await frames(page, 5);
    const state = await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      return {
        quality: g.quality,
        shadows: g.renderer.shadowMap.enabled,
        type: g.renderer.shadowMap.type,
        rawDepth: g.sun.shadow.map?.depthTexture.compareFunction === null,
        waterCapture: g.fluidRenderer.waterUniforms.waterSceneReady.value,
        glError: g.renderer.getContext().getError(),
      };
    });
    states.push(state);
    expect(state.glError).toBe(0);
    expect(state.shadows).toBe(quality >= 1);
    if (quality === 1.7) {
      expect(state.rawDepth).toBe(true);
      expect(state.waterCapture).toBe(1);
    }
  }
  await page.setViewportSize({ width: 800, height: 600 });
  await frames(page, 5);
  await page.screenshot({ path: info.outputPath('water-models.png') });
  const supported = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      extension = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.softShadowRestored = false;
    g.renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => {
        window.softShadowRestored = true;
      },
      { once: true },
    );
    window.restoreSoftShadowContext = () => extension.restoreContext();
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreSoftShadowContext());
  await expect
    .poll(() => page.evaluate(() => window.softShadowRestored), {
      timeout: 30000,
    })
    .toBe(true);
  await frames(page, 8);
  const restored = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return {
      rawDepth: g.sun.shadow.map?.depthTexture.compareFunction === null,
      width: g.composer.passes[0].target.width,
      waterCapture: g.fluidRenderer.waterUniforms.waterSceneReady.value,
      glError: g.renderer.getContext().getError(),
    };
  });
  expect(restored.rawDepth).toBe(true);
  expect(restored.width).toBe(800);
  expect(restored.waterCapture).toBe(1);
  expect(restored.glError).toBe(0);
  expect((await line(page, 49)).every(Number.isFinite)).toBe(true);
  await page.screenshot({ path: info.outputPath('restored.png') });
  await writeFile(
    info.outputPath('lifecycle.json'),
    JSON.stringify({ states, restored, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
