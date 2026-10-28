import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';
import { GLASS_TYPES } from '../src/dye-data.js';

test.setTimeout(240000);
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
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width: 720, height: 540 });
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
    g.step(120 - g.state.time);
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: false,
    });
    for (let q = -8; q <= 8; q++)
      for (let r = -8; r <= 8; r++) {
        w.set(q, 39, r, 'calcite');
        for (let y = 40; y < 63; y++) w.set(q, y, r, null);
        cells.push([q, 39, r]);
      }
    g.graphics.updateCells(cells);
    g.teleport(0, 50, 5);
    g.graphics.stepOffset = 0;
    window.glassProbeCells = [];
  });
  await fresh(page);
  await clock(page, 120);
}
async function clock(page, time, q = 0, r = 0) {
  await page.evaluate((time) => {
    const g = window.__hexwild;
    g.step(time - g.state.time);
  }, time);
  await frames(page);
  await page.evaluate(
    async ({ q, r }) => {
      const { axialToWorld } = await import('/src/core.js');
      const g = window.__hexwild.graphics,
        d = g.sun.position.clone().sub(g.sun.target.position).normalize();
      const origin = axialToWorld(q, r);
      const center = {
        x: origin.x + (-4.5 * d.x) / d.y,
        y: 40.01,
        z: origin.z + (-4.5 * d.z) / d.y,
      };
      const length = Math.hypot(d.x, d.z);
      g.camera.position.set(
        center.x - (d.z / length) * 10,
        50,
        center.z + (d.x / length) * 10,
      );
      g.camera.lookAt(center.x, center.y, center.z);
      g.camera.updateMatrixWorld();
      window.glassProbe = { center, direction: d.toArray() };
      g.renderer.shadowMap.needsUpdate = true;
    },
    { q, r },
  );
  await frames(page);
}
async function glazing(page, layers, roof = false) {
  await page.evaluate(
    async ({ layers, roof }) => {
      const { worldToAxial } = await import('/src/core.js');
      const g = window.__hexwild,
        w = g.state.world,
        cells = [...window.glassProbeCells];
      for (const p of cells) w.set(...p, null);
      window.glassProbeCells = [];
      const { center, direction: d } = window.glassProbe;
      for (let layer = 0; layer < layers.length + (roof ? 1 : 0); layer++) {
        const y = 44 + layer,
          distance = (y + 0.5 - center.y) / d[1];
        const a = worldToAxial(
          center.x + d[0] * distance,
          center.z + d[2] * distance,
        );
        for (let dq = -1; dq <= 1; dq++)
          for (let dr = -1; dr <= 1; dr++) {
            const p = [a.q + dq, y, a.r + dr];
            w.set(
              ...p,
              layer < layers.length
                ? layers[layer]
                : roof === true
                  ? 'stone'
                  : roof,
            );
            cells.push(p);
            window.glassProbeCells.push(p);
          }
      }
      g.graphics.updateCells(cells);
    },
    { layers, roof },
  );
  await fresh(page);
}
async function sample(page) {
  const raw = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      t = g.composer.passes[0].target,
      renderer = g.renderer;
    const data = new Uint16Array(t.width * t.height * 4),
      target = renderer.getRenderTarget(),
      intensity = g.sun.intensity;
    const { center } = window.glassProbe;
    const p = g.camera.position
      .clone()
      .set(center.x, center.y, center.z)
      .project(g.camera);
    const x = Math.round((p.x * 0.5 + 0.5) * t.width),
      y = Math.round((p.y * 0.5 + 0.5) * t.height);
    const read = () => {
      g.composer.passes[0].beauty.render(renderer, null, t);
      renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
      const values = [];
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const i = ((y + dy) * t.width + x + dx) * 4;
          values.push(data[i], data[i + 1], data[i + 2]);
        }
      return values;
    };
    try {
      const lit = read();
      g.sun.intensity = 0;
      return { lit, ambient: read(), gl: renderer.getContext().getError() };
    } finally {
      g.sun.intensity = intensity;
      read();
      renderer.setRenderTarget(target);
    }
  });
  const mean = (values) =>
    [0, 1, 2].map(
      (c) =>
        values
          .filter((_, i) => i % 3 === c)
          .reduce((s, v) => s + DataUtils.fromHalfFloat(v), 0) /
        (values.length / 3),
    );
  const lit = mean(raw.lit),
    ambient = mean(raw.ambient);
  return {
    direct: lit.map((v, i) => Math.max(0, v - ambient[i])),
    ambient,
    gl: raw.gl,
  };
}

