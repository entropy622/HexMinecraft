import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';

async function scene(page) {
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
    g.graphics.setPostOptions({
      occlusion: 0,
      clouds: false,
      bloom: 0,
      exposure: false,
      antialias: true,
    });
    for (let q = -14; q <= 14; q++)
      for (let r = -12; r <= 14; r++) {
        w.set(q, 39, r, 'basalt');
        for (let y = 40; y <= 47; y++)
          w.set(q, y, r, r === 14 ? 'basalt' : null);
        cells.push([q, 39, r]);
      }
    for (let q = -8; q <= 8; q++) {
      w.set(q, 40, 6, 'fence');
      w.set(q, 40, 10, 'stoneStairs');
      w.setState(q, 40, 10, {
        facing: Math.abs(q) % 6,
        open: false,
        upper: false,
      });
      if (q % 2 === 0)
        for (let y = 40; y <= 44; y++) w.set(q, y, 12, 'calcite');
    }
    g.graphics.updateCells(cells);
    g.teleport(4, 41, -6);
    g.lookAt(0, 42, 9);
  });
  await page.keyboard.press('F1');
}
async function frames(page, count) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () => {
          if (--count <= 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}
test('temporal accumulation improves real voxel edges against a supersampled reference', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await scene(page);
  expect(
    await page.evaluate(
      () => !!window.__hexwild.graphics.composer.effects.temporal,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, antialias: false });
    g.renderer.setPixelRatio(2);
    g.renderer.setSize(innerWidth, innerHeight);
    g.composer.setPixelRatio(2);
    g.composer.setSize(innerWidth, innerHeight);
  });
  await frames(page, 4);
  const reference = await page.screenshot({
    path: info.outputPath('reference-2x.png'),
  });
  // Ablate only the actual temporal pass: this is the old SMAA-only renderer,
  // not a fake of the shader or its colour/depth inputs.
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.resizeRendering();
    g.setPostOptions({ ...g.postOptions, antialias: true });
    g.composer.effects.temporal.enabled = false;
  });
  await frames(page, 4);
  const smaa = await page.screenshot({ path: info.outputPath('smaa.png') });
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, antialias: true });
  });
  await frames(page, 24);
  const temporal = await page.screenshot({
    path: info.outputPath('temporal.png'),
  });
  await frames(page, 8);
  const settled = await page.screenshot({
    path: info.outputPath('settled.png'),
  });
  const metrics = await page.evaluate(
    async (images) => {
      const pixels = await Promise.all(
        images.map(
          (src) =>
            new Promise((resolve) => {
              const image = new Image();
              image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const c = canvas.getContext('2d');
                c.drawImage(image, 0, 0);
                resolve(c.getImageData(0, 0, image.width, image.height).data);
              };
              image.src = src;
            }),
        ),
      );
      const [reference, smaa, taa, settled] = pixels,
        w = innerWidth,
        h = innerHeight;
      let smaaError = 0,
        taaError = 0,
        gradientSmaa = 0,
        gradientTaa = 0,
        flicker = 0,
        n = 0,
        edges = 0;
      for (let y = 45; y < h - 45; y++)
        for (let x = 30; x < w - 30; x++) {
          const i = (y * w + x) * 4,
            ix = i + 4,
            iy = i + w * 4;
          let edge = 0;
          for (let c = 0; c < 3; c++)
            edge +=
              Math.abs(reference[i + c] - reference[ix + c]) +
              Math.abs(reference[i + c] - reference[iy + c]);
          for (let c = 0; c < 3; c++) {
            flicker += Math.abs(taa[i + c] - settled[i + c]);
            n++;
            if (edge > 30) {
              smaaError += (smaa[i + c] - reference[i + c]) ** 2;
              taaError += (taa[i + c] - reference[i + c]) ** 2;
              gradientSmaa +=
                Math.abs(smaa[i + c] - smaa[ix + c]) +
                Math.abs(smaa[i + c] - smaa[iy + c]);
              gradientTaa +=
                Math.abs(taa[i + c] - taa[ix + c]) +
                Math.abs(taa[i + c] - taa[iy + c]);
              edges++;
            }
          }
        }
      return {
        smaaError: smaaError / edges,
        taaError: taaError / edges,
        errorRatio: taaError / smaaError,
        gradientRatio: gradientTaa / gradientSmaa,
        settledDifference: flicker / n / 255,
        edgeSamples: edges,
      };
    },
    [reference, smaa, temporal, settled].map(
      (p) => 'data:image/png;base64,' + p.toString('base64'),
    ),
  );
  await writeFile(
    info.outputPath('quality.json'),
    JSON.stringify(metrics, null, 2),
  );
  expect(metrics.edgeSamples).toBeGreaterThan(1000);
  expect(metrics.errorRatio).toBeLessThan(0.95);
  expect(metrics.gradientRatio).toBeGreaterThan(0.75);
  expect(metrics.settledDifference).toBeLessThan(0.015);
  expect(errors).toEqual([]);
});

