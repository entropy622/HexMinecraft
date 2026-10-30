import { test, expect, waitForRecoveredRenderer } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';

async function frames(page, count = 4) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const next = () => (--count ? requestAnimationFrame(next) : resolve());
        requestAnimationFrame(next);
      }),
    count,
  );
}

async function chamber(page) {
  const diagnostics = { errors: [], warnings: [] };
  page.on('pageerror', (e) => diagnostics.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') diagnostics.errors.push(e.text());
    if (e.type() === 'warning') diagnostics.warnings.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
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
    g.step(450 - g.state.time);
    g.graphics.setPostOptions({
      occlusion: 0.6,
      clouds: false,
      bloom: 0.24,
      exposure: false,
      antialias: true,
    });
    for (let q = -9; q <= 9; q++)
      for (let r = -10; r <= 8; r++) {
        for (let y = 29; y <= 40; y++) {
          const boundary =
            y === 29 || y === 40 || Math.abs(q) === 9 || r === -10 || r === 8;
          w.set(q, y, r, boundary ? 'basalt' : null);
          if (w.fluids.get(q, y, r)) w.fluids.write(q, y, r, null);
        }
        cells.push([q, 29, r]);
      }
    // All lighting, meshing, emission, tone mapping and water remain production.
    for (const [q, y, r, type] of [
      [-3, 33, 6, 'lantern'],
      [0, 32, 6, 'glowstone'],
      [3, 33, 6, 'crystal'],
      [-3, 34, 5, 'redStainedGlass'],
      [3, 34, 5, 'blueStainedGlass'],
    ]) {
      w.set(q, y, r, type);
      cells.push([q, y, r]);
    }
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 3; r++) {
        w.set(q, 29, r, null);
        w.fluids.source(q, 29, r, 'water');
      }
    g.graphics.updateCells(cells);
    g.graphics.fluidRenderer.sync(w, new Set(g.graphics.chunks.keys()), true);
    g.teleport(0, 31, -6);
    g.lookAt(0, 33, 6);
    g.graphics.stepOffset = 0;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            g.voxelLight.revision === g.world.lightRevision &&
            !g.relightQueue.size
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await frames(page, 24);
  return diagnostics;
}

async function device(page) {
  return page.evaluate(() => {
    const gl = window.__hexwild.graphics.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      vendor: ext
        ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR),
      gl: gl.getError(),
    };
  });
}

async function imageMetrics(page, off, on) {
  return page.evaluate(
    async (urls) => {
      const images = await Promise.all(
        urls.map(
          (url) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve({
                  data: ctx.getImageData(0, 0, img.width, img.height).data,
                  width: img.width,
                  height: img.height,
                });
              };
              img.src = url;
            }),
        ),
      );
      const [off, on] = images;
      let difference = 0,
        darkLift = 0,
        darkPixels = 0,
        clipped = 0,
        litPixels = 0;
      // The moving water is reviewed visually, not counted as bloom change.
      for (let y = 40; y < off.height - 200; y++)
        for (let x = 40; x < off.width - 40; x++) {
          const i = (y * off.width + x) * 4;
          const a = (off.data[i] + off.data[i + 1] + off.data[i + 2]) / 3;
          const b = (on.data[i] + on.data[i + 1] + on.data[i + 2]) / 3;
          difference += Math.abs(b - a);
          if (a < 45) {
            darkLift += b - a;
            darkPixels++;
          }
          if (a > 100) litPixels++;
          if (on.data[i] > 250 && on.data[i + 1] > 250 && on.data[i + 2] > 250)
            clipped++;
        }
      return {
        meanDifference: difference / ((off.height - 240) * (off.width - 80)),
        darkLift: darkLift / Math.max(1, darkPixels),
        darkPixels,
        litPixels,
        clipped,
      };
    },
    [off, on].map((v) => 'data:image/png;base64,' + v.toString('base64')),
  );
}

