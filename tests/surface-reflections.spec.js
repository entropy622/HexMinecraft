import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test('native metal and gems reflect actual colored walls and the shared sky while dry stone stays diffuse', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(() => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      cells = [];
    api.setPlaying(false);
    api.step(120 - api.state.time);
    g.setQuality(1.7);
    g.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: true,
    });
    for (let q = -8; q <= 8; q++)
      for (let r = -7; r <= 8; r++)
        for (let y = 30; y < 64; y++) {
          let type = null;
          if (y === 30)
            type = q < -1 ? 'ironBlock' : q > 1 ? 'diamondBlock' : 'stone';
          if (r === -5 && y >= 31 && y <= 38) type = 'redWool';
          w.set(q, y, r, type);
          cells.push([q, y, r]);
        }
    g.updateCells(cells);
    api.teleport(0, 35, 9);
    g.stepOffset = 0;
    g.camera.position.set(0, 35, 14);
    g.camera.lookAt(0, 31, 0);
    g.camera.updateMatrixWorld();
  });
  async function ready() {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              g.voxelLight.revision === g.world.lightRevision &&
              !g.skyEnvironment.atmosphere.pending
            );
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 24;
          function step() {
            if (--n) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        }),
    );
  }
  async function probe() {
    return page.evaluate(async () => {
      const { probeSurfaceReflections } =
        await import('/tests/fixtures/surface-reflection-probe.js');
      return probeSurfaceReflections(window.__hexwild.graphics);
    });
  }
  await ready();
  const red = await probe();
  await page.screenshot({ path: info.outputPath('red-wall-reflection.png') });
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      w = g.world,
      cells = [];
    for (let q = -8; q <= 8; q++)
      for (let y = 31; y <= 38; y++) {
        w.set(q, y, -5, 'blueWool');
        cells.push([q, y, -5]);
      }
    g.updateCells(cells);
  });
  await ready();
  const blue = await probe();
  await page.screenshot({ path: info.outputPath('blue-wall-reflection.png') });
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      w = g.world,
      cells = [];
    for (let q = -12; q <= 12; q++)
      for (let r = -10; r <= 10; r++) {
        w.set(q, 42, r, 'stone');
        cells.push([q, 42, r]);
        // Close the sides as well: the source fallback deliberately retains
        // lateral skylight beneath an open, high canopy.
        if (Math.abs(q) === 12 || Math.abs(r) === 10)
          for (let y = 28; y < 42; y++) {
            w.set(q, y, r, 'stone');
            cells.push([q, y, r]);
          }
      }
    g.updateCells(cells);
  });
  await ready();
  const roof = await probe();
  await page.screenshot({ path: info.outputPath('roofed-reflection.png') });
  await writeFile(
    info.outputPath('native-reflections.json'),
    JSON.stringify({ red, blue, roof, messages }, null, 2),
  );
  for (const p of [red, blue]) {
    expect(p.layout).toHaveLength(3);
    expect(p.gl).toBe(0);
    for (const result of Object.values(p.results)) {
      expect(result.invalid).toBe(0);
      for (const category of [0, 12, 13])
        expect(result.classes[category].count).toBeGreaterThan(100);
      expect(result.classes[0].rgb).toEqual([0, 0, 0]);
    }
    expect(p.results.ssr.classes[12].lit).toBeGreaterThan(50);
    expect(p.results.sky.classes[12].lit).toBeGreaterThan(50);
    expect(p.results.full.classes[13].lit).toBeGreaterThan(50);
  }
  expect(red.results.ssr.classes[12].rgb[0]).toBeGreaterThan(
    blue.results.ssr.classes[12].rgb[0] * 1.2,
  );
  expect(blue.results.ssr.classes[12].rgb[2]).toBeGreaterThan(
    red.results.ssr.classes[12].rgb[2] * 1.2,
  );
  expect(roof.gl).toBe(0);
  expect(roof.results.sky.classes[12].count).toBeGreaterThan(100);
  for (let c = 0; c < 3; c++)
    expect(roof.results.sky.classes[12].rgb[c]).toBeLessThan(
      blue.results.sky.classes[12].rgb[c] * 0.15,
    );
  const restoration = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      p = g.composer.effects.protection,
      r = g.renderer,
      rows = [];
    const original = r.render,
      target = r.getRenderTarget(),
      background = g.scene.background,
      override = g.scene.overrideMaterial,
      shadows = r.shadowMap.enabled,
      autoClear = r.autoClear,
      cameraMask = g.camera.layers.mask;
    g.scene.traverse((o) => rows.push([o, o.material, o.layers.mask]));
    let caught = '';
    r.render = function (...args) {
      if (this.getRenderTarget() === p.target)
        throw Error('surface metadata boundary failure');
      return original.apply(this, args);
    };
    try {
      p.render(r);
    } catch (e) {
      caught = e.message;
    } finally {
      r.render = original;
      r.setRenderTarget(target);
    }
    return {
      caught,
      materials: rows.every(([o, m]) => o.material === m),
      layers: rows.every(([o, , mask]) => o.layers.mask === mask),
      camera: g.camera.layers.mask === cameraMask,
      scene:
        g.scene.background === background &&
        g.scene.overrideMaterial === override,
      renderer: r.shadowMap.enabled === shadows && r.autoClear === autoClear,
      gl: r.getContext().getError(),
    };
  });
  await writeFile(
    info.outputPath('failed-draw-restoration.json'),
    JSON.stringify(restoration, null, 2),
  );
  expect(restoration).toEqual({
    caught: 'surface metadata boundary failure',
    materials: true,
    layers: true,
    camera: true,
    scene: true,
    renderer: true,
    gl: 0,
  });
  expect(messages).toEqual({ errors: [], warnings: [] });
});