test('a moving production mob rejects history and clears its vacated silhouette', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await scene(page);
  await page.evaluate(async () => {
    const { createMob } = await import('/src/mob-graphics.js'),
      g = window.__hexwild;
    window.temporalMob = createMob('pig', g.graphics.textures);
    window.temporalMob.position.set(0, 40, 0);
    g.graphics.scene.add(window.temporalMob);
  });
  await frames(page, 16);
  const moved = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const g = window.__hexwild.graphics,
            m = window.temporalMob,
            old = m.position.clone().add({ x: 0, y: 0.7, z: 0 });
          m.position.x += 2.5;
          requestAnimationFrame(() => {
            const next = m.position.clone().add({ x: 0, y: 0.7, z: 0 }),
              target = g.composer.effects.temporal.history[0],
              mask = g.composer.effects.protection.target;
            const sample = (point) => {
              point.project(g.camera);
              const x = Math.round((point.x * 0.5 + 0.5) * target.width),
                y = Math.round((point.y * 0.5 + 0.5) * target.height),
                pixels = new Uint16Array(7 * 7 * 4),
                flags = new Uint8Array(7 * 7 * 4);
              g.renderer.readRenderTargetPixels(
                target,
                x - 3,
                y - 3,
                7,
                7,
                pixels,
              );
              g.renderer.readRenderTargetPixels(
                mask,
                x - 3,
                y - 3,
                7,
                7,
                flags,
              );
              return {
                x,
                y,
                pixels: Array.from(pixels),
                flags: Array.from(flags),
              };
            };
            resolve({
              old: sample(old),
              next: sample(next),
              gl: g.renderer.getContext().getError(),
            });
          });
        });
      }),
  );
  await page.evaluate(
    () => (window.__hexwild.graphics.composer.effects.temporal.enabled = false),
  );
  await frames(page, 4);
  const baseline = await page.evaluate(
    (points) => {
      const g = window.__hexwild.graphics,
        target = g.composer.readBuffer;
      return points.map(({ x, y }) => {
        const pixels = new Uint16Array(7 * 7 * 4);
        g.renderer.readRenderTargetPixels(target, x - 3, y - 3, 7, 7, pixels);
        return Array.from(pixels);
      });
    },
    [moved.old, moved.next],
  );
  const mean = (values, c) =>
    values
      .filter((_, i) => i % 4 === c)
      .reduce((n, v) => n + DataUtils.fromHalfFloat(v), 0) / 49;
  const differences = [moved.old, moved.next].map((sample, j) =>
    [0, 1, 2].reduce(
      (n, c) => n + Math.abs(mean(sample.pixels, c) - mean(baseline[j], c)),
      0,
    ),
  );
  const manifest = {
    oldAlpha: mean(moved.old.pixels, 3),
    newAlpha: mean(moved.next.pixels, 3),
    reactive:
      moved.next.flags
        .filter((_, i) => i % 4 === 1)
        .reduce((n, v) => n + v, 0) /
      49 /
      255,
    differences,
    gl: moved.gl,
  };
  await writeFile(
    info.outputPath('moving-mob.json'),
    JSON.stringify(manifest, null, 2),
  );
  await page.screenshot({ path: info.outputPath('moving-mob.png') });
  expect(manifest.newAlpha).toBeLessThan(0);
  expect(manifest.oldAlpha).toBeGreaterThan(0);
  expect(manifest.reactive).toBeGreaterThan(0.9);
  expect(Math.max(...differences)).toBeLessThan(0.08);
  expect(manifest.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('camera cuts, failed GPU draws, viewport changes and real quality controls reset history', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors = [];
  page.on('pageerror', (e) => {
    if (!e.message.includes('temporal GPU boundary failure'))
      errors.push(e.message);
  });
  page.on('console', (e) => {
    if (
      e.type() === 'error' &&
      !e.text().includes('temporal GPU boundary failure')
    )
      errors.push(e.text());
  });
  await scene(page);
  await frames(page, 8);
  const cuts = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__hexwild.graphics;
        requestAnimationFrame(() => {
          g.camera.position.x += 10;
          requestAnimationFrame(() =>
            resolve({
              frames: g.composer.effects.temporal.frames,
              projection: g.camera.projectionMatrix.elements[8],
              inverse: g.camera.projectionMatrix
                .clone()
                .multiply(g.camera.projectionMatrixInverse).elements,
            }),
          );
        });
      }),
  );
  expect(cuts.frames).toBe(1);
  expect(cuts.projection).toBe(0);
  expect(
    Math.max(
      ...cuts.inverse.map((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0))),
    ),
  ).toBeLessThan(1e-8);
  const failure = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__hexwild.graphics,
          projection = g.camera.projectionMatrix.toArray(),
          inverse = g.camera.projectionMatrixInverse.toArray(),
          original = g.renderer.setRenderTarget;
        g.renderer.setRenderTarget = function (target, ...args) {
          if (target === g.composer.effects.temporal.history[1]) {
            g.renderer.setRenderTarget = original;
            throw Error('temporal GPU boundary failure');
          }
          return original.call(this, target, ...args);
        };
        requestAnimationFrame(() =>
          resolve({
            projection: g.camera.projectionMatrix.toArray(),
            inverse: g.camera.projectionMatrixInverse.toArray(),
            before: projection,
            beforeInverse: inverse,
            valid: g.composer.effects.temporal.valid,
            frames: g.composer.effects.temporal.frames,
          }),
        );
      }),
  );
  expect(failure.projection).toEqual(failure.before);
  expect(failure.inverse).toEqual(failure.beforeInverse);
  expect(failure.valid).toBe(false);
  expect(failure.frames).toBe(0);
  await frames(page, 4);
  const rotation = await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const g = window.__hexwild;
          g.lookAt(0, 42, -30);
          requestAnimationFrame(() =>
            resolve(g.graphics.composer.effects.temporal.frames),
          );
        }),
      ),
  );
  expect(rotation).toBe(1);
  await page.setViewportSize({ width: 800, height: 600 });
  await frames(page, 3);
  const sizes = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      t = g.composer.effects.temporal;
    return {
      history: t.history.map((h) => [h.width, h.height]),
      mask: [
        g.composer.effects.protection.target.width,
        g.composer.effects.protection.target.height,
      ],
      frame: [
        g.composer.passes[0].target.width,
        g.composer.passes[0].target.height,
      ],
      projection: g.camera.projectionMatrix.elements[8],
      gl: g.renderer.getContext().getError(),
    };
  });
  expect(sizes.history).toEqual([sizes.frame, sizes.frame]);
  expect(sizes.mask).toEqual(sizes.frame);
  expect(sizes.projection).toBe(0);
  expect(sizes.gl).toBe(0);
  await page.keyboard.press('Escape');
  await page.locator('#antialias-toggle').uncheck();
  await page.locator('#resume').click();
  await frames(page, 3);
  const disabled = await page.evaluate(() => ({
    enabled: window.__hexwild.graphics.composer.effects.temporal.enabled,
    projection: window.__hexwild.graphics.camera.projectionMatrix.elements[8],
  }));
  expect(disabled).toEqual({ enabled: false, projection: 0 });
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    window.temporalDisposals = { history: 0, mask: 0 };
    for (const t of g.composer.effects.temporal.history)
      t.addEventListener('dispose', () => window.temporalDisposals.history++);
    g.composer.effects.protection.target.addEventListener(
      'dispose',
      () => window.temporalDisposals.mask++,
    );
  });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('0.65');
  await page.locator('#resume').click();
  expect(
    await page.evaluate(() => ({
      composer: window.__hexwild.graphics.composer,
      disposed: window.temporalDisposals,
    })),
  ).toEqual({ composer: null, disposed: { history: 2, mask: 1 } });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('1.7');
  await page.locator('#antialias-toggle').check();
  await page.locator('#resume').click();
  await frames(page, 4);
  const firstPerson = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      t = g.composer.effects.temporal.history[0],
      mask = new Uint8Array(t.width * t.height * 4),
      history = new Uint16Array(mask.length);
    g.renderer.readRenderTargetPixels(
      g.composer.effects.protection.target,
      0,
      0,
      t.width,
      t.height,
      mask,
    );
    g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, history);
    let protectedPixels = 0,
      rejectedPixels = 0;
    for (let i = 0; i < t.width * Math.floor(t.height / 2) * 4; i += 4)
      if (mask[i] > 250 && mask[i + 1] > 250) {
        protectedPixels++;
        // The sign bit in half-float alpha marks current-frame-only colour.
        if (history[i + 3] & 0x8000) rejectedPixels++;
      }
    return {
      handVisible: g.hand.visible,
      protectedPixels,
      rejectedRatio: rejectedPixels / protectedPixels,
    };
  });
  expect(firstPerson.handVisible).toBe(true);
  expect(firstPerson.protectedPixels).toBeGreaterThan(64);
  expect(firstPerson.rejectedRatio).toBeGreaterThan(0.9);
  const reset = await page.evaluate(() => {
    const g = window.__hexwild;
    g.travel('nether');
    return {
      valid: g.graphics.composer.effects.temporal.valid,
      frames: g.graphics.composer.effects.temporal.frames,
    };
  });
  expect(reset).toEqual({ valid: false, frames: 0 });
  await frames(page, 3);
  expect(
    await page.evaluate(
      () => window.__hexwild.graphics.composer.effects.temporal.valid,
    ),
  ).toBe(true);
  await writeFile(
    info.outputPath('lifecycle.json'),
    JSON.stringify(
      { cuts, failure, sizes, disabled, firstPerson, reset },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