test('real amber glass filters directional RGB by path length, stacks, blocks behind stone and clears after removal', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  const bare = await sample(page);
  await glazing(page, ['glass']);
  const single = await sample(page);
  await page.screenshot({ path: info.outputPath('amber-sunlight.png') });
  await glazing(page, ['glass', 'glass', 'glass']);
  const stacked = await sample(page);
  await glazing(page, ['glass'], true);
  const blocked = await sample(page);
  await glazing(page, ['glass'], 'stoneSlab');
  const slab = await sample(page);
  await glazing(page, []);
  const removed = await sample(page);
  const ratio = (s) => s.direct.map((v, i) => v / bare.direct[i]);
  const result = {
    single: ratio(single),
    stacked: ratio(stacked),
    blocked: ratio(blocked),
    slab: ratio(slab),
    removed: ratio(removed),
    samples: { bare, single, stacked, blocked, slab, removed },
    errors,
  };
  await writeFile(
    info.outputPath('glass-path-length.json'),
    JSON.stringify(result, null, 2),
  );
  expect(Math.min(...bare.direct)).toBeGreaterThan(0.01);
  expect(result.single[0]).toBeGreaterThan(result.single[1] + 0.025);
  expect(result.single[1]).toBeGreaterThan(result.single[2] + 0.025);
  expect(result.single[2]).toBeLessThan(0.85);
  for (let c = 0; c < 3; c++) {
    expect(result.stacked[c]).toBeLessThan(result.single[c] - 0.035);
    expect(result.blocked[c]).toBeLessThan(0.03);
    expect(result.slab[c]).toBeLessThan(0.03);
    expect(Math.abs(result.removed[c] - 1)).toBeLessThan(0.025);
    expect(Math.abs(single.ambient[c] - bare.ambient[c])).toBeLessThan(0.001);
    expect(Math.abs(stacked.ambient[c] - bare.ambient[c])).toBeLessThan(0.001);
  }
  expect(errors).toEqual([]);
  for (const s of Object.values(result.samples)) expect(s.gl).toBe(0);
});

