import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { installRecoveryDeviceProbe } from './fixtures/recovery-device-probe.js';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';

test('real context recovery keeps the UI responsive, freezes gameplay and restores all three quality levels', async ({
  page,
}, info) => {
  test.setTimeout(480000);
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.setViewportSize({ width: 640, height: 480 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.addInitScript(installRecoveryDeviceProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.locator('#save-file').setInputFiles({
    name: 'forest-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.__hexwild.setPlaying(false));
  const settle = () =>
    expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.recovering &&
              !g.relightQueue.size &&
              !!g.skyEnvironment.atmosphere.fogSnapshot &&
              !g.skyEnvironment.atmosphere.pending
            );
          }),
        { timeout: 120000 },
      )
      .toBe(true);
  await settle();
  const results = [];
  for (const quality of [1.7, 1, 0.65]) {
    await page.evaluate((q) => {
      const a = window.__hexwild;
      a.graphics.setQuality(q);
      a.setPlaying(true);
      window.__recoveryDevice.arm(a.graphics);
    }, quality);
    const before = await page.evaluate(async () => {
      const a = window.__hexwild,
        g = a.graphics,
        canvas = g.renderer.domElement,
        extension = g.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!extension) throw Error('WEBGL_lose_context unavailable');
      window.recoveryExtension = extension;
      await new Promise((resolve) => {
        canvas.addEventListener('webglcontextlost', resolve, { once: true });
        extension.loseContext();
      });
      window.recoveryBeats = 0;
      window.recoveryBeatTimer = setInterval(() => window.recoveryBeats++, 25);
      return {
        time: a.state.time,
        position: g.camera.position.toArray(),
        revision: a.state.world.blockRevision,
        recovering: g.recovering,
        pointerLocked: !!document.pointerLockElement,
      };
    });
    expect(before.recovering).toBe(true);
    expect(before.pointerLocked).toBe(false);
    await expect(page.locator('#render-recovery')).toBeVisible();
    await expect(page.locator('#pause-overlay')).toBeVisible();
    if (quality === 1.7)
      await page.screenshot({ path: info.outputPath('recovering-ui.png') });
    const ready = await page.evaluate(async (quality) => {
      const a = window.__hexwild,
        g = a.graphics;
      await new Promise((resolve) => {
        g.renderer.domElement.addEventListener(
          'webglcontextrestored',
          resolve,
          {
            once: true,
          },
        );
        window.recoveryExtension.restoreContext();
      });
      let cancelled = null;
      if (quality === 1) {
        const previous = g.recovery;
        // Change quality while the real compiler submission is yielding. A
        // superseded preparation must not resume the scene or clear the UI.
        await new Promise((resolve) => setTimeout(resolve, 30));
        g.setQuality(quality);
        cancelled = await previous;
      }
      const success = await g.recovery;
      clearInterval(window.recoveryBeatTimer);
      return {
        success,
        cancelled,
        time: a.state.time,
        position: g.camera.position.toArray(),
        revision: a.state.world.blockRevision,
        beats: window.recoveryBeats,
        checkingErrors: g.renderer.debug.checkShaderErrors,
        pointerLocked: !!document.pointerLockElement,
      };
    }, quality);
    expect(ready.success).toBe(true);
    if (quality === 1) expect(ready.cancelled).toBe(false);
    expect(ready.time).toBe(before.time);
    expect(ready.position).toEqual(before.position);
    expect(ready.revision).toBe(before.revision);
    expect(ready.beats).toBeGreaterThan(0);
    expect(ready.checkingErrors).toBe(true);
    expect(ready.pointerLocked).toBe(false);
    await expect(page.locator('#render-recovery')).toBeHidden();
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await page.locator('#resume').evaluate((button) => {
      button.click();
      window.__hexwild.setPlaying(false);
    });
    await settle();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let remaining = 16;
          const next = () => {
            if (--remaining) requestAnimationFrame(next);
            else resolve();
          };
          requestAnimationFrame(next);
        }),
    );
    const profile = await page.evaluate(() => window.__recoveryDevice.finish());
    await writeFile(
      info.outputPath(`recovery-device-${quality}.json`),
      JSON.stringify(profile, null, 2),
    );
    const status = profile.phaseStats.restored['gl.getProgramInfoLog'];
    // The baseline stalled 8.47 s in one info-log query. Keep error checking,
    // and require this real driver run to avoid multi-second shader waits.
    expect(status.count).toBeGreaterThan(0);
    expect(status.maxMs).toBeLessThan(1000);
    expect(
      profile.frames.some((f) => f.phase === 'restored' && f.draws > 100),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`restored-${quality}.png`) });
    results.push({ quality, before, ready, shaderStatus: status });
  }
  await writeFile(
    info.outputPath('recovery-summary.json'),
    JSON.stringify({ results, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
