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
import { setSurfaceEnvironmentControl } from './fixtures/surface-diffuse-control.js';

test('FHD shared surface reflection costs and native forest on off on', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const messages = { errors: [], warnings: [] },
    windows = [];
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
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
  async function warm(n) {
    const at = await page.evaluate(() => window.__cloudStages.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + n);
  }
  await warm(120);
  for (const [label, enabled, withGpu] of [
    ['on', true, true],
    ['off', false, true],
    ['restored', true, true],
    ['passive', true, false],
  ]) {
    expect(await page.evaluate(setSurfaceEnvironmentControl, enabled)).toBe(
      enabled ? 1 : 0,
    );
    await warm(24);
    await page.evaluate(
      (withGpu) => window.__cloudStages.start(120, withGpu),
      withGpu,
    );
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.done), {
        timeout: 90000,
      })
      .toBe(true);
    const measured = await page.evaluate(() => window.__cloudStages.result()),
      frame = await page.evaluate(readReferenceFrame, resourceLayout);
    const state = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        p = g.composer.effects.protection;
      return {
        strength:
          g.composer.effects.wet.material.uniforms.environmentStrength.value,
        attachments: p.target.textures.length,
        variants: p.ownedMaterials.size,
        eligible: g.terrain.children.filter((m) => m.userData.surfaceReflection)
          .length,
      };
    });
    const totals = measured.frames.map((f) =>
      measured.gpu
        .filter((s) => s.index === f.index)
        .reduce((n, s) => n + s.milliseconds, 0),
    );
    const result = {
      label,
      enabled,
      withGpu,
      frame,
      state,
      gpu: withGpu ? distribution(totals) : null,
      cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
      raf: distribution(
        measured.frames
          .slice(1)
          .map((f, i) => f.timestamp - measured.frames[i].timestamp),
      ),
      measured,
    };
    windows.push(result);
    await writeFile(
      info.outputPath(label + '.json'),
      JSON.stringify(result, null, 2),
    );
    expect(measured.frames).toHaveLength(120);
    expect(measured.disjoint).toBe(0);
    expect(measured.busy).toBe(0);
    expect(frame.glErrors).toEqual([]);
    expect(state.strength).toBe(enabled ? 1 : 0);
    expect(state.attachments).toBe(3);
    expect(frame.terrain.fogNear).toBe(87.32);
    expect(frame.terrain.fogFar).toBe(118);
    expect(frame.terrain.renderedChunks).toBe(441);
    expect(frame.settings.exposure).toBe(1);
    expect(frame.resources.renderTargetBytes).toBe(234743560 + 1920 * 1080 * 8);
    expect(frame.resources.geometryAttributeBytes).toBe(351337732);
    if (withGpu) expect(measured.gpu.length).toBeGreaterThan(0);
    if (label === 'on' || label === 'off')
      await page
        .locator('#world')
        .screenshot({ path: info.outputPath(label + '.png') });
    expect(messages).toEqual({ errors: [], warnings: [] });
  }
  await page.evaluate(() => window.__hexwild.graphics.setQuality(1));
  expect(await page.evaluate(() => !!window.__hexwild.graphics.composer)).toBe(
    false,
  );
  await writeFile(
    info.outputPath('reflection-profile-summary.json'),
    JSON.stringify(
      {
        windows: windows.map(({ measured, ...r }) => r),
        messages,
        scope:
          'Fixed forest, same process A/B/A; disables environment reflection and its eligible geometry draw but retains allocated attachments and legacy wet path. Separate passive CPU window. No screenshot or readback during timing. Sparse reflective surfaces; not a metal-heavy stress benchmark.',
      },
      null,
      2,
    ),
  );
});

test('FHD native metal floor measures the dense four-ray reflection workload', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const messages = { errors: [], warnings: [] },
    windows = [];
  page.on('pageerror', (e) => messages.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.errors.push(e.text());
    if (e.type() === 'warning') messages.warnings.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
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
  await page.evaluate(() => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      cells = [];
    api.setPlaying(false);
    api.step(120 - api.state.time);
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
          if (r === -5 && y >= 31 && y <= 38) type = 'blueWool';
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
  async function warm(n) {
    const at = await page.evaluate(() => window.__cloudStages.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + n);
  }
  await warm(120);
  for (const [label, enabled] of [
    ['on', true],
    ['off', false],
    ['restored', true],
  ]) {
    expect(await page.evaluate(setSurfaceEnvironmentControl, enabled)).toBe(
      enabled ? 1 : 0,
    );
    await warm(24);
    await page.evaluate(() => window.__cloudStages.start(120, true));
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.done), {
        timeout: 90000,
      })
      .toBe(true);
    const measured = await page.evaluate(() => window.__cloudStages.result()),
      frame = await page.evaluate(readReferenceFrame, resourceLayout);
    const totals = measured.frames.map((f) =>
      measured.gpu
        .filter((s) => s.index === f.index)
        .reduce((n, s) => n + s.milliseconds, 0),
    );
    const result = {
      label,
      enabled,
      frame,
      gpu: distribution(totals),
      cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
      measured,
    };
    windows.push(result);
    await writeFile(
      info.outputPath(label + '.json'),
      JSON.stringify(result, null, 2),
    );
    expect(measured.frames).toHaveLength(120);
    expect(measured.disjoint).toBe(0);
    expect(measured.busy).toBe(0);
    expect(frame.glErrors).toEqual([]);
    expect(messages).toEqual({ errors: [], warnings: [] });
    if (label !== 'restored')
      await page
        .locator('#world')
        .screenshot({ path: info.outputPath(label + '.png') });
  }
  await writeFile(
    info.outputPath('metal-profile-summary.json'),
    JSON.stringify(
      {
        windows: windows.map(({ measured, ...r }) => r),
        messages,
        scope:
          'Dense native iron/gem floor and blue wool wall, seed624 time120 FHD. Same process A/B/A; environment shader and eligible metadata draw disabled together, buffers retained. No screenshot/readback during timing. Different post options from forest; compare windows within this scene.',
      },
      null,
      2,
    ),
  );
});
