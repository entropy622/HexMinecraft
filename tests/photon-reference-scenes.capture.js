import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { DataUtils, HalfFloatType, RGBAFormat } from 'three';
import { World } from '../src/world.js';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
  referenceSizes,
  referenceLandmarks,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import {
  distribution,
  resourceLayout,
  readReferenceFrame,
  readReferenceHDR,
  encodeEXR,
} from './fixtures/photon-reference-artifacts.js';

const preview = process.env.PHOTON_REFERENCE_PRODUCTION === '1';
const writeJSON = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n');
async function importScene(page, scene) {
  await page.locator('#save-file').setInputFiles({
    name: `${scene.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(scene))),
  });
  await expect(page.locator('#hud')).toBeVisible();
}
async function preparePreferences(page) {
  await page.addInitScript(
    (settings) =>
      localStorage.setItem('hexwild-settings', JSON.stringify(settings)),
    referenceSettings,
  );
}

test('the first animation timestamp cannot send negative time into real rendering', async ({
  page,
}, info) => {
  test.skip(preview, 'Observes the existing development renderer boundary');
  const messages = captureMessages(page);
  await preparePreferences(page);
  await page.addInitScript(() => {
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const clock = (window.__clockBoundary = { injected: false, records: [] });
    window.requestAnimationFrame = (callback) =>
      nativeRAF((timestamp) => {
        const app = window.__hexwild;
        if (app && !clock.injected) {
          clock.injected = true;
          const render = app.graphics.frame;
          app.graphics.frame = function (...args) {
            if (clock.records.length < 12)
              clock.records.push({
                simulation: args[0],
                visual: args[7] ?? args[0],
                time: args[1],
              });
            return render.apply(this, args);
          };
          // rAF stamps a frame before invoking its callbacks. A stalled startup
          // can finish initialization after the timestamp of its first callback.
          clock.firstTimestamp = timestamp - 30000;
          callback(clock.firstTimestamp);
        } else callback(timestamp);
      });
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => window.__clockBoundary.records.length), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(3);
  const clock = await page.evaluate(() => ({
    ...window.__clockBoundary,
    airDensity: window.__hexwild.graphics.atmosphere.uniforms.airDensity.value,
  }));
  await writeJSON(info.outputPath('first-frame-clock.json'), {
    clock,
    messages,
  });
  expect(clock.injected).toBe(true);
  expect(clock.records.every((r) => r.visual >= 0 && r.visual <= 0.25)).toBe(
    true,
  );
  expect(
    clock.records.every((r) => r.simulation >= 0 && r.simulation <= 0.25),
  ).toBe(true);
  expect(Number.isFinite(clock.airDensity)).toBe(true);
  expect(clock.airDensity).toBeGreaterThanOrEqual(0);
  expect(clock.airDensity).toBeLessThan(0.03);
  expect(messages.errors).toEqual([]);
  expect(messages.warnings).toEqual([]);
});

function foregroundRadiance(hdr) {
  const raw = Buffer.from(hdr.base64, 'base64');
  let sum = 0,
    dark = 0,
    count = 0;
  for (let i = 0; i < hdr.width * Math.floor(hdr.height * 0.4) * 8; i += 8) {
    const l =
      DataUtils.fromHalfFloat(raw.readUInt16LE(i)) * 0.2126 +
      DataUtils.fromHalfFloat(raw.readUInt16LE(i + 2)) * 0.7152 +
      DataUtils.fromHalfFloat(raw.readUInt16LE(i + 4)) * 0.0722;
    sum += l;
    dark += l < 0.001;
    count++;
  }
  return { mean: sum / count, nearBlackFraction: dark / count };
}

test('live gameplay CPU profile at the fixed forest camera', async ({
  page,
  context,
}, info) => {
  test.skip(
    preview,
    'CPU profiling uses the existing development pause boundary',
  );
  const messages = captureMessages(page),
    client = await context.newCDPSession(page);
  try {
    await preparePreferences(page);
    await page.addInitScript(installFrameProbe);
    await page.goto('/');
    await page.evaluate(() => {
      window.__photonFreeze = true;
    });
    await importScene(page, referenceScenes[0]);
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
    const state = () => {
      const app = window.__hexwild,
        w = app.state.world;
      return {
        wallTime: performance.now(),
        time: app.state.time,
        renderedFrames: window.__photonProbe.rendered,
        blocks: w.blocks.size,
        residentChunks: w.chunks.size,
        lightRevision: w.lightRevision,
        gravityPending: w.gravity.pending.size,
        falling: w.gravity.active.length,
        fluidActive: w.fluids.active.size,
      };
    };
    const before = await page.evaluate(state);
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 1000 });
    await client.send('Profiler.start');
    await page.evaluate(() => {
      window.__photonFreeze = false;
      window.__hexwild.setPlaying(true);
    });
    await page.waitForTimeout(12000);
    const { profile } = await client.send('Profiler.stop');
    await page.evaluate(() => {
      window.__photonFreeze = true;
      window.__hexwild.setPlaying(false);
    });
    const after = await page.evaluate(state);
    await writeJSON(info.outputPath('live-gameplay.cpuprofile'), profile);
    await writeJSON(info.outputPath('live-gameplay.json'), {
      before,
      after,
      actualFrames: after.renderedFrames - before.renderedFrames,
      elapsedWallMilliseconds: after.wallTime - before.wallTime,
      simulationSeconds: after.time - before.time,
      frame: await page.evaluate(readReferenceFrame, resourceLayout),
      messages,
    });
    expect(after.time).toBeGreaterThan(before.time);
    expect(messages.errors).toEqual([]);
  } finally {
    await page.evaluate(() => {
      window.__photonFreeze = true;
      window.__hexwild?.setPlaying(false);
    });
    await client.detach();
    await writeJSON(info.outputPath('browser-messages.json'), messages);
  }
});
function captureMessages(page) {
  const errors = [],
    warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
    if (e.type() === 'warning') warnings.push(e.text());
  });
  return { errors, warnings };
}

test('production UI imports and re-exports the reusable native forest save', async ({
  page,
}, info) => {
  test.skip(
    !preview,
    'Run sequentially with PHOTON_REFERENCE_PRODUCTION=1 after build',
  );
  const messages = captureMessages(page),
    scene = referenceScenes[0],
    input = referenceSave(scene);
  try {
    await preparePreferences(page);
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.__hexwild)).toBe(
      'undefined',
    );
    // Queue ordinary Escape input at the DOM's import-ready boundary. A later
    // Playwright round trip allows real gravel gravity/time to advance first.
    await page.evaluate(() => {
      const hud = document.querySelector('#hud');
      const ready = new MutationObserver(() => {
        if (hud.classList.contains('hidden')) return;
        ready.disconnect();
        for (const type of ['keydown', 'keyup'])
          document.body.dispatchEvent(
            new KeyboardEvent(type, {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
            }),
          );
      });
      ready.observe(hud, { attributes: true, attributeFilter: ['class'] });
    });
    await importScene(page, scene);
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect(page.locator('#quality')).toHaveValue('1.7');
    await expect(page.locator('#exposure-toggle')).not.toBeChecked();
    await expect(page.locator('#sharpening-toggle')).toBeChecked();
    await expect(page.locator('#sharpness-strength')).toHaveValue('0.5');
    await expect(page.locator('#environment-reflections-toggle')).toBeChecked();
    await expect(page.locator('#sky-reflections-toggle')).toBeChecked();
    await expect(page.locator('#reflection-rays')).toHaveValue('4');
    await expect(page.locator('#reflection-steps')).toHaveValue('8');
    await page.locator('#reflection-rays').selectOption('2');
    await page.locator('#reflection-steps').selectOption('16');
    await page.locator('#environment-reflections-toggle').uncheck();
    await expect(page.locator('#reflection-steps')).toBeDisabled();
    await page.locator('#sky-reflections-toggle').uncheck();
    await expect(page.locator('#reflection-rays')).toBeDisabled();
    const reflectionPreferences = await page.evaluate(
      () => JSON.parse(localStorage.getItem('hexwild-settings')).post,
    );
    expect(reflectionPreferences.environmentReflections).toBe(false);
    expect(reflectionPreferences.skyReflections).toBe(false);
    expect(reflectionPreferences.reflectionRays).toBe(2);
    expect(reflectionPreferences.reflectionSteps).toBe(16);
    await page.locator('#environment-reflections-toggle').check();
    await page.locator('#sky-reflections-toggle').check();
    await page.locator('#reflection-rays').selectOption('4');
    await page.locator('#reflection-steps').selectOption('8');
    await page.locator('#sharpness-strength').focus();
    await page.keyboard.press('End');
    await page.locator('#sharpening-toggle').uncheck();
    await expect(page.locator('#sharpness-strength')).toBeDisabled();
    await expect(page.locator('#color-whiteBalance')).toHaveValue('6500');
    await page.locator('#color-whiteBalance').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#color-whiteBalance')).toHaveValue('9000');
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('hexwild-settings')).post
            .whiteBalance,
      ),
    ).toBe(9000);
    await page.locator('#color-reset').click();
    await expect(page.locator('#color-whiteBalance')).toHaveValue('6500');
    await expect(page.locator('#exposure-toggle')).not.toBeChecked();
    await expect(page.locator('#sharpening-toggle')).not.toBeChecked();
    await expect(page.locator('#sharpness-strength')).toHaveValue('1');
    await expect(page.locator('#environment-reflections-toggle')).toBeChecked();
    await expect(page.locator('#reflection-rays')).toHaveValue('4');
    await page.locator('#sharpening-toggle').check();
    await expect(page.locator('#sharpness-strength')).toBeEnabled();
    await page
      .locator('#post-settings')
      .screenshot({ path: info.outputPath('production-cas-settings.png') });
    await page
      .locator('#color-settings')
      .screenshot({ path: info.outputPath('production-color-settings.png') });
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    const result = JSON.parse(
      await readFile(await (await download).path(), 'utf8'),
    );
    await writeJSON(info.outputPath('production-native-export.json'), result);
    expect(result.seed).toBe(input.seed);
    expect(result.position).toEqual(input.position);
    expect(result.yaw).toBe(input.yaw);
    expect(result.pitch).toBe(input.pitch);
    expect(result.dimensions.overworld.edits).toEqual([]);
    expect(result.time).toBeGreaterThanOrEqual(input.time);
    expect(result.time).toBeLessThan(input.time + 1);
    expect(messages.errors).toEqual([]);
  } finally {
    await writeJSON(info.outputPath('browser-messages.json'), messages);
  }
});

for (const size of referenceSizes)
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    for (const scene of referenceScenes)
      test(`${scene.id} actual production frame baseline`, async ({
        page,
      }, info) => {
        test.skip(
          preview,
          'Capture uses existing development freeze seam; production import has its own UI check',
        );
        const messages = captureMessages(page),
          input = referenceSave(scene);
        try {
          await preparePreferences(page);
          await page.addInitScript(installFrameProbe);
          await page.goto('/');
          await expect
            .poll(() =>
              page.evaluate(() => !!window.__hexwild && !!window.__photonProbe),
            )
            .toBe(true);
          await page.evaluate(() => {
            window.__photonFreeze = true;
          });
          await importScene(page, scene);
          await page.keyboard.press('F1');
          await expect
            .poll(() => page.evaluate(() => window.__hexwild.state.playing))
            .toBe(false);
          const start = await page.evaluate(
            () => window.__photonProbe.rendered,
          );
          await expect
            .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
              timeout: 90000,
            })
            .toBeGreaterThanOrEqual(start + 120);
          await page.evaluate(() => window.__photonProbe.start(180));
          await expect
            .poll(() => page.evaluate(() => window.__photonProbe.done), {
              timeout: 90000,
            })
            .toBe(true);
          const timing = await page.evaluate(() =>
            window.__photonProbe.result(),
          );
          await writeJSON(info.outputPath('timing-samples.json'), timing);
          const frame = await page.evaluate(readReferenceFrame, resourceLayout);
          await writeJSON(info.outputPath('frame-before-readback.json'), frame);
          const pngFrame = await page.evaluate(
            () => window.__photonProbe.rendered,
          );
          await page
            .locator('#world')
            .screenshot({ path: info.outputPath('baseline.png') });
          const layers = await page.evaluate(async () => {
            const { readReferenceCloudLayers } =
              await import('/tests/fixtures/photon-reference-artifacts.js');
            return readReferenceCloudLayers();
          });
          await writeFile(
            info.outputPath('cloud-layers.png'),
            Buffer.from(layers.png, 'base64'),
          );
          delete layers.png;
          await writeJSON(info.outputPath('cloud-layers.json'), layers);
          const hdr = await page.evaluate(readReferenceHDR);
          const foreground = foregroundRadiance(hdr);
          const raw = Buffer.from(hdr.base64, 'base64');
          delete hdr.base64;
          await writeFile(info.outputPath('baseline.rgba16f'), raw);
          expect(hdr.type).toBe(HalfFloatType);
          expect(hdr.format).toBe(RGBAFormat);
          const exr = await encodeEXR(raw, hdr.width, hdr.height);
          await writeFile(info.outputPath('baseline.exr'), exr.buffer);
          const world = new World(input.seed, input.dimension, { load: false });
          world.ensureAround(scene.eye[0], scene.eye[2]);
          const landmarks = await page.evaluate(
            (points) =>
              points.map((point) => {
                const p = window.__hexwild.graphics.camera.position
                  .clone()
                  .fromArray(point.position)
                  .project(window.__hexwild.graphics.camera);
                return {
                  ...point,
                  ndc: p.toArray(),
                  inFrustum:
                    Math.abs(p.x) <= 1 &&
                    Math.abs(p.y) <= 1 &&
                    p.z >= -1 &&
                    p.z <= 1,
                };
              }),
            referenceLandmarks(scene, world),
          );
          const after = await page.evaluate(readReferenceFrame, resourceLayout);
          await writeJSON(info.outputPath('manifest.json'), {
            scene: scene.id,
            purpose: scene.purpose,
            input: {
              file: `${scene.id}.json`,
              seed: input.seed,
              time: input.time,
              position: input.position,
              yaw: input.yaw,
              pitch: input.pitch,
              weather: input.weather,
              preferences: referenceSettings,
              terrainEdits: input.dimensions.overworld.edits,
            },
            frame,
            landmarks,
            performance: {
              warmupRenderedFrames: 120,
              measuredRenderedFrames: timing.samples.length,
              gpuTimer: {
                extension: timing.extension,
                counterBits: timing.counterBits,
                disjointEvents: timing.disjointEvents,
                busy: timing.busy,
                pendingQueries: timing.pendingQueries,
              },
              gpuMilliseconds: distribution(
                timing.gpu.map((s) => s.milliseconds),
              ),
              browserFrameIntervalMilliseconds: distribution(
                timing.samples.map((s) => s.frameIntervalMs),
              ),
              cpuSubmitMilliseconds: distribution(
                timing.samples.map((s) => s.cpuSubmitMs),
              ),
              scope:
                'All actual world-WebGL work submitted by the production rAF callback. Browser interval and CPU submit are separate. No screenshot/readback in measurement window.',
            },
            artifacts: {
              png: 'baseline.png',
              exr: 'baseline.exr',
              rawHalf: 'baseline.rgba16f',
              timing: 'timing-samples.json',
            },
            hdr: {
              ...hdr,
              foreground,
              channels: 4,
              rawByteOrder: 'little-endian',
              rawRows: 'bottom-to-top',
              exrRows: 'top-to-bottom',
              color:
                'Linear-sRGB, pre-OutputPass, before tone mapping and display transfer',
              negativeChannelsPreserved: exr.negativeChannels,
              maxLinear: exr.maxLinear,
              pngFrame,
            },
            glAfterReadback: after.glErrors,
            messages,
          });
          if (scene.id === 'forest-toward-light') {
            // A finite HDR buffer alone allowed a near-black canopy through.
            // This fixed daytime camera must retain actual foreground radiance.
            expect(foreground.mean).toBeGreaterThan(0.005);
            expect(foreground.nearBlackFraction).toBeLessThan(0.1);
          }
          expect(frame.canvas).toEqual({ ...size, pixelRatio: 1 });
          expect([hdr.width, hdr.height]).toEqual([size.width, size.height]);
          expect(frame.seed).toBe(input.seed);
          expect(frame.position).toEqual(input.position);
          expect(frame.time).toBe(input.time);
          expect(frame.camera.rotation[0]).toBe(input.pitch);
          expect(frame.camera.rotation[1]).toBe(input.yaw);
          expect(frame.camera.fov).toBe(referenceSettings.fieldOfView);
          expect(frame.settings.quality).toBe(referenceSettings.quality);
          expect(frame.settings.exposure).toBe(1);
          expect(frame.settings.post).toEqual(referenceSettings.post);
          expect(frame.skyLighting.airDensity).toBeGreaterThanOrEqual(0);
          expect(frame.skyLighting.airDensity).toBeLessThan(0.03);
          expect(frame.skyLighting.cameraSky).toBeGreaterThanOrEqual(0);
          expect(frame.skyLighting.cameraSky).toBeLessThanOrEqual(1);
          if (scene.id === 'distance-ruler')
            expect(landmarks.every((point) => point.inFrustum)).toBe(true);
          expect(frame.clouds.historyCount).toBeGreaterThan(0);
          expect(frame.device.unmaskedRenderer).toMatch(/RTX 4060/);
          expect(frame.device.unmaskedRenderer).toMatch(/Direct3D11|D3D11/);
          expect(frame.device.contextLost).toBe(false);
          expect(frame.glErrors).toEqual([]);
          expect(after.glErrors).toEqual([]);
          expect(timing.samples).toHaveLength(180);
          expect(timing.disjointEvents).toBe(0);
          expect(timing.busy).toBe(0);
          expect(timing.pendingQueries).toBe(0);
          if (timing.extension && timing.counterBits > 0) {
            expect(timing.gpu.length).toBeGreaterThanOrEqual(160);
            expect(
              timing.gpu.every(
                (s) => s.milliseconds > 0 && Number.isFinite(s.milliseconds),
              ),
            ).toBe(true);
          } else expect(timing.gpu).toEqual([]);
          expect(messages.errors).toEqual([]);
        } finally {
          await page.evaluate(() => window.__photonProbe?.stop());
          await writeJSON(info.outputPath('browser-messages.json'), messages);
        }
      });
  });