test('real scene: dark room, small moving emitters and underwater bloom leave reviewable images', async ({
  page,
}, info) => {
  const diagnostics = await chamber(page),
    label = process.env.BLOOM_LABEL || 'new';
  await page.keyboard.press('F1');
  const on = await page.screenshot({
    path: info.outputPath(`${label}-air.png`),
  });
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, bloom: 0 });
  });
  await frames(page, 24);
  const off = await page.screenshot({
    path: info.outputPath(`${label}-air-off.png`),
  });
  const air = await imageMetrics(page, off, on);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, bloom: 0.24, exposure: true });
  });
  for (let i = 0; i < 5; i++) {
    await page.evaluate((i) => {
      const g = window.__hexwild;
      g.teleport(i * 0.035, 31, -6);
      g.lookAt(i * 0.035, 33, 6);
    }, i);
    await frames(page, 16);
    await page.screenshot({
      path: info.outputPath(`${label}-motion-${i}.png`),
    });
  }
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 27.8, -3);
    g.lookAt(0, 31, 5);
  });
  await frames(page, 24);
  await page.screenshot({ path: info.outputPath(`${label}-underwater.png`) });
  const state = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      target = g.composer.effects.protection.target,
      mask = new Uint8Array(target.width * target.height * 4);
    g.renderer.readRenderTargetPixels(
      target,
      0,
      0,
      target.width,
      target.height,
      mask,
    );
    let protectedPixels = 0;
    for (let i = 0; i < mask.length; i += 4)
      if (mask[i] > 250 && mask[i + 1] > 250) protectedPixels++;
    return {
      medium: g.fluidRenderer.medium,
      captureReady: g.fluidRenderer.waterUniforms.waterSceneReady.value,
      protectedPixels,
      temporal: g.composer.effects.temporal.valid,
      exposure: g.composer.effects.exposure.enabled,
    };
  });
  const probe = await page.evaluate(async () => {
    const { readProductionBloom } =
      await import('/tests/fixtures/bloom-probe.js');
    return readProductionBloom(window.__hexwild.graphics);
  });
  await page.evaluate(() => {
    const g = window.__hexwild;
    g.teleport(0, 31, -6);
    g.lookAt(0, 33, 6);
    g.setPlaying(true);
  });
  await frames(page, 3);
  const hand = await page.evaluate(() => {
    const g = window.__hexwild,
      gfx = g.graphics,
      target = gfx.composer.effects.protection.target,
      point = gfx.hand.children[0]
        .getWorldPosition(gfx.camera.position.clone())
        .project(gfx.camera),
      x = Math.round((point.x * 0.5 + 0.5) * target.width),
      y = Math.round((point.y * 0.5 + 0.5) * target.height),
      mask = new Uint8Array(7 * 7 * 4),
      history = new Uint16Array(mask.length);
    gfx.renderer.readRenderTargetPixels(target, x - 3, y - 3, 7, 7, mask);
    gfx.renderer.readRenderTargetPixels(
      gfx.composer.effects.temporal.history[0],
      x - 3,
      y - 3,
      7,
      7,
      history,
    );
    let protectedPixels = 0,
      rejectedPixels = 0;
    for (let i = 0; i < mask.length; i += 4) {
      if (mask[i] > 250 && mask[i + 1] > 250) protectedPixels++;
      if (history[i + 3] & 0x8000) rejectedPixels++;
    }
    const visible = gfx.hand.visible;
    g.setPlaying(false);
    return { visible, protectedPixels, rejectedPixels };
  });
  const manifest = {
    label,
    air,
    state,
    hand,
    probe,
    device: await device(page),
    diagnostics,
  };
  await writeFile(
    info.outputPath(`${label}-scene.json`),
    JSON.stringify(manifest, null, 2),
  );
  expect(air.meanDifference).toBeGreaterThan(0.01);
  expect(air.darkPixels).toBeGreaterThan(1000);
  expect(state.medium).toBe('water');
  expect(state.protectedPixels).toBeGreaterThan(64);
  expect(state.temporal).toBe(true);
  expect(state.exposure).toBe(true);
  expect(hand.visible).toBe(true);
  expect(hand.protectedPixels).toBeGreaterThan(40);
  expect(hand.rejectedPixels).toBeGreaterThan(40);
  expect(probe.gl).toBe(0);
  expect(manifest.device.gl).toBe(0);
  expect(diagnostics.errors).toEqual([]);
});

