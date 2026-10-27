import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

test.setTimeout(240000);
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
});
async function pool(page) {
  await page.setViewportSize({ width: 900, height: 650 });
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
    for (let q = -10; q <= 14; q++)
      for (let r = -7; r <= 7; r++) {
        w.set(q, 28, r, 'calcite');
        for (let y = 29; y <= 40; y++) {
          w.set(q, y, r, null);
          if (y <= 31) w.fluids.source(q, y, r, 'water');
        }
        cells.push([q, 28, r]);
      }
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 29.15, 0);
    g.lookAt(5, 34, 0);
  });
  await fresh(page);
  return page.evaluate(async () => {
    const g = window.__hexwild,
      { axialToWorld } = await import('/src/core.js');
    return {
      surface: 31 + g.state.world.fluids.height(0, 31, 0),
      eye: g.graphics.camera.position.y,
      reach: axialToWorld(5, 0).x,
    };
  });
}
async function fresh(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
      ),
  );
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
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function patch(page, point, sourcePoint) {
  await fresh(page);
  const raw = await page.evaluate(
    ({ point, sourcePoint }) => {
      const g = window.__hexwild.graphics,
        t = g.composer.passes[0].target;
      const p = g.camera.position
        .clone()
        .set(...point)
        .project(g.camera);
      const x = Math.round((p.x * 0.5 + 0.5) * t.width),
        y = Math.round((p.y * 0.5 + 0.5) * t.height);
      if (x < 5 || y < 5 || x >= t.width - 5 || y >= t.height - 5)
        throw Error(`Optical patch outside viewport: ${x},${y}`);
      const pixels = new Uint16Array(11 * 11 * 4);
      g.renderer.readRenderTargetPixels(t, x - 5, y - 5, 11, 11, pixels);
      let source = null,
        sourceInMainView = null;
      if (sourcePoint) {
        const v = g.camera.position.clone().set(...sourcePoint);
        const main = v.clone().project(g.camera);
        sourceInMainView =
          Math.abs(main.x) <= 1 &&
          Math.abs(main.y) <= 1 &&
          main.z >= -1 &&
          main.z <= 1;
        v.applyMatrix4(g.camera.matrixWorldInverse).applyMatrix4(
          g.fluidRenderer.waterUniforms.waterProjection.value,
        );
        const sx = Math.round((v.x * 0.5 + 0.5) * t.width),
          sy = Math.round((v.y * 0.5 + 0.5) * t.height);
        if (sx < 5 || sy < 5 || sx >= t.width - 5 || sy >= t.height - 5)
          throw Error('Reflected source outside guard-band capture');
        source = new Uint16Array(pixels.length);
        g.renderer.readRenderTargetPixels(
          g.composer.passes[0].opaque,
          sx - 5,
          sy - 5,
          11,
          11,
          source,
        );
      }
      return {
        pixels: Array.from(pixels),
        ready: g.fluidRenderer.waterUniforms.waterSceneReady.value,
        medium: g.fluidRenderer.medium,
        source: source && Array.from(source),
        sourceInMainView,
      };
    },
    { point, sourcePoint },
  );
  const rgb = [0, 0, 0];
  let finite = true;
  for (let i = 0; i < raw.pixels.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const value = DataUtils.fromHalfFloat(raw.pixels[i + c]);
      finite &&= Number.isFinite(value);
      rgb[c] += value / 121;
    }
  const source =
    raw.source &&
    [0, 1, 2].map(
      (c) =>
        raw.source
          .filter((_, i) => i % 4 === c)
          .reduce((sum, v) => sum + DataUtils.fromHalfFloat(v), 0) / 121,
    );
  return {
    rgb,
    source,
    sourceInMainView: raw.sourceInMainView,
    finite,
    ready: raw.ready,
    medium: raw.medium,
  };
}

// Low presets render directly to the canvas. Measure the displayed PNG without
// adding an alternative product render path or a test-only target.
async function screenPatch(page, point) {
  await fresh(page);
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, point }) => {
      const g = window.__hexwild.graphics,
        p = g.camera.position
          .clone()
          .set(...point)
          .project(g.camera),
        img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const context = c.getContext('2d');
      context.drawImage(img, 0, 0);
      const x = Math.round((p.x * 0.5 + 0.5) * c.width),
        y = Math.round((0.5 - p.y * 0.5) * c.height);
      if (x < 5 || y < 5 || x >= c.width - 5 || y >= c.height - 5)
        throw Error('Displayed optical patch outside viewport');
      const pixels = context.getImageData(x - 5, y - 5, 11, 11).data;
      return [0, 1, 2].map(
        (channel) =>
          pixels.reduce((sum, v, i) => sum + (i % 4 === channel ? v : 0), 0) /
          (121 * 255),
      );
    },
    { png, point },
  );
}

