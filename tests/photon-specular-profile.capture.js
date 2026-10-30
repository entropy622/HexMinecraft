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
import { setSurfaceSpecularControl } from './fixtures/surface-diffuse-control.js';

test('FHD native forest specular on off on and balanced production costs', async ({
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
  async function ready() {
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
  }
  async function warm(n) {
    const at = await page.evaluate(() => window.__cloudStages.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__cloudStages.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + n);
  }
  await ready();
  await warm(120);
  for (const quality of [1.7, 1]) {
    if (quality === 1) {
      await page.evaluate(() => window.__hexwild.graphics.setQuality(1));
      await ready();
      await warm(120);
    }
    for (const [label, enabled, withGpu] of [
      ['on', true, true],
      ['off', false, true],
      ['restored', true, true],
      ['passive', true, false],
    ]) {
      expect(await page.evaluate(setSurfaceSpecularControl, enabled)).toBe(
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
      const measured = await page.evaluate(() => window.__cloudStages.result());
      const frame =
        quality === 1.7
          ? await page.evaluate(readReferenceFrame, resourceLayout)
          : await page.evaluate(() => {
              const g = window.__hexwild.graphics;
              return {
                settings: {
                  quality: g.quality,
                  surfaceSpecular: g.weatherUniforms.surfaceSpecular.value,
                  surfaceLightRadius:
                    g.weatherUniforms.surfaceLightRadius.value,
                  exposure: g.renderer.toneMappingExposure,
                },
                composer: !!g.composer,
                terrain: {
                  fogNear: g.scene.fog.near,
                  fogFar: g.scene.fog.far,
                  renderedChunks: g.chunks.size,
                },
                glErrors: [g.renderer.getContext().getError()].filter(Boolean),
              };
            });
      const totals = measured.frames.map((f) =>
        measured.gpu
          .filter((s) => s.index === f.index)
          .reduce((n, s) => n + s.milliseconds, 0),
      );
      const stages = Object.fromEntries(
        [...new Set(measured.gpu.map((s) => s.stage))].map((name) => [
          name,
          distribution(
            measured.frames.map((f) =>
              measured.gpu
                .filter((s) => s.index === f.index && s.stage === name)
                .reduce((n, s) => n + s.milliseconds, 0),
            ),
          ),
        ]),
      );
      const result = {
        quality,
        label,
        enabled,
        withGpu,
        measured,
        frame,
        gpu: withGpu ? distribution(totals) : null,
        stages,
        cpu: distribution(measured.frames.map((f) => f.cpuSubmitMs)),
        raf: distribution(
          measured.frames
            .slice(1)
            .map((f, i) => f.timestamp - measured.frames[i].timestamp),
        ),
        messages,
      };
      windows.push(result);
      await writeFile(
        info.outputPath(
          (quality === 1.7 ? 'high' : 'balanced') + '-' + label + '.json',
        ),
        JSON.stringify(result, null, 2),
      );
      expect(measured.frames).toHaveLength(120);
      expect(measured.disjoint).toBe(0);
      expect(measured.busy).toBe(0);
      expect(frame.glErrors).toEqual([]);
      expect(frame.settings.surfaceSpecular).toBe(enabled ? 1 : 0);
      expect(frame.settings.exposure).toBe(1);
      expect(frame.terrain.fogNear).toBe(87.32);
      expect(frame.terrain.fogFar).toBe(118);
      expect(frame.terrain.renderedChunks).toBe(441);
      if (withGpu) expect(measured.gpu.length).toBeGreaterThan(0);
      else expect(measured.gpu).toEqual([]);
      if (quality === 1) expect(frame.composer).toBe(false);
      if (label === 'on' || label === 'off')
        await page.locator('#world').screenshot({
          path: info.outputPath(
            (quality === 1.7 ? 'high' : 'balanced') + '-' + label + '.png',
          ),
        });
      expect(messages).toEqual({ errors: [], warnings: [] });
    }
  }
  await writeFile(
    info.outputPath('specular-profile-summary.json'),
    JSON.stringify(
      {
        windows: windows.map(
          ({
            quality,
            label,
            enabled,
            withGpu,
            frame,
            gpu,
            cpu,
            raf,
            stages,
          }) => ({
            quality,
            label,
            enabled,
            withGpu,
            frame,
            gpu,
            cpu,
            raf,
            stages,
          }),
        ),
        messages,
        scope:
          'Same process fixed native forest. Only GGX directional highlight branch disabled; optical metadata and source metal diffuse remain. A/B/A plus separate no-query CPU windows in each quality. No screenshot/readback inside timing.',
      },
      null,
      2,
    ),
  );
});