test('actual bloom GPU contract: DC energy, finite HDR, color and moving impulse scattering', async ({
  page,
}, info) => {
  const diagnostics = await chamber(page);
  const result = await page.evaluate(async () => {
    const { BloomPass } = await import('/src/bloom-pass.js');
    const {
      DataTexture,
      FloatType,
      RGBAFormat,
      LinearFilter,
      HalfFloatType,
      WebGLRenderTarget,
      DataUtils,
    } = await import('/tests/fixtures/bloom-probe.js');
    const renderer = window.__hexwild.graphics.renderer,
      previous = renderer.getRenderTarget(),
      pass = new BloomPass(),
      w = 256,
      h = 192,
      data = new Float32Array(w * h * 4),
      source = new DataTexture(data, w, h, RGBAFormat, FloatType),
      output = new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        depthBuffer: false,
      });
    source.minFilter = source.magFilter = LinearFilter;
    pass.setSize(w, h);
    pass.strength = 0.5;
    const pixels = new Uint16Array(w * h * 4);
    const render = () => {
      source.needsUpdate = true;
      pass.render(renderer, output, { texture: source });
      renderer.readRenderTargetPixels(output, 0, 0, w, h, pixels);
      return Array.from(pixels, (v) => DataUtils.fromHalfFloat(v));
    };
    try {
      const fields = [];
      for (const value of [0, 0.18, 1, 16, 60000]) {
        const color = [value, value * 0.5, value * 0.125];
        for (let i = 0; i < data.length; i += 4) data.set([...color, 0.375], i);
        const image = render();
        let error = 0,
          alphaError = 0,
          invalid = 0;
        for (let i = 0; i < image.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            if (!Number.isFinite(image[i + c]) || image[i + c] < 0) invalid++;
            error = Math.max(
              error,
              Math.abs(image[i + c] - color[c]) / Math.max(1, color[c]),
            );
          }
          alphaError = Math.max(alphaError, Math.abs(image[i + 3] - 0.375));
        }
        fields.push({ value, error, alphaError, invalid });
      }
      const impulses = [];
      for (const { power, tint, precisionLimited = false } of [
        { power: 0.4, tint: [1, 0.25, 0.0625], precisionLimited: true },
        { power: 0.4, tint: [1, 1, 1] },
        { power: 1.2, tint: [1, 0.25, 0.0625] },
        { power: 4, tint: [1, 0.25, 0.0625] },
        { power: 32, tint: [1, 0.25, 0.0625] },
      ])
        for (let phase = 0; phase < 8; phase++) {
          data.fill(0);
          const position = phase / 4,
            f = position % 1,
            x = 120 + Math.floor(position),
            y = 90;
          data.set(
            [
              power * (1 - f),
              power * (1 - f) * tint[1],
              power * (1 - f) * tint[2],
              1,
            ],
            (y * w + x) * 4,
          );
          data.set(
            [power * f, power * f * tint[1], power * f * tint[2], 1],
            (y * w + x + 1) * 4,
          );
          const image = render(),
            sums = [0, 0, 0],
            rings = [0, 0, 0];
          let invalid = 0;
          for (let yy = 0; yy < h; yy++)
            for (let xx = 0; xx < w; xx++) {
              const i = (yy * w + xx) * 4,
                r = Math.hypot(xx - x - f, yy - y);
              for (let c = 0; c < 3; c++) {
                sums[c] += image[i + c];
                if (!Number.isFinite(image[i + c]) || image[i + c] < 0)
                  invalid++;
              }
              if (r > 2 && r <= 8) rings[0] += image[i];
              if (r > 8 && r <= 24) rings[1] += image[i];
              if (r > 24) rings[2] += image[i];
            }
          impulses.push({
            power,
            phase,
            tint,
            precisionLimited,
            sums,
            rings,
            invalid,
          });
        }
      // Diagnose the low-color precision failure with the identical production
      // pass and shaders, changing only test GPU resource storage to Float32.
      // This is a reference measurement, never a selectable product path.
      const floatReference = [],
        reference = new BloomPass();
      reference.setSize(w, h);
      reference.strength = pass.strength;
      output.dispose();
      output.texture.type = FloatType;
      try {
        reference.render(renderer, output, { texture: source });
        for (const target of [...reference.down, ...reference.up]) {
          target.dispose();
          target.texture.type = FloatType;
        }
        const full = new Float32Array(data.length);
        for (let phase = 0; phase < 8; phase++) {
          const position = phase / 4,
            f = position % 1,
            x = 120 + Math.floor(position),
            y = 90;
          data.fill(0);
          data.set(
            [0.4 * (1 - f), 0.1 * (1 - f), 0.025 * (1 - f), 1],
            (y * w + x) * 4,
          );
          data.set([0.4 * f, 0.1 * f, 0.025 * f, 1], (y * w + x + 1) * 4);
          source.needsUpdate = true;
          reference.render(renderer, output, { texture: source });
          renderer.readRenderTargetPixels(output, 0, 0, w, h, full);
          const sums = [0, 0, 0];
          for (let i = 0; i < full.length; i += 4)
            for (let c = 0; c < 3; c++) sums[c] += full[i + c];
          const half = impulses.find(
            (v) => v.precisionLimited && v.phase === phase,
          );
          floatReference.push({
            phase,
            sums,
            halfSums: half.sums,
            absoluteResidual: half.sums.map((v, c) => v - sums[c]),
            halfRatioError: [1, 2].map(
              (c) => half.sums[c] / half.sums[0] - half.tint[c],
            ),
          });
        }
      } finally {
        reference.dispose();
        output.dispose();
        output.texture.type = HalfFloatType;
      }
      const dimensions = [];
      for (const [width, height] of [
        [721, 537],
        [1, 1],
        [2, 3],
      ]) {
        pass.setSize(width, height);
        output.setSize(width, height);
        const resized = new Float32Array(width * height * 4),
          color = [0.18, 0.09, 0.0225, 0.375];
        for (let i = 0; i < resized.length; i += 4) resized.set(color, i);
        // WebGL2 immutable texture storage cannot change dimensions in place.
        source.dispose();
        source.image = { data: resized, width, height };
        source.needsUpdate = true;
        pass.render(renderer, output, { texture: source });
        const p = new Uint16Array(width * height * 4);
        renderer.readRenderTargetPixels(output, 0, 0, width, height, p);
        let error = 0,
          alphaError = 0,
          invalid = 0;
        for (let i = 0; i < p.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            const value = DataUtils.fromHalfFloat(p[i + c]);
            error = Math.max(error, Math.abs(value - color[c]));
            if (!Number.isFinite(value) || value < 0) invalid++;
          }
          alphaError = Math.max(
            alphaError,
            Math.abs(DataUtils.fromHalfFloat(p[i + 3]) - color[3]),
          );
        }
        dimensions.push({
          width,
          height,
          error,
          alphaError,
          invalid,
          levels: pass.down.map((t) => [t.width, t.height]),
        });
      }
      return {
        fields,
        impulses,
        floatReference,
        dimensions,
        gl: renderer.getContext().getError(),
      };
    } finally {
      pass.dispose();
      source.dispose();
      output.dispose();
      renderer.setRenderTarget(previous);
    }
  });
  await writeFile(
    info.outputPath('hdr-contract.json'),
    JSON.stringify(
      { ...result, device: await device(page), diagnostics },
      null,
      2,
    ),
  );
  for (const field of result.fields) {
    expect(field.invalid).toBe(0);
    expect(field.error).toBeLessThan(0.005);
    expect(field.alphaError).toBe(0);
  }
  for (const power of [0.4, 1.2, 4, 32]) {
    const energy = result.impulses
      .filter((v) => v.power === power)
      .filter((v) => !v.precisionLimited)
      .map((v) => v.sums[0]);
    expect((Math.max(...energy) - Math.min(...energy)) / power).toBeLessThan(
      0.02,
    );
  }
  for (const impulse of result.impulses) {
    expect(impulse.invalid).toBe(0);
    expect(Math.abs(impulse.sums[0] / impulse.power - 1)).toBeLessThan(0.035);
    if (!impulse.precisionLimited) {
      expect(
        Math.abs(impulse.sums[1] / impulse.sums[0] - impulse.tint[1]),
      ).toBeLessThan(0.002);
      expect(
        Math.abs(impulse.sums[2] / impulse.sums[0] - impulse.tint[2]),
      ).toBeLessThan(0.002);
    }
    for (const ring of impulse.rings)
      expect(ring).toBeGreaterThan(impulse.power * 0.0001);
  }
  for (const reference of result.floatReference) {
    expect(Math.abs(reference.sums[0] / 0.4 - 1)).toBeLessThan(0.035);
    expect(Math.abs(reference.sums[1] / reference.sums[0] - 0.25)).toBeLessThan(
      0.002,
    );
    expect(
      Math.abs(reference.sums[2] / reference.sums[0] - 0.0625),
    ).toBeLessThan(0.002);
  }
  for (const d of result.dimensions) {
    expect(d.error).toBeLessThan(0.005);
    expect(d.alphaError).toBe(0);
    expect(d.invalid).toBe(0);
    for (const size of d.levels)
      expect(Math.min(...size)).toBeGreaterThanOrEqual(1);
  }
  expect(result.gl).toBe(0);
  expect(diagnostics.errors).toEqual([]);
});

