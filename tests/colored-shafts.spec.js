import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { World } from '../src/world.js';
import { PlayerInventory } from '../src/inventory.js';

test.setTimeout(360000);
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
async function chamber(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 640, height: 480 });
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
    for (let q = -10; q <= 10; q++)
      for (let r = -10; r <= 10; r++) {
        w.set(q, 7, r, 'calcite');
        for (let y = 8; y < 64; y++) {
          w.set(q, y, r, null);
          if (w.fluids.get(q, y, r)) w.fluids.write(q, y, r, null);
        }
        cells.push([q, 7, r]);
      }
    // Actual wall depth ends the volume ray beyond the glass-lit air.
    for (let q = -7; q <= 7; q++)
      for (let y = 8; y <= 17; y++) {
        w.set(q, y, 6, 'stone');
        cells.push([q, y, 6]);
      }
    g.graphics.updateCells(cells);
    g.teleport(0, 10, -4);
    g.lookAt(0, 11.65, 5);
    g.graphics.stepOffset = 0;
    window.shaftRoof = [];
  });
  await fresh(page);
  return errors;
}
async function roof(page, layers) {
  await page.evaluate((layers) => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [...window.shaftRoof];
    for (const p of cells) w.set(...p, null);
    window.shaftRoof = [];
    for (let i = 0; i < layers.length; i++)
      for (let q = -7; q <= 7; q++)
        for (let r = -8; r <= 8; r++) {
          const p = [q, 18 + i, r];
          w.set(...p, layers[i]);
          cells.push(p);
          window.shaftRoof.push(p);
        }
    g.graphics.updateCells(cells);
  }, layers);
  await fresh(page);
}
// Read the actual game pass twice with its existing physical sun source on/off.
// No replacement shader: the difference isolates sun scattering from ambient
// and local light, while alpha independently measures view-ray extinction.
async function volume(page) {
  const raw = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      frame = g.composer.passes[0];
    const pass = g.composer.passes.find((p) => p.volume && p.composite);
    const u = pass.volume.uniforms,
      power = u.airSunPower.value;
    const previous = g.renderer.getRenderTarget(),
      target = pass.target;
    const data = new Uint16Array(9 * 9 * 4);
    const read = () => {
      pass.render(g.renderer, g.composer.renderTarget2, frame.target);
      g.renderer.readRenderTargetPixels(
        target,
        Math.floor(target.width / 2) - 4,
        Math.floor(target.height / 2) - 4,
        9,
        9,
        data,
      );
      return Array.from(data);
    };
    try {
      const lit = read();
      u.airSunPower.value = 0;
      return {
        lit,
        ambient: read(),
        power,
        water: u.waterCamera.value,
        gl: g.renderer.getContext().getError(),
      };
    } finally {
      u.airSunPower.value = power;
      read();
      g.renderer.setRenderTarget(previous);
    }
  });
  const mean = (values) =>
    [0, 1, 2, 3].map(
      (c) =>
        values.reduce(
          (sum, n, i) => sum + (i % 4 === c ? DataUtils.fromHalfFloat(n) : 0),
          0,
        ) / 81,
    );
  const lit = mean(raw.lit),
    ambient = mean(raw.ambient);
  return {
    direct: lit.slice(0, 3).map((v, c) => v - ambient[c]),
    ambient: ambient.slice(0, 3),
    extinction: lit[3],
    power: raw.power,
    water: raw.water,
    gl: raw.gl,
  };
}
const ratio = (value, bare) => value.direct.map((v, c) => v / bare.direct[c]);
async function clock(page, time) {
  await page.evaluate((time) => {
    const g = window.__hexwild;
    g.step(time - g.state.time);
  }, time);
  await frames(page);
}
const density = (page) =>
  page.evaluate(
    () => window.__hexwild.graphics.atmosphere.uniforms.airDensity.value,
  );
async function settledDensity(page) {
  let previous = await density(page);
  await expect
    .poll(
      async () => {
        // Observe the real damped atmosphere over elapsed rendered time; a few
        // fast hardware frames need not reach the same state as software frames.
        await page.waitForTimeout(250);
        const current = await density(page),
          change = Math.abs(current - previous);
        previous = current;
        return change;
      },
      { timeout: 15000, intervals: [0] },
    )
    .toBeLessThan(0.000001);
  return previous;
}