test('a submerged grazing surface reflects a real colored underwater floor rather than leaking only sky', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const scene = await pool(page);
  // At this angle the reflected floor lies below the main camera's frustum;
  // the real opaque guard band must still capture it.
  await page.evaluate(
    (s) =>
      window.__hexwild.lookAt(
        5,
        s.eye + s.reach * Math.tan((35 * Math.PI) / 180),
        0,
      ),
    scene,
  );
  const x = (scene.surface - scene.eye) / Math.tan((35 * Math.PI) / 180),
    floorX = x + (scene.surface - 29) / Math.tan((35 * Math.PI) / 180);
  const change = async (type) =>
    page.evaluate((type) => {
      const g = window.__hexwild,
        w = g.state.world,
        cells = [];
      for (let q = 1; q <= 13; q++)
        for (let r = -5; r <= 5; r++) {
          w.set(q, 28, r, type);
          cells.push([q, 28, r]);
        }
      g.graphics.updateCells(cells);
    }, type);
  await change('crimsonwood');
  const red = await patch(page, [x, scene.surface, 0], [floorX, 29.01, 0]);
  await change('snow');
  const white = await patch(page, [x, scene.surface, 0], [floorX, 29.01, 0]);
  const response = Math.hypot(...red.rgb.map((v, i) => v - white.rgb[i]));
  const transmission = red.rgb.map(
    (v, i) =>
      Math.abs(white.rgb[i] - v) / Math.abs(white.source[i] - red.source[i]),
  );
  await page.screenshot({ path: info.outputPath('underwater-mirror.png') });
  const occluder = async (type) =>
    page.evaluate((type) => {
      const g = window.__hexwild,
        w = g.state.world;
      w.set(1, 30, 0, type);
      w.setState(1, 30, 0, {
        facing: 0,
        open: false,
        upper: false,
        double: false,
      });
      g.graphics.updateCells([[1, 30, 0]]);
    }, type);
  await occluder('brickSlab');
  const blockedRed = await patch(page, [x, scene.surface, 0]);
  await occluder('sandstoneSlab');
  const blockedWhite = await patch(page, [x, scene.surface, 0]);
  const blockedResponse = Math.hypot(
    ...blockedRed.rgb.map((v, i) => v - blockedWhite.rgb[i]),
  );
  await writeFile(
    info.outputPath('reflection.json'),
    JSON.stringify(
      {
        red,
        white,
        response,
        transmission,
        blockedRed,
        blockedWhite,
        blockedResponse,
        errors,
      },
      null,
      2,
    ),
  );
  expect(red.medium).toBe('water');
  expect(red.ready).toBe(1);
  expect(white.ready).toBe(1);
  expect(red.finite && white.finite).toBe(true);
  expect(response).toBeGreaterThan(0.012);
  expect(blockedResponse).toBeLessThan(response * 0.05 + 0.001);
  expect(red.sourceInMainView).toBe(false);
  expect(transmission[0]).toBeLessThan(transmission[2] * 0.7);
  expect(errors).toEqual([]);
});

