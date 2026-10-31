import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import {
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('visited horizons return from bounded source data and invalidate offscreen edits before reuse', async ({
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
  const scene = { eye: [-177.5, 44.65, 54.5], look: [-157.5, 33, 54.5] },
    save = referenceSave(scene);
  save.time = 120;
  save.dimensions.overworld.edits.push(['-63,60,33', 'wood']);
  await page.locator('#save-file').setInputFiles({
    name: 'cached-jungle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
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
              f.tiles.size === f.wanted.size &&
              !f.job &&
              !f.completed.length &&
              [...f.tiles].every(
                ([id, e]) => e.generation === (f.generations.get(id) || 0),
              ) &&
              g.atmosphere.uniforms.airDistantBlend.value === 1 &&
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending
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
  async function snapshot() {
    return page.evaluate(async () => {
      const a = window.__hexwild,
        g = a.graphics,
        f = g.distantTerrain,
        tile = f.tiles.get(f.center).tile;
      const hash = await crypto.subtle.digest(
        'SHA-256',
        await new Blob(
          Object.values(tile).filter(ArrayBuffer.isView),
        ).arrayBuffer(),
      );
      return {
        center: f.center,
        generated: f.stats.generated,
        hits: f.stats.cacheHits,
        cacheSize: f.cache.size,
        cacheBytes: f.cache.bytes,
        cacheKeys: [...f.cache.entries.keys()],
        tiles: f.tiles.size,
        meshes: f.group.children.length,
        gameplay: a.state.world.chunks.size,
        hash: [...new Uint8Array(hash)]
          .map((x) => x.toString(16).padStart(2, '0'))
          .join(''),
        gl: g.renderer.getContext().getError(),
      };
    });
  }
  async function visit(q, y, r, lookY) {
    const timing = await page.evaluate(
      ({ q, y, r, lookY }) => {
        const a = window.__hexwild,
          start = performance.now();
        a.teleport(q, y, r);
        a.lookAt(q + 20, lookY, r);
        return { start, syncMs: performance.now() - start };
      },
      { q, y, r, lookY },
    );
    await ready();
    return {
      ...(await snapshot()),
      syncMs: timing.syncMs,
      settledMs: await page.evaluate(
        (start) => performance.now() - start,
        timing.start,
      ),
    };
  }
  await ready();
  const original = await snapshot();
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('original.png') });
  const cold = await visit(300, 45, 300, 18);
  expect(cold.generated - original.generated).toBe(169);
  expect(cold.cacheSize).toBe(169);
  expect(cold.cacheBytes).toBeLessThanOrEqual(10 * 1024 * 1024);

  // A cached tile stores source types, not UVs or geometry from the old atlas.
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) pixels.set([180, 90, 210, 255], 4 * i);
  const png = encode({ width: 32, height: 32, channels: 4, data: pixels });
  await page.locator('#material-pack-file').setInputFiles({
    name: 'cached-leaves-32.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'assets/minecraft/textures/block/jungle_leaves.png': png,
        'assets/minecraft/textures/block/oak_leaves.png': png,
      }),
    ),
  });
  await expect(page.locator('#material-pack-status')).toContainText('32×');
  await ready();
  const beforeReturn = await snapshot(),
    returned = await visit(-177.5, 43, 54.5, 33);
  expect(returned.generated - beforeReturn.generated).toBe(0);
  expect(returned.hits - beforeReturn.hits).toBe(169);
  expect(returned.hash).toBe(original.hash);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('cached-pack.png') });
  await page
    .locator('#material-pack-reset')
    .evaluate((button) => button.click());
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  await ready();
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('cached-default.png') });

  const beforeSecond = await snapshot(),
    second = await visit(300, 45, 300, 18);
  expect(second.generated - beforeSecond.generated).toBe(0);
  expect(second.hits - beforeSecond.hits).toBe(169);
  const affected = ['-2,1', '-3,1', '-2,0', '-3,0'];
  expect(affected.every((id) => second.cacheKeys.includes(id))).toBe(true);
  const beforeEdited = await snapshot();
  const editedTiming = await page.evaluate(() => {
    const a = window.__hexwild;
    if (a.state.world.loaded(-63, 33))
      throw Error('Edit must be outside gameplay residency');
    // Reproduce an input turn just after the previous edit batch. Crossing the
    // window must synchronize this edit before taking older cached data.
    a.graphics.distantTerrain.editClock = 0;
    const start = performance.now();
    a.state.world.set(-63, 60, 33, 'stone');
    a.graphics.updateBlock(-63, 60, 33);
    a.teleport(-177.5, 43, 54.5);
    a.lookAt(-157.5, 33, 54.5);
    return { start, syncMs: performance.now() - start };
  });
  await ready();
  const edited = {
    ...(await snapshot()),
    syncMs: editedTiming.syncMs,
    settledMs: await page.evaluate(
      (start) => performance.now() - start,
      editedTiming.start,
    ),
  };
  expect(edited.generated - beforeEdited.generated).toBe(4);
  expect(edited.hits - beforeEdited.hits).toBe(165);
  expect(
    await page.evaluate(async () => {
      const f = window.__hexwild.graphics.distantTerrain,
        { DISTANT_TYPES } = await import('/src/distant-field.js');
      // This is the rendered core, not just the neighbour's forward halo.
      return DISTANT_TYPES[f.tiles.get('-3,0').tile.types[88]];
    }),
  ).toBe('stone');
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('cached-edited.png') });
  for (const s of [original, cold, returned, second, edited]) {
    expect(s.tiles).toBe(169);
    expect(s.meshes).toBe(169);
    expect(s.gameplay).toBe(529);
    expect(s.gl).toBe(0);
    expect(s.cacheSize).toBeLessThanOrEqual(169);
    expect(s.cacheBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
  }
  const other = referenceSave(scene);
  other.seed = 625;
  other.time = 120;
  await page.locator('#save-file').setInputFiles({
    name: 'other-world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(other)),
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = window.__hexwild,
            f = a.graphics.distantTerrain;
          return (
            a.state.world.seed === 625 &&
            f.world.seed === 625 &&
            f.cache.size === 0 &&
            f.cache.bytes === 0 &&
            f.stats.cacheHits === 0
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await writeFile(
    info.outputPath('cache.json'),
    JSON.stringify(
      { original, cold, returned, second, edited, messages },
      null,
      2,
    ),
  );
  expect(messages).toEqual([]);
});