test('distant glass outside the sunbeam keeps the actual fog unchanged across a wide sparse optical bound', async ({
  page,
}, info) => {
  const errors = await chamber(page);
  await page.evaluate(async () => {
    const { isGlass } = await import('/src/dye-data.js');
    const g = window.__hexwild,
      cells = [];
    for (const [key, type] of [...g.state.world.blocks])
      if (isGlass(type)) {
        const p = key.split(',').map(Number);
        g.state.world.set(...p, null);
        cells.push(p);
      }
    g.graphics.updateCells(cells);
  });
  await fresh(page);
  const before = performance.now(),
    bare = await volume(page),
    bareReadMs = performance.now() - before;
  const loaded = await page.evaluate(() => {
    const g = window.__hexwild,
      cells = [
        [-14, 9, -12],
        [14, 35, 12],
      ];
    for (const p of cells) g.state.world.set(...p, 'redStainedGlass');
    g.graphics.updateCells(cells);
    return cells.every(([q, , r]) => g.state.world.loaded(q, r));
  });
  expect(loaded).toBe(true);
  await fresh(page);
  const start = performance.now(),
    far = await volume(page),
    farReadMs = performance.now() - start;
  const transmission = ratio(far, bare);
  await writeFile(
    info.outputPath('distant-glass-volume.json'),
    JSON.stringify(
      { ratio: transmission, water: far.water, loaded, gl: far.gl, errors },
      null,
      2,
    ),
  );
  // Diagnostic latency covers three real pass draws/readbacks plus transport;
  // it is neither a frame-rate assertion nor part of the semantic manifest.
  await writeFile(
    info.outputPath('distant-glass-read-latency.json'),
    JSON.stringify(
      {
        bareReadMs,
        farReadMs,
        relative: farReadMs / bareReadMs,
        renderer: await page.evaluate(() => {
          const gl = document.querySelector('#world').getContext('webgl2'),
            ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
        }),
      },
      null,
      2,
    ),
  );
  for (const v of transmission) expect(Math.abs(v - 1)).toBeLessThan(0.02);
  expect(far.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('actual fog receives colored glass sunbeams, layered RGB, opaque occlusion and removal without tinting its ambient or view extinction', async ({
  page,
}, info) => {
  const errors = await chamber(page),
    samples = { bare: await volume(page) };
  for (const [name, layers] of Object.entries({
    red: ['redStainedGlass'],
    blue: ['blueStainedGlass'],
    white: ['whiteStainedGlass'],
    black: ['blackStainedGlass'],
    stacked: ['redStainedGlass', 'redStainedGlass', 'redStainedGlass'],
    redBlue: ['redStainedGlass', 'blueStainedGlass'],
    blueRed: ['blueStainedGlass', 'redStainedGlass'],
    stone: ['redStainedGlass', 'stone'],
    slab: ['redStainedGlass', 'stoneSlab'],
    removed: [],
  })) {
    await roof(page, layers);
    samples[name] = await volume(page);
    if (name === 'blue')
      await page.screenshot({ path: info.outputPath('blue-volume.png') });
  }
  const ratios = Object.fromEntries(
    Object.entries(samples).map(([name, s]) => [name, ratio(s, samples.bare)]),
  );
  await writeFile(
    info.outputPath('colored-air-volume.json'),
    JSON.stringify({ ratios, samples, errors }, null, 2),
  );
  expect(samples.bare.water).toBe(0);
  expect(Math.min(...samples.bare.direct)).toBeGreaterThan(0.0001);
  expect(ratios.red[0]).toBeGreaterThan(ratios.red[2] + 0.05);
  expect(ratios.blue[2]).toBeGreaterThan(ratios.blue[0] + 0.05);
  for (let c = 0; c < 3; c++) {
    expect(ratios.stacked[c]).toBeLessThan(ratios.red[c] - 0.025);
    expect(Math.abs(ratios.redBlue[c] - ratios.blueRed[c])).toBeLessThan(0.02);
    expect(ratios.redBlue[c]).toBeLessThan(
      Math.min(ratios.red[c], ratios.blue[c]) - 0.02,
    );
    expect(ratios.stone[c]).toBeLessThan(0.03);
    expect(ratios.slab[c]).toBeLessThan(0.03);
    expect(Math.abs(ratios.removed[c] - 1)).toBeLessThan(0.02);
    expect(ratios.white[c]).toBeGreaterThan(ratios.black[c] + 0.08);
    expect(
      Math.abs(samples.red.ambient[c] - samples.blue.ambient[c]),
    ).toBeLessThan(0.0001);
  }
  expect(
    Math.abs(samples.red.extinction - samples.blue.extinction),
  ).toBeLessThan(0.001);
  for (const s of Object.values(samples)) expect(s.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('actual occupied water scatters glass-filtered sunlight while a real torch keeps its own color', async ({
  page,
}, info) => {
  const errors = await chamber(page);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world;
    for (let q = -9; q <= 9; q++)
      for (let r = -9; r <= 9; r++)
        for (let y = 8; y <= 14; y++)
          if (!w.get(q, y, r)) w.fluids.source(q, y, r, 'water');
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
  });
  await fresh(page);
  const bare = await volume(page);
  await roof(page, ['blueStainedGlass']);
  const blue = await volume(page);
  await page.screenshot({
    path: info.outputPath('blue-underwater-volume.png'),
  });
  await roof(page, [
    'blueStainedGlass',
    'blueStainedGlass',
    'blueStainedGlass',
  ]);
  const stacked = await volume(page);
  await roof(page, ['blueStainedGlass', 'stone']);
  const blocked = await volume(page);
  await page.evaluate(() => {
    const g = window.__hexwild;
    // A dry niche keeps the normal torch placement/medium unambiguous.
    g.state.world.set(0, 10, 1, 'stone');
    g.state.world.fluids.write(0, 11, 1, null);
    g.state.world.set(0, 11, 1, 'torch');
    g.graphics.updateCells([
      [0, 10, 1],
      [0, 11, 1],
    ]);
  });
  await roof(page, ['blueStainedGlass']);
  const blueTorch = await volume(page);
  await roof(page, ['redStainedGlass']);
  const redTorch = await volume(page);
  const result = {
    blue: ratio(blue, bare),
    stacked: ratio(stacked, bare),
    blocked: ratio(blocked, bare),
    samples: { bare, blue, stacked, blocked, blueTorch, redTorch },
    errors,
  };
  await writeFile(
    info.outputPath('colored-water-volume.json'),
    JSON.stringify(result, null, 2),
  );
  expect(bare.water).toBe(1);
  expect(Math.min(...bare.direct)).toBeGreaterThan(0.0001);
  expect(result.blue[2]).toBeGreaterThan(result.blue[0] + 0.05);
  for (let c = 0; c < 3; c++) {
    expect(result.stacked[c]).toBeLessThan(result.blue[c] - 0.025);
    expect(result.blocked[c]).toBeLessThan(0.03);
    expect(Math.abs(blueTorch.ambient[c] - redTorch.ambient[c])).toBeLessThan(
      0.001,
    );
  }
  expect(blueTorch.ambient[0]).toBeGreaterThan(blue.ambient[0] + 0.001);
  expect(Math.abs(blue.extinction - stacked.extinction)).toBeLessThan(0.001);
  for (const s of Object.values(result.samples)) expect(s.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('colored air shafts follow oblique moonlight at negative coordinates through native Continue, quality and device recovery', async ({
  page,
}, info) => {
  const errors = await chamber(page),
    result = { rays: [], qualities: [], errors };
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(-2, 10, -4);
    g.lookAt(-2, 11.65, 5);
  });
  for (const time of [60, 450]) {
    await clock(page, time);
    await roof(page, []);
    const bare = await volume(page);
    await roof(page, ['blueStainedGlass']);
    const blue = await volume(page),
      transmission = ratio(blue, bare);
    result.rays.push({
      time,
      ratio: transmission,
      water: blue.water,
      gl: blue.gl,
    });
    expect(transmission[2]).toBeGreaterThan(transmission[0] + 0.05);
    expect(Math.min(...bare.direct)).toBeGreaterThan(0.0001);
  }
  const cells = await page.evaluate(() => {
    window.__hexwild.save();
    return window.shaftRoof;
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
    g.teleport(-2, 10, -4);
    g.lookAt(-2, 11.65, 5);
    window.shaftRoof = cells;
  }, cells);
  await fresh(page);
  await clock(page, 450);
  const continued = await volume(page);
  await roof(page, []);
  const bare = await volume(page);
  result.continued = ratio(continued, bare);
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs(result.continued[c] - result.rays[1].ratio[c]),
    ).toBeLessThan(0.025);
  await roof(page, ['blueStainedGlass']);
  await clock(page, 120);
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
        volume: !!g.composer,
        active: g.dynamicLight.uniforms.glassSunlight.value,
        gl: g.renderer.getContext().getError(),
      };
    });
    result.qualities.push(state);
    expect(state.active).toBe(quality >= 1.7 ? 1 : 0);
    expect(state.volume).toBe(quality >= 1.7);
    expect(state.gl).toBe(0);
  }
  await page.setViewportSize({ width: 720, height: 540 });
  await frames(page);
  result.density = { before: await settledDensity(page) };
  const before = await volume(page);
  expect(
    await page.evaluate(() => {
      const canvas = document.querySelector('#world'),
        ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
      if (!ext) return false;
      window.shaftRestored = false;
      canvas.addEventListener(
        'webglcontextrestored',
        () => (window.shaftRestored = true),
        { once: true },
      );
      window.restoreShaftContext = () => ext.restoreContext();
      ext.loseContext();
      return true;
    }),
  ).toBe(true);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreShaftContext());
  await expect
    .poll(() => page.evaluate(() => window.shaftRestored), { timeout: 30000 })
    .toBe(true);
  await frames(page, 8);
  const restored = await volume(page);
  result.restored = ratio(restored, before);
  for (const v of result.restored) expect(Math.abs(v - 1)).toBeLessThan(0.03);
  await page.keyboard.press('Escape');
  await page.locator('[data-dimension="nether"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.dimension))
    .toBe('nether');
  await frames(page);
  expect((await volume(page)).power).toBe(0);
  await page.keyboard.press('Escape');
  await page.locator('[data-dimension="overworld"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.dimension))
    .toBe('overworld');
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.teleport(-2, 10, -4);
    g.lookAt(-2, 11.65, 5);
  });
  await fresh(page);
  await clock(page, 120);
  result.density.afterTravelInitial = await density(page);
  result.density.afterTravel = await settledDensity(page);
  const returned = await volume(page);
  result.returned = ratio(returned, before);
  await writeFile(
    info.outputPath('colored-volume-lifecycle.json'),
    JSON.stringify(result, null, 2),
  );
  for (const v of result.returned) expect(Math.abs(v - 1)).toBeLessThan(0.04);
  expect(returned.gl).toBe(0);
  expect(restored.gl).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: info.outputPath('colored-volume-restored.png'),
  });
});

