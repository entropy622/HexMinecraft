import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installCloudStageProbe } from './fixtures/cloud-stage-probe.js';
import {
  distribution,
  readReferenceFrame,
  resourceLayout,
} from './fixtures/photon-reference-artifacts.js';

test('FHD forest real WebGL stage costs', async ({ page }, info) => {
  test.setTimeout(240000);
  const messages = { errors: [], warnings: [] };
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    referenceSettings,
  );
  await page.addInitScript(installCloudStageProbe);
  await page.goto('/');
  await page.evaluate(() => {
    window.__photonFreeze = true;
  });
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  const first = await page.evaluate(() => window.__cloudStages.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(first + 120);
  const cpuSession =
    process.env.PHOTON_PROFILE_CPU === '1'
      ? await page.context().newCDPSession(page)
      : null;
  if (cpuSession) {
    await cpuSession.send('Profiler.enable');
    await cpuSession.send('Profiler.start');
  }
  await page.evaluate(() => window.__cloudStages.start(120));
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  if (cpuSession) {
    const { profile } = await cpuSession.send('Profiler.stop');
    await writeFile(
      info.outputPath('depth-on.cpuprofile'),
      JSON.stringify(profile),
    );
  }
  const measured = await page.evaluate(() => window.__cloudStages.result());
  const frame = await page.evaluate(readReferenceFrame, resourceLayout);
  const stages = {};
  for (const name of new Set(measured.gpu.map((s) => s.stage))) {
    const totals = measured.frames.map((f) =>
      measured.gpu
        .filter((s) => s.index === f.index && s.stage === name)
        .reduce((a, s) => a + s.milliseconds, 0),
    );
    stages[name] = distribution(totals);
  }
  const result = {
    measured,
    stages,
    cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
    frame,
    messages,
    scope:
      'Actual GPU batches grouped by production render target. Queries end at framebuffer binds; clears before the first draw are excluded. Scene groups include their final cloud copy. No nested whole-frame GPU query or screenshot/readback in the measurement window.',
  };
  await writeFile(
    info.outputPath('cloud-stages.json'),
    JSON.stringify(result, null, 2),
  );
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest.png') });
  expect(frame.time).toBe(30);
  expect(frame.settings.exposure).toBe(1);
  expect(frame.terrain.fogNear).toBe(87.32);
  expect(frame.glErrors).toEqual([]);
  expect(measured.frames).toHaveLength(120);
  expect(measured.counterBits).toBeGreaterThan(0);
  expect(stages['scene-main']?.count).toBe(120);
  expect(stages['cloud-integrate-main']?.median).toBeGreaterThan(0);
  expect(measured.disjoint).toBe(0);
  expect(measured.busy).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
  // Same source/scene/history, with only the final CAS switch changed. The old
  // temporal sharpen has already been removed in both conditions.
  const casOffAt = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, sharpening: false });
    return window.__cloudStages.rendered;
  });
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(casOffAt + 24);
  await page.evaluate(() => window.__cloudStages.start(120));
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  const casOff = await page.evaluate(() => window.__cloudStages.result()),
    casOffFrame = await page.evaluate(readReferenceFrame, resourceLayout);
  await writeFile(
    info.outputPath('cas-off-control.json'),
    JSON.stringify(
      {
        measured: casOff,
        frame: casOffFrame,
        gpu: distribution(
          casOff.frames.map((f) =>
            casOff.gpu
              .filter((g) => g.index === f.index)
              .reduce((sum, g) => sum + g.milliseconds, 0),
          ),
        ),
        output: distribution(
          casOff.frames.map((f) =>
            casOff.gpu
              .filter((g) => g.index === f.index && g.stage === 'output')
              .reduce((sum, g) => sum + g.milliseconds, 0),
          ),
        ),
        cpu: distribution(casOff.frames.map((f) => f.cpuSubmitMs)),
        messages,
      },
      null,
      2,
    ),
  );
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('forest-cas-off.png') });
  expect(casOffFrame.settings.post.sharpening).toBe(false);
  expect(casOff.frames).toHaveLength(120);
  expect(casOff.disjoint).toBe(0);
  expect(casOff.busy).toBe(0);
  const casOnAt = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.setPostOptions({ ...g.postOptions, sharpening: true });
    return window.__cloudStages.rendered;
  });
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(casOnAt + 24);
  // Same-process control retains the complete current lighting algorithm.
  // Disable only early leaf depth, warm it, and measure the same fixed view.
  const controlAt = await page.evaluate(() => {
    window.__hexwild.graphics.composer.passes[0].beauty.depthPrepassEnabled = false;
    return window.__cloudStages.rendered;
  });
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(controlAt + 24);
  if (cpuSession) await cpuSession.send('Profiler.start');
  await page.evaluate(() => window.__cloudStages.start(120));
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  if (cpuSession) {
    const { profile } = await cpuSession.send('Profiler.stop');
    await writeFile(
      info.outputPath('depth-off.cpuprofile'),
      JSON.stringify(profile),
    );
    await cpuSession.detach();
  }
  const control = await page.evaluate(() => ({
      measured: window.__cloudStages.result(),
      enabled:
        window.__hexwild.graphics.composer.passes[0].beauty.depthPrepassEnabled,
    })),
    controlFrame = await page.evaluate(readReferenceFrame, resourceLayout),
    controlStages = {};
  for (const name of new Set(control.measured.gpu.map((s) => s.stage)))
    controlStages[name] = distribution(
      control.measured.frames.map((f) =>
        control.measured.gpu
          .filter((s) => s.index === f.index && s.stage === name)
          .reduce((a, s) => a + s.milliseconds, 0),
      ),
    );
  await writeFile(
    info.outputPath('depth-prepass-control.json'),
    JSON.stringify(
      {
        ...control,
        stages: controlStages,
        cpu: distribution(control.measured.frames.map((f) => f.cpuSubmitMs)),
        frame: controlFrame,
        messages,
      },
      null,
      2,
    ),
  );
  expect(control.enabled).toBe(false);
  expect(control.measured.frames).toHaveLength(120);
  expect(control.measured.disjoint).toBe(0);
  expect(control.measured.busy).toBe(0);
  expect(controlFrame.glErrors).toEqual([]);
  // Timer-query calls can themselves affect driver/CPU submission. Observe
  // ordinary RAF/CPU windows too, without any GPU queries or GPU status polls.
  const passive = [];
  for (const enabled of [true, false]) {
    const at = await page.evaluate((enabled) => {
      window.__hexwild.graphics.composer.passes[0].beauty.depthPrepassEnabled =
        enabled;
      return window.__cloudStages.rendered;
    }, enabled);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 24);
    await page.evaluate(() => window.__cloudStages.start(120, false));
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.done), {
        timeout: 90000,
      })
      .toBe(true);
    const measured = await page.evaluate(() => window.__cloudStages.result());
    expect(measured.gpu).toEqual([]);
    expect(measured.frames).toHaveLength(120);
    passive.push({
      enabled,
      measured,
      cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
      raf: distribution(
        measured.frames
          .slice(1)
          .map((f, i) => f.timestamp - measured.frames[i].timestamp),
      ),
    });
  }
  await writeFile(
    info.outputPath('depth-prepass-cpu-only.json'),
    JSON.stringify({ passive, messages }, null, 2),
  );
  await page.evaluate(() => {
    window.__hexwild.graphics.composer.passes[0].beauty.depthPrepassEnabled = true;
  });
  await page.evaluate(() => {
    window.__cloudStages.start(120);
    const a = window.__hexwild;
    a.teleport(-96, 22.5, 4);
    a.lookAt(-74, 17, -4);
    a.graphics.stepOffset = 0;
  });
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.done), {
      timeout: 90000,
    })
    .toBe(true);
  const moved = await page.evaluate(() => window.__cloudStages.result()),
    rebuilds = moved.gpu.filter((s) => s.stage === 'cloud-coverage');
  await writeFile(
    info.outputPath('coverage-rebuild.json'),
    JSON.stringify(
      {
        moved,
        rebuilds,
        cost: distribution(rebuilds.map((s) => s.milliseconds)),
        messages,
        scope:
          'Native teleport across a snapped tile boundary; actual GPU coverage draw, includes cold target update. This is not a sustained walking FPS measurement.',
      },
      null,
      2,
    ),
  );
  expect(rebuilds.length).toBeGreaterThan(0);
  expect(moved.disjoint).toBe(0);
  expect(moved.busy).toBe(0);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
  // The new default tone function also runs without a composer. Measure that
  // real quality separately; no old balanced measurement is claimed here.
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.teleport(-120, 22.5, 4);
    a.lookAt(-98, 17, -4);
    a.graphics.stepOffset = 0;
    a.graphics.setQuality(1);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  const balancedAt = await page.evaluate(() => window.__cloudStages.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(balancedAt + 120);
  const balanced = [];
  for (const withGpu of [true, false]) {
    await page.evaluate(
      (withGpu) => window.__cloudStages.start(120, withGpu),
      withGpu,
    );
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.done), {
        timeout: 90000,
      })
      .toBe(true);
    const measured = await page.evaluate(() => window.__cloudStages.result());
    expect(measured.frames).toHaveLength(120);
    expect(measured.disjoint).toBe(0);
    expect(measured.busy).toBe(0);
    if (withGpu) expect(measured.gpu.length).toBeGreaterThan(0);
    else expect(measured.gpu).toEqual([]);
    balanced.push({
      withGpu,
      measured,
      gpu: withGpu
        ? distribution(
            measured.frames.map((f) =>
              measured.gpu
                .filter((g) => g.index === f.index)
                .reduce((sum, g) => sum + g.milliseconds, 0),
            ),
          )
        : null,
      cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
      raf: distribution(
        measured.frames
          .slice(1)
          .map((f, i) => f.timestamp - measured.frames[i].timestamp),
      ),
    });
  }
  const balancedFrame = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    return {
      quality: g.quality,
      composer: !!g.composer,
      toneMapping: g.renderer.toneMapping,
      fog: [g.scene.fog.near, g.scene.fog.far],
      renderedChunks: g.chunks.size,
      gl: g.renderer.getContext().getError(),
    };
  });
  await writeFile(
    info.outputPath('balanced-stages.json'),
    JSON.stringify(
      {
        balanced,
        frame: balancedFrame,
        messages,
        scope:
          'Actual FHD default quality=1, same seed/time/camera; GPU batches and a separate no-query CPU/RAF window. No old balanced control.',
      },
      null,
      2,
    ),
  );
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('balanced.png') });
  expect(balancedFrame).toMatchObject({
    quality: 1,
    composer: false,
    fog: [87.32, 118],
    renderedChunks: 441,
    gl: 0,
  });
  expect(messages).toEqual({ errors: [], warnings: [] });
});
