import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('native forest retains its fixed camera and lighting while a planted oak grows the same connected, oriented branches', async ({
  page,
}, info) => {
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
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  async function settled() {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending &&
              g.voxelLight.revision === g.world.lightRevision
            );
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
  }
  const records = [];
  for (const [label, time, width, height] of [
    ['morning', 30, 900, 650],
    ['day', 120, 1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => {
      const a = window.__hexwild;
      a.step(t - a.state.time);
    }, time);
    await settled();
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    records.push(
      await page.evaluate((label) => {
        const a = window.__hexwild,
          g = a.graphics,
          gl = g.renderer.getContext(),
          ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          label,
          time: a.state.time,
          camera: g.camera.position.toArray(),
          exposure: g.renderer.toneMappingExposure,
          sun: g.skyEnvironment.atmosphere.directLight.toArray(),
          sh: g.skyEnvironment.atmosphere.probe.sh.toArray(),
          fog: [g.scene.fog.near, g.scene.fog.far],
          renderer: gl.getParameter(
            ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
          ),
          blocks: g.world.blocks.size,
          leaves: g.world.treeLeaves.size,
          logs: g.world.treeLogs.size,
          triangles: g.renderer.info.render.triangles,
          gl: gl.getError(),
        };
      }, label),
    );
  }
  expect(records[0].camera).toEqual(referenceSave(referenceScenes[0]).position);
  expect(records[1].camera).toEqual(records[0].camera);
  for (const row of records) {
    expect(row.exposure).toBe(1);
    expect(row.fog).toEqual([87.32, 118]);
    expect(row.gl).toBe(0);
    expect(row.renderer).not.toMatch(/swiftshader|software/i);
  }
  const growth = await page.evaluate(async () => {
    const a = window.__hexwild,
      w = a.state.world,
      g = a.graphics,
      { treeCells } = await import('/src/tree-layout.js'),
      cells = [],
      root = '-122,39,8';
    for (let q = -125; q <= -119; q++)
      for (let r = 5; r <= 11; r++)
        for (let y = 40; y <= 52; y++) {
          w.set(q, y, r, null);
          cells.push([q, y, r]);
        }
    w.set(-122, 39, 8, 'grass');
    cells.push([-122, 39, 8]);
    g.updateCells(cells);
    a.teleport(-122, 44, 16);
    a.lookAt(-122, 44, 8);
    a.give('sapling', 1);
    a.give('boneMeal', 1);
    a.selectItem('sapling');
    a.setTarget({ q: -122, y: 39, r: 8, type: 'grass' });
    a.setPlaying(true);
    a.interact();
    a.setPlaying(false);
    if (!a.state.crops.has(root)) throw Error('Sapling did not plant');
    a.selectItem('boneMeal');
    a.setTarget({ q: -122, y: 39, r: 8, type: 'grass', crop: root });
    a.setPlaying(true);
    a.interact();
    a.setPlaying(false);
    const expected = treeCells('oak', -122, 40, 8, w.seed);
    for (const [q, y, r, type, axis = 0] of expected) {
      if (w.get(q, y, r) !== type) throw Error('Grown cell mismatch');
      if (axis && w.state(q, y, r).axis !== axis)
        throw Error('Branch axis mismatch');
    }
    a.save();
    return {
      cropRemaining: a.state.crops.has(root),
      branchCount: expected.filter((c) => c[4]).length,
      save: JSON.parse(localStorage.getItem('hexwild-save-v16')),
    };
  });
  expect(growth.cropRemaining).toBe(false);
  expect(growth.branchCount).toBeGreaterThan(0);
  await settled();
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('grown-oak.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  await download.saveAs(info.outputPath('grown-tree-v16.json'));
  await writeFile(
    info.outputPath('tree-shape.json'),
    JSON.stringify({ records, growth, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