test('glass filtering follows moonlight and oblique negative-coordinate rays, survives native Continue and context restoration', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  const result = { rays: [], qualities: [], errors };
  for (const time of [120, 60, 450]) {
    await glazing(page, []);
    await clock(page, time, -2, -2);
    const bare = await sample(page);
    await glazing(page, ['glass']);
    const glass = await sample(page);
    const ratio = glass.direct.map((v, i) => v / bare.direct[i]);
    result.rays.push({ time, origin: [-2, -2], ratio });
    expect(Math.min(...bare.direct)).toBeGreaterThan(0.0002);
    expect(ratio[0]).toBeGreaterThan(ratio[1] + 0.025);
    expect(ratio[1]).toBeGreaterThan(ratio[2] + 0.025);
    for (const s of [bare, glass]) expect(s.gl).toBe(0);
  }
  expect(result.rays[1].ratio[2]).toBeLessThan(result.rays[0].ratio[2] - 0.08);
  const cells = await page.evaluate(() => {
    window.__hexwild.save();
    return window.glassProbeCells;
  });
  await page.reload();
  await page.locator('#continue').click();
  await page.evaluate((cells) => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: false,
    });
    window.glassProbeCells = cells;
  }, cells);
  await fresh(page);
  await clock(page, 450, -2, -2);
  const continued = await sample(page);
  await glazing(page, []);
  const continuedBare = await sample(page);
  result.continued = continued.direct.map(
    (v, i) => v / continuedBare.direct[i],
  );
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs(result.continued[c] - result.rays[2].ratio[c]),
    ).toBeLessThan(0.025);
  await clock(page, 120, -2, -2);
  await glazing(page, ['glass']);
  for (const quality of [1, 0.65, 1.7]) {
    await page.evaluate(
      (quality) => window.__hexwild.graphics.setQuality(quality),
      quality,
    );
    await frames(page, 5);
    const state = await page.evaluate(() => {
      const g = window.__hexwild.graphics;
      return {
        quality: g.quality,
        active: g.dynamicLight.uniforms.glassSunlight.value,
        gl: g.renderer.getContext().getError(),
      };
    });
    result.qualities.push(state);
    expect(state.active).toBe(quality >= 1.7 ? 1 : 0);
    expect(state.gl).toBe(0);
  }
  await page.setViewportSize({ width: 800, height: 600 });
  await frames(page);
  const beforeRestore = await sample(page);
  const supported = await page.evaluate(() => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.glassContextRestored = false;
    canvas.addEventListener(
      'webglcontextrestored',
      () => (window.glassContextRestored = true),
      { once: true },
    );
    window.restoreGlassContext = () => ext.restoreContext();
    ext.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreGlassContext());
  await expect
    .poll(() => page.evaluate(() => window.glassContextRestored), {
      timeout: 30000,
    })
    .toBe(true);
  await frames(page, 8);
  const restored = await sample(page);
  result.restoreRatio = restored.direct.map(
    (v, i) => v / beforeRestore.direct[i],
  );
  for (const v of result.restoreRatio)
    expect(Math.abs(v - 1)).toBeLessThan(0.03);
  expect(restored.gl).toBe(0);
  await page.evaluate(() =>
    window.__hexwild.graphics.setPostOptions({
      occlusion: 0.6,
      clouds: true,
      bloom: 0.24,
      exposure: true,
      antialias: true,
    }),
  );
  await frames(page, 8);
  await page.screenshot({ path: info.outputPath('glass-restored-high.png') });
  // A real building under the normal preset complements the isolated samples.
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 5; r++) {
        const edge = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        if (edge > 5) continue;
        for (let y = 40; y <= 45; y++) {
          const window = y === 45 && Math.abs(q) <= 1 && Math.abs(r) <= 1;
          w.set(
            q,
            y,
            r,
            window
              ? 'glass'
              : y === 45
                ? 'planks'
                : edge === 5
                  ? 'brick'
                  : null,
          );
          cells.push([q, y, r]);
        }
      }
    w.set(-4, 40, 0, 'bookshelf');
    cells.push([-4, 40, 0]);
    g.graphics.updateCells(cells);
    g.teleport(0, 40, 4);
    g.lookAt(-1, 42, 0);
    g.graphics.stepOffset = 0;
  });
  await fresh(page);
  await frames(page, 12);
  await page.screenshot({ path: info.outputPath('amber-window-room.png') });
  await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [];
    for (let q = -1; q <= 1; q++)
      for (let r = -1; r <= 1; r++) {
        g.state.world.set(q, 45, r, null);
        cells.push([q, 45, r]);
      }
    g.graphics.updateCells(cells);
  });
  await fresh(page);
  await frames(page, 12);
  await page.screenshot({ path: info.outputPath('open-window-room.png') });
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.renderer.getContext().getError(),
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('glass-lifecycle.json'),
    JSON.stringify(result, null, 2),
  );
});

