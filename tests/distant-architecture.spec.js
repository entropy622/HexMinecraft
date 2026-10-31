import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { distantArchitectureSave } from './fixtures/distant-architecture-save.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('real distant architecture keeps openings, glass coverage and exact edited cells across device recovery', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const input = distantArchitectureSave();
  await page.locator('#save-file').setInputFiles({
    name: 'suspended-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(input)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  async function ready() {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics,
              f = g.distantTerrain;
            return (
              f.ready &&
              !f.error &&
              f.tiles.size === 169 &&
              !g.recovering &&
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending &&
              g.atmosphere.uniforms.airDistantBlend.value === 1
            );
          }),
        { timeout: 240000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(at + 40);
  }
  const probe = () =>
    page.evaluate(async () => {
      const { architectureProbe } =
        await import('/tests/fixtures/distant-architecture-probe.js');
      return architectureProbe(window.__hexwild.graphics);
    });
  await ready();
  const native = await probe();
  expect(native.gl).toBe(0);
  expect(native.glass[3]).toBeGreaterThan(0.1);
  expect(native.glass[3]).toBeLessThan(0.98);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('architecture-native.png') });
  const data = await page.evaluate(async () => {
    const f = window.__hexwild.graphics.distantTerrain,
      { DISTANT_TYPES } = await import('/src/distant-field.js');
    const find = (q, y, r) => {
      const tq = Math.floor((q - 4) / 32),
        tr = Math.floor((r - 4) / 32),
        tile = f.tiles.get(`${tq},${tr}`).tile,
        key = ((q - tq * 32) * 40 + r - tr * 32) * tile.detailHeight + y;
      for (let i = 0; i < tile.fineDetails.length; i += 2)
        if (tile.fineDetails[i] === key)
          return DISTANT_TYPES[(tile.fineDetails[i + 1] >>> 16) - 1];
      return null;
    };
    return {
      floating: find(-63, 60, 33),
      below: find(-63, 59, 33),
      roof: find(-88, 54, 54),
      room: find(-88, 50, 54),
      tiles: f.tiles.size,
      gameplay: window.__hexwild.state.world.chunks.size,
    };
  });
  expect(data).toEqual({
    floating: 'ironBlock',
    below: null,
    roof: 'planks',
    room: null,
    tiles: 169,
    gameplay: 529,
  });
  await page.evaluate(
    () =>
      (window.__hexwild.graphics.distantTerrain.glassMaterial.visible = false),
  );
  await ready();
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('architecture-glass-hidden.png') });
  await page.evaluate(
    () =>
      (window.__hexwild.graphics.distantTerrain.glassMaterial.visible = true),
  );
  for (const quality of [1, 0.65, 1.7]) {
    await page.evaluate(
      (q) => window.__hexwild.graphics.setQuality(q),
      quality,
    );
    await ready();
    const result = await probe();
    expect(result.gl).toBe(0);
    expect(result.glass[3]).toBeGreaterThan(0.1);
    expect(result.glass[3]).toBeLessThan(0.98);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(`architecture-${quality}.png`) });
  }
  await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      canvas = g.renderer.domElement,
      ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) throw Error('WEBGL_lose_context unavailable');
    window.__architectureContext = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  const restored = await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      canvas = g.renderer.domElement;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextrestored', resolve, { once: true });
      window.__architectureContext.restoreContext();
    });
    return g.recovery;
  });
  expect(restored).toBe(true);
  await ready();
  const recovery = await probe();
  expect(recovery.gl).toBe(0);
  expect(recovery.glass[3]).toBeGreaterThan(0.1);
  expect(recovery.glass[3]).toBeLessThan(0.98);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await writeFile(
    info.outputPath('architecture.json'),
    JSON.stringify({ native, data, recovery, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
