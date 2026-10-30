import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSettings,
  referenceSave,
  referenceScenes,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('native cloud optics remain published through delayed sky delivery and coefficient changes restart actual view histories', async ({
  page,
}, info) => {
  test.setTimeout(480000);
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const save = referenceSave(referenceScenes[0]);
  save.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'cloud-optics-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  const settle = async (y) => {
    await expect
      .poll(
        () =>
          page.evaluate((y) => {
            const g = window.__hexwild.graphics,
              a = g.skyEnvironment.atmosphere;
            return (
              !a.pending &&
              Math.abs(a.uniforms.skySunDirection.value.y - y) < 0.001 &&
              [...g.composer.passes[0].clouds.histories.values()].some(
                (s) =>
                  s.frames >= 16 &&
                  s.optics.every((v, i) =>
                    v.equals(a.uniforms.cloudOptics.value[i]),
                  ),
              )
            );
          }, y),
        { timeout: 90000 },
      )
      .toBe(true);
  };
  const dayY = (Math.sin((120 * Math.PI) / 300) * 78) / Math.hypot(78, 45);
  await settle(dayY);
  const capture = () =>
    page.evaluate(async () => {
      const { probeCloudOptics } =
        await import('/tests/fixtures/cloud-optics-probe.js');
      return probeCloudOptics(window.__hexwild.graphics);
    });
  const before = await capture();
  await page.evaluate(() => {
    const r = window.__hexwild.graphics.renderer,
      original = r.readRenderTargetPixelsAsync,
      a = window.__hexwild.graphics.skyEnvironment.atmosphere;
    window.restoreOpticsDevice = () =>
      (r.readRenderTargetPixelsAsync = original);
    r.readRenderTargetPixelsAsync = function (...args) {
      const result = original.apply(this, args);
      return args[0] === a.targets[2]
        ? result.then(
            (value) =>
              new Promise((resolve) => setTimeout(() => resolve(value), 1500)),
          )
        : result;
    };
    window.__hexwild.step(300 - window.__hexwild.state.time);
  });
  let during, after;
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            return (
              !!a.pending &&
              Math.abs(a.work.skySunDirection.value.y) < 0.001 &&
              a.uniforms.skySunDirection.value.y > 0.8
            );
          }),
        { timeout: 90000, intervals: [50] },
      )
      .toBe(true);
    during = await capture();
    expect(during.pending).toBe(true);
    expect(during.cpu).toEqual(before.cpu);
    expect(
      during.work.some((v, i) => Math.abs(v - before.cpu[i]) > 0.001),
    ).toBe(true);
    await settle(0);
    after = await capture();
    expect(after.cpu).toEqual(during.work);
  } finally {
    await page.evaluate(() => window.restoreOpticsDevice());
  }
  for (const s of [before, during, after]) {
    expect(s.shared).toBe(true);
    expect(s.isolated).toBe(true);
    expect(s.gl).toBe(0);
    s.gpu.forEach((v, i) =>
      expect(Math.abs(v - s.cpu[i])).toBeLessThan(0.000001),
    );
  }
  await page.evaluate(() =>
    window.__hexwild.step(120 - window.__hexwild.state.time),
  );
  await settle(dayY);
  await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      p = g.composer.passes[0].clouds,
      original = p.render,
      saved = g.cloudSystem.uniforms.cloudOptics.value.map((v) => v.clone());
    window.opticsHistoryEvents = [];
    window.restoreOpticsHistory = () => {
      p.render = original;
      g.cloudSystem.uniforms.cloudOptics.value.forEach((v, i) =>
        v.copy(saved[i]),
      );
    };
    p.render = function (renderer, source, ...rest) {
      const s = this.histories.get(source),
        before = s ? { frames: s.frames, extinction: s.optics[0].x } : null;
      const result = original.call(this, renderer, source, ...rest),
        after = this.histories.get(source);
      if (
        before?.frames >= 8 &&
        Math.abs(before.extinction - after.optics[0].x) > 0.001
      )
        window.opticsHistoryEvents.push({
          before,
          frames: after.frames,
          extinction: after.optics[0].x,
          ready: this.resolve.uniforms.cloudReady.value,
        });
      return result;
    };
    g.cloudSystem.uniforms.cloudOptics.value[0].x *= 0.5;
  });
  let events;
  try {
    await expect
      .poll(() => page.evaluate(() => window.opticsHistoryEvents.length), {
        timeout: 30000,
      })
      .toBeGreaterThan(0);
    events = await page.evaluate(() => window.opticsHistoryEvents);
    for (const e of events) {
      expect(e.frames).toBe(1);
      expect(e.ready).toBe(false);
      expect(e.extinction / e.before.extinction).toBeCloseTo(0.5, 8);
    }
  } finally {
    await page.evaluate(() => window.restoreOpticsHistory());
  }
  await writeFile(
    info.outputPath('cloud-optics-publication.json'),
    JSON.stringify({ before, during, after, events, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