test('a tall water column uses the actual vertical side normal for transmission and total reflection', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pool(page);
  const column = await page.evaluate(async () => {
    const g = window.__hexwild,
      w = g.state.world,
      { axialToWorld } = await import('/src/core.js');
    for (let y = 32; y <= 38; y++) w.fluids.source(0, y, 0, 'water');
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 31.35, 0);
    return {
      eye: g.graphics.camera.position.y,
      face: axialToWorld(1, 0).x * 0.5,
      wall: axialToWorld(3, 0).x,
    };
  });
  const wall = async (type) =>
    page.evaluate((type) => {
      const g = window.__hexwild,
        w = g.state.world,
        cells = [];
      for (let r = -4; r <= 4; r++)
        for (let y = 29; y <= 54; y++) {
          w.set(3, y, r, type);
          cells.push([3, y, r]);
        }
      g.graphics.updateCells(cells);
    }, type);
  await page.evaluate((c) => window.__hexwild.lookAt(3, c.eye, 0), column);
  await wall('crimsonwood');
  const frontRed = await patch(page, [column.face, column.eye, 0]);
  await wall('snow');
  const frontWhite = await patch(page, [column.face, column.eye, 0]);
  await page.evaluate(
    (c) =>
      window.__hexwild.lookAt(
        3,
        c.eye + c.wall * Math.tan((70 * Math.PI) / 180),
        0,
      ),
    column,
  );
  const p = [
    column.face,
    column.eye + column.face * Math.tan((70 * Math.PI) / 180),
    0,
  ];
  const sideWhite = await patch(page, p);
  await wall('crimsonwood');
  const sideRed = await patch(page, p);
  const front = Math.hypot(
      ...frontRed.rgb.map((v, i) => v - frontWhite.rgb[i]),
    ),
    side = Math.hypot(...sideRed.rgb.map((v, i) => v - sideWhite.rgb[i]));
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('0.65');
  await page.locator('#resume').click();
  await page.evaluate((c) => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.teleport(0, 31.35, 0);
    g.lookAt(3, c.eye, 0);
  }, column);
  await wall('crimsonwood');
  const lowFrontRed = await screenPatch(page, [column.face, column.eye, 0]);
  await wall('snow');
  const lowFrontWhite = await screenPatch(page, [column.face, column.eye, 0]);
  await page.evaluate(
    (c) =>
      window.__hexwild.lookAt(
        3,
        c.eye + c.wall * Math.tan((70 * Math.PI) / 180),
        0,
      ),
    column,
  );
  const lowSideWhite = await screenPatch(page, p);
  await wall('crimsonwood');
  const lowSideRed = await screenPatch(page, p);
  const lowFront = Math.hypot(
      ...lowFrontRed.map((v, i) => v - lowFrontWhite[i]),
    ),
    lowSide = Math.hypot(...lowSideRed.map((v, i) => v - lowSideWhite[i]));
  await writeFile(
    info.outputPath('vertical-interface.json'),
    JSON.stringify(
      {
        frontRed,
        frontWhite,
        sideRed,
        sideWhite,
        front,
        side,
        lowFrontRed,
        lowFrontWhite,
        lowSideRed,
        lowSideWhite,
        lowFront,
        lowSide,
        errors,
      },
      null,
      2,
    ),
  );
  expect(front).toBeGreaterThan(0.025);
  expect(side).toBeLessThan(front * 0.05 + 0.001);
  expect(lowFront).toBeGreaterThan(0.025);
  expect(lowSide).toBeLessThan(lowFront * 0.05 + 0.004);
  expect(
    [frontRed, frontWhite, sideRed, sideWhite].every(
      (p) => p.finite && p.ready === 1 && p.medium === 'water',
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('capture guard band restores the actual lens after GPU failure, resize, medium changes and quality disposal', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scene = await pool(page);
  const offsets = [];
  for (const [sign, offset] of [
    [1, 0.1],
    [-1, -0.1],
  ]) {
    offsets.push(
      await page.evaluate(
        ({ scene, sign, offset }) =>
          new Promise((resolve) =>
            requestAnimationFrame(() => {
              const g = window.__hexwild,
                eye = scene.surface + sign * 0.04;
              g.teleport(0, eye - (scene.eye - 29.15), 0);
              g.graphics.stepOffset = offset;
              g.lookAt(5, scene.surface, 0);
              requestAnimationFrame(() =>
                resolve({
                  medium: g.graphics.fluidRenderer.medium,
                  water: g.graphics.atmosphere.uniforms.waterCamera.value,
                  eye: g.graphics.camera.position.y,
                  expected: eye,
                  rendered: eye - offset,
                }),
              );
            }),
          ),
        { scene, sign, offset },
      ),
    );
  }
  await writeFile(
    info.outputPath('waterline-offsets.json'),
    JSON.stringify(offsets, null, 2),
  );
  expect(offsets.map((s) => s.medium)).toEqual(['water', null]);
  expect(offsets.map((s) => s.water)).toEqual([1, 0]);
  for (const s of offsets) expect(s.eye).toBeCloseTo(s.expected, 8);
  await page.evaluate(() => {
    window.__hexwild.teleport(0, 29.15, 0);
    window.__hexwild.graphics.stepOffset = 0;
  });
  await fresh(page);
  const snapshot = () =>
    page.evaluate(() => {
      const g = window.__hexwild.graphics,
        w = g.fluidRenderer.waterUniforms,
        f = g.composer?.passes[0];
      return {
        medium: g.fluidRenderer.medium,
        ready: w.waterSceneReady.value,
        depthWrite: g.fluidRenderer.materials.water.depthWrite,
        size: f && [f.opaque.width, f.opaque.height],
        captureScale:
          w.waterProjection.value.elements[5] /
          g.camera.projectionMatrix.elements[5],
        fov: g.camera.fov,
        inverse: g.camera.projectionMatrix
          .clone()
          .multiply(g.camera.projectionMatrixInverse)
          .toArray(),
      };
    });
  const before = await snapshot();
  expect(before.ready).toBe(1);
  expect(before.captureScale).toBeLessThan(1);
  const failure = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__hexwild.graphics,
          r = g.renderer,
          before = g.camera.projectionMatrix.toArray(),
          beforeInverse = g.camera.projectionMatrixInverse.toArray(),
          autoClear = r.autoClear,
          original = r.setRenderTarget;
        r.setRenderTarget = function (target, ...args) {
          if (target === g.composer.passes[0].opaque) {
            r.setRenderTarget = original;
            throw Error('water capture GPU boundary failure');
          }
          return original.call(this, target, ...args);
        };
        requestAnimationFrame(() =>
          resolve({
            before,
            beforeInverse,
            projection: g.camera.projectionMatrix.toArray(),
            inverse: g.camera.projectionMatrixInverse.toArray(),
            autoClearBefore: autoClear,
            autoClear: r.autoClear,
            allWaterVisible: [...g.fluidRenderer.meshes.values()].every(
              (group) => group.children.every((o) => o.visible),
            ),
            ready: g.fluidRenderer.waterUniforms.waterSceneReady.value,
          }),
        );
      }),
  );
  expect(failure.projection).toEqual(failure.before);
  expect(failure.inverse).toEqual(failure.beforeInverse);
  expect(failure.allWaterVisible).toBe(true);
  expect(failure.ready).toBe(0);
  expect(failure.autoClear).toBe(failure.autoClearBefore);
  await fresh(page);
  const recovered = await snapshot();
  expect(recovered.ready).toBe(1);
  await page.setViewportSize({ width: 720, height: 540 });
  await fresh(page);
  const resized = await snapshot();
  expect(resized.size).toEqual([720, 540]);
  expect(resized.fov).toBe(before.fov);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 30.28, 0);
    g.lookAt(5, 30, 0);
  });
  await fresh(page);
  const air = await snapshot();
  expect(air.medium).toBe(null);
  expect(air.captureScale).toBe(1);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 29.15, 0);
    g.lookAt(5, 33.95, 0);
    g.state.world.fluids.scoop(0, 30, 0);
    g.state.world.fluids.source(0, 30, 0, 'glow');
    g.graphics.fluidRenderer.sync(
      g.state.world,
      new Set(g.graphics.chunks.keys()),
      true,
    );
  });
  await fresh(page);
  const glow = await snapshot();
  expect(glow.medium).toBe('glow');
  expect(glow.ready).toBe(0);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.state.world.fluids.scoop(0, 30, 0);
    g.state.world.fluids.source(0, 30, 0, 'water');
    g.graphics.fluidRenderer.sync(
      g.state.world,
      new Set(g.graphics.chunks.keys()),
      true,
    );
  });
  await fresh(page);
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('0.65');
  await page.locator('#resume').click();
  const low = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return {
      composer: g.composer,
      ready: g.fluidRenderer.waterUniforms.waterSceneReady.value,
      depthWrite: g.fluidRenderer.materials.water.depthWrite,
    };
  });
  expect(low).toEqual({ composer: null, ready: 0, depthWrite: false });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#resume').click();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  await fresh(page);
  await page.evaluate(() => {
    window.__hexwild.teleport(0, 70, 0);
    window.__hexwild.lookAt(0, 100, 0);
  });
  await fresh(page);
  const offscreen = await snapshot();
  expect(offscreen.ready).toBe(0);
  await writeFile(
    info.outputPath('lifecycle.json'),
    JSON.stringify(
      {
        before,
        offsets,
        failure,
        recovered,
        resized,
        air,
        glow,
        low,
        offscreen,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual(['water capture GPU boundary failure']);
});

test('the Snell window transmits real above-water colors while total internal reflection rejects them', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const scene = await pool(page);
  await page.evaluate(
    (s) =>
      window.__hexwild.lookAt(
        5,
        s.eye + s.reach * Math.tan((40 * Math.PI) / 180),
        0,
      ),
    scene,
  );
  const insideX = (scene.surface - scene.eye) / Math.tan(Math.PI / 3),
    outsideX = (scene.surface - scene.eye) / Math.tan(Math.PI / 9);
  const roof = async (type) =>
    page.evaluate((type) => {
      const g = window.__hexwild,
        w = g.state.world,
        cells = [];
      for (let q = -3; q <= 12; q++)
        for (let r = -6; r <= 6; r++) {
          w.set(q, 35, r, type);
          cells.push([q, 35, r]);
        }
      g.graphics.updateCells(cells);
    }, type);
  await roof('crimsonwood');
  const insideRed = await patch(
      page,
      [insideX, scene.surface, 0],
      [3.4, 34.99, 0],
    ),
    outsideRed = await patch(page, [outsideX, scene.surface, 0]);
  await roof('snow');
  const insideWhite = await patch(
      page,
      [insideX, scene.surface, 0],
      [3.4, 34.99, 0],
    ),
    outsideWhite = await patch(page, [outsideX, scene.surface, 0]);
  const inside = Math.hypot(
    ...insideRed.rgb.map((v, i) => v - insideWhite.rgb[i]),
  );
  const outside = Math.hypot(
    ...outsideRed.rgb.map((v, i) => v - outsideWhite.rgb[i]),
  );
  await page.screenshot({ path: info.outputPath('snell-window.png') });
  const input = Math.hypot(
    ...insideRed.source.map((v, i) => v - insideWhite.source[i]),
  );
  await writeFile(
    info.outputPath('snell-window.json'),
    JSON.stringify(
      {
        insideRed,
        insideWhite,
        outsideRed,
        outsideWhite,
        inside,
        outside,
        input,
        transmittedFraction: inside / input,
        leakedFraction: outside / input,
        errors,
      },
      null,
      2,
    ),
  );
  expect(inside).toBeGreaterThan(input * 0.5);
  expect(outside).toBeLessThan(inside * 0.05 + 0.001);
  expect(
    [insideRed, insideWhite, outsideRed, outsideWhite].every((p) => p.finite),
  ).toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild,
      w = g.state.world,
      cells = [];
    for (let q = -3; q <= 12; q++)
      for (let r = -6; r <= 6; r++) {
        w.set(q, 35, r, null);
        cells.push([q, 35, r]);
      }
    for (let r = -3; r <= 3; r++) {
      w.set(4, 36, r, 'planks');
      cells.push([4, 36, r]);
      if (Math.abs(r) === 3)
        for (let y = 29; y < 36; y++) {
          w.set(4, y, r, 'planks');
          cells.push([4, y, r]);
        }
    }
    g.graphics.updateCells(cells);
    g.graphics.setPostOptions({ antialias: true, exposure: true, bloom: 0.24 });
  });
  await page.keyboard.press('Escape');
  await page.locator('#fov').focus();
  await page.locator('#fov').press('End');
  await page.locator('#resume').click();
  await expect
    .poll(() => page.evaluate(() => window.__hexwild.graphics.camera.fov), {
      timeout: 60000,
    })
    .toBeGreaterThan(104);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.setPlaying(false);
    g.teleport(0, 29.15, 0);
    g.lookAt(0, 40, 0);
  });
  await fresh(page);
  const frames = await page.evaluate(
    () => window.__hexwild.graphics.composer.effects.temporal.frames,
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__hexwild.graphics.composer.effects.temporal.frames,
        ),
      { timeout: 60000 },
    )
    .toBeGreaterThanOrEqual(frames + 12);
  await page.keyboard.press('F1');
  await page.screenshot({ path: info.outputPath('snell-window-beauty.png') });
  // This TIR direction reflects behind the upward-looking camera and therefore
  // uses the actual environmental water source, which must not glow at night.
  const ring = [
      (scene.surface - scene.eye) * Math.tan(Math.PI / 3),
      scene.surface,
      0,
    ],
    day = await patch(page, ring);
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.step(450 - g.state.time);
  });
  const night = await patch(page, ring),
    ratio =
      night.rgb.reduce((a, b) => a + b, 0) / day.rgb.reduce((a, b) => a + b, 0);
  await writeFile(
    info.outputPath('night-response.json'),
    JSON.stringify({ day, night, ratio, errors }, null, 2),
  );
  expect(ratio).toBeLessThan(0.4);
  expect(errors).toEqual([]);
});
