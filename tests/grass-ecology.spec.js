import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

test.setTimeout(180000);
const diagnostics = new WeakMap();
test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const state = await page
    .evaluate(() => {
      const g = window.__hexwild;
      if (!g) return { game: false };
      g.save();
      const gl = g.graphics.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        time: g.state.time,
        playing: g.state.playing,
        position: g.state.position,
        target: g.state.target && {
          q: g.state.target.q,
          y: g.state.target.y,
          r: g.state.target.r,
          type: g.state.target.type,
          place: g.state.target.place,
        },
        source: g.state.world.get(4, 39, 4),
        pasture: g.state.world.get(3, 39, 4),
        cover: g.state.world.get(4, 40, 4),
        lightRevision: g.graphics.voxelLight.revision,
        worldRevision: g.state.world.lightRevision,
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        gl: gl.getError(),
        grassCircuitTrace: window.__grassCircuitTrace,
        fauna: JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
          .overworld.fauna,
      };
    })
    .catch((error) => ({ error: error.message }));
  await writeFile(
    info.outputPath('diagnostics.json'),
    JSON.stringify({ state, ...diagnostics.get(page) }, null, 2),
  );
});

test('a grazed pasture recovers, opaque cover kills grass, and streaming/continue keep terrain', async ({
  page,
}, info) => {
  const errors = [];
  const warnings = [];
  const consoleErrors = [];
  diagnostics.set(page, { errors, warnings, consoleErrors });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') consoleErrors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.locator('#start').click();
  const saved = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    return JSON.parse(localStorage.getItem('hexwild-save-v16'));
  });
  const { World } = await import('../src/world.js');
  const w = new World(saved.seed, 'overworld', {
    ...saved.dimensions.overworld,
    load: false,
  });
  w.ensureAround(4, 4, 1);
  for (let q = 0; q <= 7; q++)
    for (let r = 0; r <= 7; r++) {
      w.set(q, 39, r, 'stone');
      for (let y = 40; y <= 45; y++) w.set(q, y, r, null);
    }
  w.set(4, 39, 4, 'grass');
  w.set(3, 39, 4, 'grass');
  // A continuously changing real circuit must not starve one-second grass
  // maintenance by keeping the renderer's throttled light field out of date.
  for (const [q, facing] of [
    [2, 0],
    [3, 3],
  ]) {
    w.set(q, 43, 1, 'observer');
    w.setState(q, 43, 1, { facing, open: false, powered: false });
  }
  const { axialToWorld } = await import('../src/core.js');
  const sheepPoint = axialToWorld(3, 4);
  const fauna = saved.dimensions.overworld.fauna;
  const sheep = {
    ...fauna.mobs[0],
    kind: 'sheep',
    position: [sheepPoint.x, 40, sheepPoint.z],
    hp: 8,
    baby: 0,
    wool: 0.05,
    love: 0,
    cooldown: 0,
  };
  saved.dimensions.overworld = {
    ...saved.dimensions.overworld,
    ...w.serialize(),
    fauna: { ...fauna, mobs: [sheep] },
  };
  saved.time = 100;
  const playerPoint = axialToWorld(1, 4);
  saved.position = [playerPoint.x, 41.68, playerPoint.z];
  await page.evaluate(() => {
    Math.random = () => 0.61;
  });
  // Observe every real rendered frame before importing, so the short lived
  // grazed state cannot disappear between an out-of-process poll and pause.
  const pauseReceipt = page.waitForFunction(
    () => {
      const g = window.__hexwild;
      if (g.state.world.get(3, 39, 4) !== 'dirt') return false;
      for (const type of ['keydown', 'keyup'])
        document.querySelector('#world').dispatchEvent(
          new KeyboardEvent(type, {
            code: 'Escape',
            key: 'Escape',
            bubbles: true,
          }),
        );
      return g.state.time;
    },
    null,
    { polling: 'raf', timeout: 30000 },
  );
  await page.locator('#save-file').setInputFiles({
    name: 'grass-pasture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  const paused = await (await pauseReceipt).jsonValue();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const cell = (q, y, r) =>
    page.evaluate(
      ([q, y, r]) => window.__hexwild.state.world.get(q, y, r) || null,
      [q, y, r],
    );
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__hexwild.state.time)).toBe(paused);
  expect(await cell(3, 39, 4)).toBe('dirt');
  await page.locator('#resume').click();
  await expect.poll(() => cell(3, 39, 4), { timeout: 30000 }).toBe('grass');
  await page.evaluate(() => {
    const g = window.__hexwild;
    const w = g.state.world;
    w.set(5, 39, 4, 'observer');
    w.setState(5, 39, 4, { facing: 3, open: false, powered: false });
    w.set(6, 39, 4, 'redstoneLamp');
    w.setState(6, 39, 4, { facing: 0, open: false, powered: false });
    g.graphics.updateCells([
      [5, 39, 4],
      [6, 39, 4],
    ]);
    g.give('blueCarpet', 1);
    g.selectItem('blueCarpet');
    g.teleport(4, 40, 5);
    g.lookAt(4, 39.99, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.y, t.r, t.type, t.place.q, t.place.y, t.place.r];
      }),
    )
    .toEqual([4, 39, 4, 'grass', 4, 40, 4]);
  await expect(page.locator('#target')).toHaveText('草地');
  // The sheep has just grazed this patch. Wait for it to walk off before
  // placing a solid carpet through its body; keep real occupancy checks.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { axialToWorld } = await import('/src/core.js');
          const g = window.__hexwild,
            p = axialToWorld(4, 4);
          g.save();
          const mobs = JSON.parse(localStorage.getItem('hexwild-save-v16'))
            .dimensions.overworld.fauna.mobs;
          return mobs.every(
            (m) => Math.hypot(m.position[0] - p.x, m.position[2] - p.z) > 1.6,
          );
        }),
      { timeout: 15000, intervals: [500] },
    )
    .toBe(true);
  await writeFile(
    info.outputPath('carpet-placement-before.json'),
    JSON.stringify(
      await page.evaluate(async () => {
        const { bodyClear } = await import('/src/grounding.js');
        const g = window.__hexwild,
          [x, y, z] = g.state.position;
        g.save();
        return {
          position: [x, y, z],
          low: y - 1.65 + 0.005,
          clear: bodyClear(
            g.state.world,
            x,
            z,
            y - 1.65 + 0.005,
            y - 1.65 + 1.8 - 0.03,
          ),
          mobs: JSON.parse(localStorage.getItem('hexwild-save-v16')).dimensions
            .overworld.fauna.mobs,
          villagers: [...g.villagers.residents.values()].map((m) => ({
            position: m.mesh.position.toArray(),
          })),
        };
      }),
      null,
      2,
    ),
  );
  for (const type of ['mousedown', 'mouseup'])
    await page.locator('#world').dispatchEvent(type, { button: 2 });
  await expect.poll(() => cell(4, 40, 4)).toBe('blueCarpet');
  const carpetTime = await page.evaluate(() => window.__hexwild.state.time);
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.time), {
      timeout: 15000,
    })
    .toBeGreaterThan(carpetTime + 2.1);
  expect(await cell(4, 39, 4)).toBe('grass');
  expect(
    await page.evaluate(() => {
      const w = window.__hexwild.state.world;
      return !!w.state(5, 39, 4).powered || w.redstone.timers.has('5,39,4');
    }),
  ).toBe(false);
  await page.screenshot({ path: info.outputPath('carpet-pasture.png') });
  await page.evaluate(() => window.__hexwild.lookAt(4, 40.03, 4));
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.state.target?.type))
    .toBe('blueCarpet');
  // Release on the rendered frame in which this carpet disappears. A host
  // round trip can hold mining long enough to break the grass underneath too.
  await page.evaluate(() => {
    const canvas = document.querySelector('#world'),
      started = performance.now();
    const observe = () => {
      if (
        !window.__hexwild.state.world.get(4, 40, 4) ||
        performance.now() - started > 15000
      )
        canvas.dispatchEvent(
          new MouseEvent('mouseup', { button: 0, bubbles: true }),
        );
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 0, bubbles: true }),
    );
  });
  try {
    await expect.poll(() => cell(4, 40, 4), { timeout: 15000 }).toBe(null);
  } finally {
    await page.locator('#world').dispatchEvent('mouseup', { button: 0 });
  }
  // A slow rendered frame can contain the whole 0.1 s pulse in its physics
  // substeps. Observe the real circuit without changing its clock or result.
  await page.evaluate(() => {
    const g = window.__hexwild,
      circuit = g.state.world.redstone,
      tick = circuit.tick;
    const trace = (window.__grassCircuitTrace = {
      transitions: [],
      steps: 0,
      elapsed: 0,
      pulse: null,
      rafPulse: null,
      maxRafGap: 0,
    });
    let previous = '',
      lastFrame = performance.now();
    circuit.tick = function (...args) {
      const result = tick.apply(this, args),
        w = g.state.world,
        source = w.get(4, 39, 4),
        cover = w.get(4, 40, 4),
        observer = !!w.state(5, 39, 4).powered,
        lamp = !!w.state(6, 39, 4).powered;
      trace.steps++;
      trace.elapsed += args[0];
      const state = JSON.stringify([source, cover, observer, lamp]);
      if (state !== previous) {
        trace.transitions.push({
          source,
          cover,
          observer,
          lamp,
          step: trace.steps,
          elapsed: trace.elapsed,
          time: g.state.time,
          wall: performance.now(),
        });
        previous = state;
      }
      if (source === 'dirt' && cover === 'observer' && observer && lamp)
        trace.pulse ||= trace.transitions.at(-1);
      return result;
    };
    const observe = (now) => {
      trace.maxRafGap = Math.max(trace.maxRafGap, now - lastFrame);
      lastFrame = now;
      if (
        g.state.world.state(5, 39, 4).powered &&
        g.state.world.state(6, 39, 4).powered
      )
        trace.rafPulse ||= g.state.time;
      if (!trace.stop) requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
    window.__stopGrassCircuitTrace = () => {
      trace.stop = true;
      circuit.tick = tick;
      return trace;
    };
  });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.give('observer', 1);
    g.selectItem('observer');
    g.lookAt(4, 39.99, 4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.__hexwild.state.target;
        return t && [t.q, t.y, t.r, t.type, t.place.q, t.place.y, t.place.r];
      }),
    )
    .toEqual([4, 39, 4, 'grass', 4, 40, 4]);
  await expect(page.locator('#target')).toHaveText('草地');
  await writeFile(
    info.outputPath('placement-before.json'),
    JSON.stringify(
      await page.evaluate(() => {
        const g = window.__hexwild;
        return {
          position: g.state.position,
          playing: g.state.playing,
          observer: g.state.inventory.observer,
          selected: g.state.hotbar,
          targetText: document.querySelector('#target').textContent,
          target: g.state.target && {
            q: g.state.target.q,
            y: g.state.target.y,
            r: g.state.target.r,
            place: g.state.target.place,
          },
        };
      }),
      null,
      2,
    ),
  );
  for (const type of ['mousedown', 'mouseup'])
    await page.locator('#world').dispatchEvent(type, { button: 2 });
  await expect.poll(() => cell(4, 40, 4)).toBe('observer');
  await expect.poll(() => cell(4, 39, 4), { timeout: 30000 }).toBe('dirt');
  await page.waitForFunction(
    () => {
      const trace = window.__grassCircuitTrace;
      return (
        trace.pulse &&
        trace.transitions.some(
          (s) => s.step > trace.pulse.step && !s.observer && !s.lamp,
        )
      );
    },
    null,
    { polling: 'raf', timeout: 30000 },
  );
  const grassCircuitReceipt = await page.evaluate(() => {
    const trace = window.__stopGrassCircuitTrace();
    delete window.__stopGrassCircuitTrace;
    return trace;
  });
  const pulse = grassCircuitReceipt.pulse,
    off = grassCircuitReceipt.transitions.find(
      (s) => s.step > pulse.step && !s.observer && !s.lamp,
    );
  expect(pulse).toMatchObject({
    source: 'dirt',
    cover: 'observer',
    observer: true,
    lamp: true,
  });
  expect(pulse.time).toBeGreaterThan(carpetTime);
  // Timers expire on a physics step, whose width is at most 1/60 s.
  const pulseWidth = off.elapsed - pulse.elapsed;
  expect(pulseWidth).toBeGreaterThanOrEqual(0.1 - 1e-8);
  expect(pulseWidth).toBeLessThanOrEqual(0.1 + 1 / 60 + 1e-8);
  expect(
    grassCircuitReceipt.transitions.some(
      (s) =>
        s.step < pulse.step && s.source === 'dirt' && !s.observer && !s.lamp,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('covered-pasture.png') });
  const unloaded = await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(180, 45, 180);
    return g.state.world.loaded(4, 4);
  });
  expect(unloaded).toBe(false);
  const returnedLoaded = await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(3, 40, 3);
    g.save();
    return g.state.world.loaded(4, 4);
  });
  expect(returnedLoaded).toBe(true);
  expect(await cell(4, 39, 4)).toBe('dirt');
  expect(await cell(3, 39, 4)).toBe('grass');
  await page.reload();
  await page.locator('#continue').click();
  expect(await cell(4, 39, 4)).toBe('dirt');
  expect(await cell(3, 39, 4)).toBe('grass');
  const publication = await page.evaluate(async () => {
    const { readVolumeCells } =
      await import('/tests/fixtures/light-volume-probe.js');
    const g = window.__hexwild,
      graphics = g.graphics,
      w = g.state.world;
    // Exercise the same refresh/publication entry used by plant maintenance.
    // A field refresh must reach the actual GPU even without a grass edit.
    w.set(0, 48, 0, 'glowstone');
    graphics.updateVoxelLight(0, true);
    const field = graphics.voxelLight,
      i = field.index(0, 48, 0),
      expected = [...field.rgb.map((c) => c[i]), field.sky[i]],
      actual = readVolumeCells(graphics, [[48, -field.minR, -field.minQ]])[0];
    w.set(0, 48, 0, null);
    graphics.updateVoxelLight(0, true);
    return { expected, actual, coveredGrass: w.get(4, 39, 4) };
  });
  expect(publication.expected.slice(0, 3)).toEqual([15, 13, 9]);
  expect(publication.actual).toEqual(publication.expected);
  expect(publication.coveredGrass).toBe('dirt');
  const manifest = await page.evaluate(() => {
    const g = window.__hexwild;
    g.save();
    const s = JSON.parse(localStorage.getItem('hexwild-save-v16'));
    const sheep = s.dimensions.overworld.fauna.mobs.find(
      (m) => m.kind === 'sheep',
    );
    return {
      coveredSource: g.state.world.get(4, 39, 4),
      recoveredPasture: g.state.world.get(3, 39, 4),
      cover: g.state.world.get(4, 40, 4),
      recoveredWool: sheep.wool === 0,
      collision: g.state.world.solid(3, 39, 4),
      gl: g.graphics.renderer.getContext().getError(),
      saveVersion: s.version,
      clockStillScheduled: ['2,43,1', '3,43,1'].some((k) =>
        g.state.world.redstone.timers.has(k),
      ),
    };
  });
  expect(manifest).toEqual({
    coveredSource: 'dirt',
    recoveredPasture: 'grass',
    cover: 'observer',
    recoveredWool: true,
    collision: true,
    gl: 0,
    saveVersion: 16,
    clockStillScheduled: true,
  });
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await writeFile(
    info.outputPath('grass-ecology.json'),
    JSON.stringify(
      {
        ...manifest,
        paused: true,
        carpetPreservedGrass: true,
        convertedGrassPoweredLamp: true,
        grassCircuitReceipt,
        streamed: !unloaded && returnedLoaded,
        continued: true,
        publication,
        errors,
      },
      null,
      2,
    ),
  );
});