// Also runs against the production bundle, without any development fixture API.
test('real UI selects and places amber glass with the shipped light-effects shaders', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#creative').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.keyboard.press('Digit8');
  await expect(page.locator('#hotbar .slot.active')).toHaveAttribute(
    'aria-label',
    /琥珀玻璃/,
  );
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementY: 500, bubbles: true }),
    ),
  );
  await frames(page, 4);
  await page.evaluate(() => {
    const canvas = document.querySelector('#world');
    for (const type of ['mousedown', 'mouseup'])
      canvas.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
  await frames(page, 5);
  await expect(page.locator('#target')).toContainText('琥珀玻璃');
  const runtime = await page.evaluate(() => ({
    developmentFixture: typeof window.__hexwild !== 'undefined',
    origin: location.origin,
    gl: document.querySelector('#world').getContext('webgl2').getError(),
  }));
  await page.screenshot({ path: info.outputPath('shipped-glass.png') });
  await writeFile(
    info.outputPath('shipped-glass-runtime.json'),
    JSON.stringify({ ...runtime, errors }, null, 2),
  );
  expect(runtime.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('all sixteen stained colors filter actual sunlight, unlike layers compose and GPU decoding preserves local light', async ({
  page,
}, info) => {
  test.setTimeout(360000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await setup(page);
  const bare = await sample(page),
    colors = {};
  for (const type of GLASS_TYPES) {
    await glazing(page, [type]);
    const s = await sample(page);
    colors[type] = s.direct.map((v, i) => v / bare.direct[i]);
    expect(s.gl).toBe(0);
    for (const v of colors[type]) expect(v).toBeGreaterThan(0.35);
    for (const v of colors[type]) expect(v).toBeLessThanOrEqual(1.025);
  }
  const red = colors.redStainedGlass,
    green = colors.greenStainedGlass,
    blue = colors.blueStainedGlass;
  expect(red[0]).toBeGreaterThan(Math.max(red[1], red[2]) + 0.1);
  expect(green[1]).toBeGreaterThan(Math.max(green[0], green[2]) + 0.02);
  expect(blue[2]).toBeGreaterThan(Math.max(blue[0], blue[1]) + 0.08);
  expect(Math.min(...colors.whiteStainedGlass)).toBeGreaterThan(0.95);
  expect(Math.max(...colors.blackStainedGlass)).toBeLessThan(0.7);
  expect(
    new Set(
      Object.values(colors).map((rgb) =>
        rgb.map((v) => v.toFixed(3)).join(','),
      ),
    ).size,
  ).toBe(17);
  const mixed = [];
  for (const layers of [
    ['redStainedGlass', 'blueStainedGlass'],
    ['blueStainedGlass', 'redStainedGlass'],
  ]) {
    await glazing(page, layers);
    mixed.push((await sample(page)).direct.map((v, i) => v / bare.direct[i]));
  }
  for (let c = 0; c < 3; c++) {
    expect(mixed[0][c]).toBeLessThan(Math.min(red[c], blue[c]) - 0.035);
    expect(Math.abs(mixed[0][c] - mixed[1][c])).toBeLessThan(0.015);
  }
  await page.screenshot({ path: info.outputPath('red-blue-layered.png') });
  await glazing(page, []);
  const removed = (await sample(page)).direct.map((v, i) => v / bare.direct[i]);
  for (const v of removed) expect(Math.abs(v - 1)).toBeLessThan(0.025);
  // Separate isolated GPU check of the production volume decoder, using all
  // seventeen indices and real torch transport. This is not another game shader.
  await page.evaluate(async () => {
    const { GLASS_TYPES } = await import('/src/dye-data.js');
    const g = window.__hexwild,
      cells = [];
    window.paletteProbePositions = GLASS_TYPES.map((type, i) => [
      -3 + (i % 6),
      48,
      -1 + Math.floor(i / 6),
      type,
    ]);
    for (const [q, y, r, type] of window.paletteProbePositions) {
      g.state.world.set(q, y, r, type);
      cells.push([q, y, r]);
    }
    g.state.world.set(-4, 48, -1, 'torch');
    cells.push([-4, 48, -1]);
    g.graphics.updateCells(cells);
  });
  await fresh(page);
  const decoder = await page.evaluate(async () => {
    const { readVolumeCells } =
      await import('/tests/fixtures/light-volume-probe.js');
    const g = window.__hexwild.graphics,
      field = g.voxelLight;
    const cells = window.paletteProbePositions.map(([q, y, r]) => [
      y,
      r - field.minR,
      q - field.minQ,
    ]);
    const expected = window.paletteProbePositions.map(([q, y, r]) => {
      const i = field.index(q, y, r);
      return [...field.rgb.map((c) => c[i]), field.sky[i]];
    });
    return {
      expected,
      actual: readVolumeCells(g, cells),
      gl: g.renderer.getContext().getError(),
    };
  });
  expect(decoder.actual).toEqual(decoder.expected);
  expect(decoder.gl).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('stained-color-transmission.json'),
    JSON.stringify({ colors, mixed, removed, decoder, errors }, null, 2),
  );
});