test('bloom lifecycle follows zero amount, physical size, quality and context restoration', async ({
  page,
}, info) => {
  const diagnostics = await chamber(page),
    states = [];
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    window.bloomDisposed = 0;
    const targets = [
      ...g.composer.effects.bloom.down,
      ...g.composer.effects.bloom.up,
    ];
    window.bloomAllocated = targets.length;
    for (const target of targets)
      target.addEventListener('dispose', () => window.bloomDisposed++);
    g.setPostOptions({ ...g.postOptions, bloom: 0 });
  });
  await frames(page);
  states.push(
    await page.evaluate(() => {
      const b = window.__hexwild.graphics.composer.effects.bloom;
      return {
        stage: 'zero',
        targets: b.down.length + b.up.length,
        enabled: b.enabled,
        disposed: window.bloomDisposed,
        allocated: window.bloomAllocated,
      };
    }),
  );
  expect(states[0].targets).toBe(0);
  expect(states[0].enabled).toBe(false);
  expect(states[0].disposed).toBe(states[0].allocated);
  expect(states[0].allocated).toBeGreaterThan(0);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, bloom: 0.24 });
    g.renderer.setPixelRatio(1.25);
    g.renderer.setSize(innerWidth, innerHeight);
    g.composer.setPixelRatio(1.25);
    g.composer.setSize(innerWidth, innerHeight);
  });
  await frames(page);
  states.push(
    await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        b = g.composer.effects.bloom;
      return {
        stage: 'dpr',
        frame: [
          g.composer.passes[0].target.width,
          g.composer.passes[0].target.height,
        ],
        composerSize: [
          g.composer.readBuffer.width,
          g.composer.readBuffer.height,
        ],
        first: [b.down[0].width, b.down[0].height],
        gl: g.renderer.getContext().getError(),
      };
    }),
  );
  expect(states[1].first).toEqual(states[1].frame.map((n) => Math.ceil(n / 2)));
  await page.setViewportSize({ width: 721, height: 537 });
  await frames(page);
  for (const quality of [0.65, 1, 1.7]) {
    await page.evaluate(
      (q) => window.__hexwild.graphics.setQuality(q),
      quality,
    );
    await frames(page);
    states.push(
      await page.evaluate(() => {
        const g = window.__hexwild.graphics;
        return {
          stage: 'quality',
          quality: g.quality,
          composer: !!g.composer,
          gl: g.renderer.getContext().getError(),
        };
      }),
    );
    expect(states.at(-1).composer).toBe(quality === 1.7);
  }
  await page.evaluate(() => {
    const canvas = document.querySelector('#world'),
      ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!ext) throw Error('WEBGL_lose_context unavailable');
    window.bloomRestored = false;
    canvas.addEventListener(
      'webglcontextrestored',
      () => (window.bloomRestored = true),
      { once: true },
    );
    window.restoreBloom = () => ext.restoreContext();
    ext.loseContext();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.restoreBloom());
  await waitForRecoveredRenderer(page);
  await expect
    .poll(() => page.evaluate(() => window.bloomRestored), { timeout: 30000 })
    .toBe(true);
  await frames(page, 12);
  states.push(
    await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        b = g.composer.effects.bloom;
      return {
        stage: 'restored',
        targets: b.down.length + b.up.length,
        first: [b.down[0].width, b.down[0].height],
        frame: [
          g.composer.passes[0].target.width,
          g.composer.passes[0].target.height,
        ],
        composerSize: [
          g.composer.readBuffer.width,
          g.composer.readBuffer.height,
        ],
        targetPixels: [...b.down, ...b.up].reduce(
          (sum, t) => sum + t.width * t.height,
          0,
        ),
        gl: g.renderer.getContext().getError(),
      };
    }),
  );
  const restored = states.at(-1);
  expect(restored.targets).toBeGreaterThan(0);
  expect(restored.first).toEqual(restored.frame.map((n) => Math.ceil(n / 2)));
  expect(restored.targetPixels).toBeLessThan(
    restored.frame[0] * restored.frame[1],
  );
  for (const state of states.filter((v) => 'gl' in v)) expect(state.gl).toBe(0);
  await page.screenshot({ path: info.outputPath('restored.png') });
  await writeFile(
    info.outputPath('lifecycle.json'),
    JSON.stringify(
      { states, device: await device(page), diagnostics },
      null,
      2,
    ),
  );
  expect(diagnostics.errors).toEqual([]);
});