// Production-compatible: a real exported save supplies the native schema; the
// actual World serializer supplies the room. Import, rendering and building use
// only the shipped UI, with no development API in the browser.
test('shipped UI renders a stained skylight room and places another blue pane from a native imported save', async ({
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
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const saved = JSON.parse(
    await readFile(await (await pending).path(), 'utf8'),
  );
  const w = new World(saved.seed, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  w.ensureAround(0, 0, 2);
  for (let q = -8; q <= 8; q++)
    for (let r = -8; r <= 8; r++) {
      w.set(q, 7, r, 'calcite');
      for (let y = 8; y < 64; y++) {
        w.set(q, y, r, null);
        if (w.fluids.get(q, y, r)) w.fluids.write(q, y, r, null);
      }
      const edge = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (edge > 6) continue;
      for (let y = 8; y <= 18; y++)
        if (y === 18 || edge === 6)
          w.set(q, y, r, y === 18 ? 'planks' : 'blackWool');
    }
  const pack = new PlayerInventory();
  pack.insert('blueStainedGlass', 64);
  saved.inventory = pack.serialize();
  saved.selected = 0;
  saved.creative = true;
  saved.creativeFlying = true;
  saved.position = [0, 11.65, 6];
  saved.yaw = 0;
  saved.pitch = 0.35;
  saved.time = 120;
  let initialBlue = 0;
  for (const type of ['glass', 'stone', 'blueStainedGlass']) {
    for (let q = -2; q <= 1; q++)
      for (let r = -1; r <= 0; r++) w.set(q, 18, r, type);
    saved.dimensions.overworld = {
      ...saved.dimensions.overworld,
      ...w.serialize(),
      position: saved.position,
    };
    saved.dimensions.overworld.fauna.mobs = [];
    await page.locator('#save-file').setInputFiles({
      name: 'stained-skylight.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await expect(page.locator('#hud')).toBeVisible();
    await frames(page, 16);
    await page.keyboard.press('F1');
    await page.screenshot({ path: info.outputPath(`skylight-${type}.png`) });
    initialBlue = w
      .serialize()
      .edits.filter(([, id]) => id === 'blueStainedGlass').length;
  }
  await page.keyboard.press('F1');
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementY: 600, bubbles: true }),
    ),
  );
  await frames(page);
  await expect(page.locator('#target')).toContainText('方解石');
  await page.evaluate(() => {
    for (const type of ['mousedown', 'mouseup'])
      document
        .querySelector('#world')
        .dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
  });
  await expect(page.locator('#target')).toContainText('蓝色染色玻璃');
  const runtime = await page.evaluate(() => {
    const gl = document.querySelector('#world').getContext('webgl2'),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      developmentFixture: typeof window.__hexwild !== 'undefined',
      origin: location.origin,
      gl: gl.getError(),
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
  await page.keyboard.press('Escape');
  const afterDownload = page.waitForEvent('download');
  await page.locator('#export').click();
  const after = JSON.parse(
    await readFile(await (await afterDownload).path(), 'utf8'),
  );
  const placedBlue = after.dimensions.overworld.edits.filter(
    ([, id]) => id === 'blueStainedGlass',
  ).length;
  expect(placedBlue).toBe(initialBlue + 1);
  expect(after.inventory.slots[0]).toMatchObject({
    item: 'blueStainedGlass',
    count: 64,
  });
  expect(runtime.gl).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('skylight-production-runtime.json'),
    JSON.stringify(
      {
        ...runtime,
        initialBlue,
        placedBlue,
        creativeStock: 64,
        exportedSave: true,
        errors,
      },
      null,
      2,
    ),
  );
});
