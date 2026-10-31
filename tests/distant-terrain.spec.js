import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceScenes,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('a real distant world fills the horizon without loading gameplay chunks and follows edits and teleports', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['warning', 'error'].includes(e.type())) messages.push(e.text());
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
  const save = referenceSave(referenceScenes[0]);
  save.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'far-jungle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.teleport(-177.5, 43, 54.5);
    a.lookAt(-157.5, 33, 54.5);
  });
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
              f.tiles.size === f.wanted.size &&
              g.atmosphere.uniforms.airDistantBlend.value === 1 &&
              !g.skyEnvironment.atmosphere.pending &&
              !g.relightQueue.size
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
  await ready();
  const native = await page.evaluate(() => {
    const a = window.__hexwild,
      g = a.graphics,
      f = g.distantTerrain;
    return {
      tiles: f.tiles.size,
      wanted: f.wanted.size,
      stats: f.stats,
      gameplayChunks: a.state.world.chunks.size,
      cameraFar: g.camera.far,
      fog: [g.scene.fog.near, g.scene.fog.far],
      edits: a.state.world.edits.size,
      bounds: [...f.tiles.values()].map((e) => [
        e.tile.tq,
        e.tile.tr,
        Math.min(...e.tile.heights),
        Math.max(...e.tile.heights),
      ]),
      vertices: [...f.tiles.values()].reduce(
        (n, e) => n + e.mesh.geometry.attributes.position.count,
        0,
      ),
      gl: g.renderer.getContext().getError(),
    };
  });
  await writeFile(
    info.outputPath('native.json'),
    JSON.stringify(native, null, 2),
  );
  expect(native.tiles).toBe(169);
  expect(native.stats.maxResidentChunks).toBe(25);
  expect(native.gameplayChunks).toBe(529);
  expect(native.cameraFar).toBe(480);
  expect(native.fog).toEqual([87.32, 118]);
  expect(native.edits).toBe(0);
  expect(native.gl).toBe(0);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('distant-jungle.png') });
  await page.evaluate(() => {
    const f = window.__hexwild.graphics.distantTerrain;
    window.__distantRender = f.render;
    f.render = function () {
      this.atmosphere.uniforms.airDistantBlend.value = 0;
    };
  });
  const detailFrame = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThan(detailFrame + 40);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('detail-only-jungle.png') });
  await page.evaluate(() => {
    window.__hexwild.graphics.distantTerrain.render = window.__distantRender;
    delete window.__distantRender;
  });
  await ready();
  const edits = await page.evaluate(() => {
    const a = window.__hexwild,
      w = a.state.world,
      g = a.graphics,
      f = g.distantTerrain,
      q = -40,
      r = 54,
      y = 60;
    w.set(q, y, r, 'wood');
    g.updateBlock(q, y, r);
    return {
      q,
      r,
      y,
      id: Math.floor(q / 32) + ',' + Math.floor(r / 32),
      before: f.stats.generated,
    };
  });
  // This point is outside the gameplay resident window but inside visual range.
  expect(
    await page.evaluate(
      ({ q, r }) => window.__hexwild.state.world.loaded(q, r),
      edits,
    ),
  ).toBe(false);
  await expect
    .poll(
      () =>
        page.evaluate(({ id }) => {
          const e = window.__hexwild.graphics.distantTerrain.tiles.get(id);
          return e && Math.max(...e.tile.heights);
        }, edits),
      { timeout: 120000 },
    )
    .toBe(61);
  await page.evaluate(({ q, y, r }) => {
    const a = window.__hexwild;
    a.state.world.set(q, y, r, 'stone');
    a.graphics.updateBlock(q, y, r);
  }, edits);
  await expect
    .poll(
      () =>
        page.evaluate(async ({ id, q, r }) => {
          const f = window.__hexwild.graphics.distantTerrain,
            e = f.tiles.get(id),
            { DISTANT_TYPES, DISTANT_SAMPLES } =
              await import('/src/distant-field.js');
          if (!e || e.generation !== (f.generations.get(id) || 0)) return null;
          const a = Math.floor((q - e.tile.tq * 32) / 4),
            b = Math.floor((r - e.tile.tr * 32) / 4);
          return DISTANT_TYPES[e.tile.types[a * DISTANT_SAMPLES + b]];
        }, edits),
      { timeout: 120000 },
    )
    .toBe('stone');
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.teleport(300, 45, 300);
    a.lookAt(320, 18, 300);
  });
  await ready();
  const relocated = await page.evaluate(() => {
    const a = window.__hexwild,
      g = a.graphics,
      f = g.distantTerrain;
    return {
      center: f.center,
      count: f.tiles.size,
      gameplay: a.state.world.chunks.size,
      keys: [...f.tiles.keys()],
      gl: g.renderer.getContext().getError(),
    };
  });
  expect(relocated.center).toBe('9,9');
  expect(relocated.count).toBe(169);
  expect(relocated.gameplay).toBe(529);
  expect(relocated.gl).toBe(0);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('distant-relocated.png') });
  const presets = [];
  for (const quality of [1, 0.65, 1.7]) {
    await page.evaluate(
      (q) => window.__hexwild.graphics.setQuality(q),
      quality,
    );
    await ready();
    presets.push(
      await page.evaluate(() => {
        const g = window.__hexwild.graphics,
          f = g.distantTerrain;
        return {
          quality: g.quality,
          vertices: [...f.tiles.values()].reduce(
            (n, e) => n + e.mesh.geometry.attributes.position.count,
            0,
          ),
          size: [f.target.width, f.target.height],
          cloudShadow: !!f.material.userData.hexCloudShadow,
          gl: g.renderer.getContext().getError(),
        };
      }),
    );
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(`distant-quality-${quality}.png`) });
  }
  await writeFile(
    info.outputPath('presets.json'),
    JSON.stringify(presets, null, 2),
  );
  const beforeRecovery = await page.evaluate(async () => {
    const a = window.__hexwild,
      g = a.graphics,
      f = g.distantTerrain,
      canvas = g.renderer.domElement;
    const before = {
      time: a.state.time,
      pose: g.camera.position.toArray(),
      edits: [...a.state.world.edits],
      tiles: f.tiles.size,
    };
    const ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) throw Error('WEBGL_lose_context unavailable');
    window.__distantRecoveryExtension = ext;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextlost', resolve, { once: true });
      ext.loseContext();
    });
    return before;
  });
  await expect(page.locator('#render-recovery')).toBeVisible();
  const recovery = await page.evaluate(async (before) => {
    const a = window.__hexwild,
      g = a.graphics,
      f = g.distantTerrain,
      canvas = g.renderer.domElement;
    await new Promise((resolve) => {
      canvas.addEventListener('webglcontextrestored', resolve, { once: true });
      window.__distantRecoveryExtension.restoreContext();
    });
    const success = await g.recovery;
    return {
      success,
      before,
      after: {
        time: a.state.time,
        pose: g.camera.position.toArray(),
        edits: [...a.state.world.edits],
        tiles: f.tiles.size,
      },
      pointerLocked: !!document.pointerLockElement,
    };
  }, beforeRecovery);
  expect(recovery.success).toBe(true);
  expect(recovery.after).toEqual(recovery.before);
  expect(recovery.pointerLocked).toBe(false);
  await ready();
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('distant-restored.png') });
  expect(
    presets.every(
      (p) => p.cloudShadow && p.gl === 0 && p.size.every((v) => v > 0),
    ),
  ).toBe(true);
  await writeFile(
    info.outputPath('distant.json'),
    JSON.stringify(
      { native, edits, relocated, presets, recovery, messages },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
