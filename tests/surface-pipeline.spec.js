import { test, expect } from './browser-fixture.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { daylightSave } from './fixtures/photon-daylight-scenes.js';
import { wetGallery } from './fixtures/wet-gallery.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

for (const [id, makeSave] of [
  ['forest', daylightSave],
  ['wet-gallery', wetGallery],
])
  test(`surface pipeline preserves native ${id} HDR and material records`, async ({
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
      {
        ...referenceSettings,
        post: {
          ...referenceSettings.post,
          antialias: false,
          sharpening: false,
        },
      },
    );
    await page.goto('/');
    await page.evaluate(() => (window.__photonFreeze = true));
    await page.locator('#save-file').setInputFiles({
      name: id + '.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(makeSave())),
    });
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('F1');
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = window.__hexwild.graphics;
            return (
              g.distantTerrain.ready &&
              g.distantTerrain.tiles.size === 169 &&
              !g.distantTerrain.error &&
              !g.relightQueue.size &&
              !g.skyEnvironment.atmosphere.pending
            );
          }),
        { timeout: 300000 },
      )
      .toBe(true);
    const start = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThan(start + 80);
    const result = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        r = g.renderer,
        f = g.composer.passes[0],
        p = g.composer.effects.protection,
        previous = r.getRenderTarget(),
        volumetric = g.cloudSystem.uniforms.cloudVolumetric.value;
      const buffers = [];
      try {
        // Freeze only stochastic cloud colour in this raw-material comparison;
        // native sky, cloud shadows, geometry, light and wind remain present.
        g.cloudSystem.uniforms.cloudVolumetric.value = 0;
        r.shadowMap.needsUpdate = true;
        f.render(r, g.composer.writeBuffer, g.composer.readBuffer);
        p.render(r);
        for (const [name, target, type] of [
          ['main', f.target, 'half'],
          ...(g.fluidRenderer.waterUniforms.waterSceneReady.value
            ? [['water', f.opaque, 'half']]
            : []),
          ['surface', p.target, 'byte'],
        ]) {
          for (let a = 0; a < target.textures.length; a++) {
            const data =
              type === 'half'
                ? new Uint16Array(target.width * target.height * 4)
                : new Uint8Array(target.width * target.height * 4);
            r.readRenderTargetPixels(
              target,
              0,
              0,
              target.width,
              target.height,
              data,
              0,
              a,
            );
            buffers.push({
              name: name + '-' + a,
              type,
              width: target.width,
              height: target.height,
              data: Array.from(data),
            });
          }
        }
        return {
          buffers,
          gl: r.getContext().getError(),
          time: window.__hexwild.state.time,
          renderedChunks: g.chunks.size,
          resources: r.info.memory,
        };
      } finally {
        g.cloudSystem.uniforms.cloudVolumetric.value = volumetric;
        r.setRenderTarget(previous);
      }
    });
    const root = process.env.SURFACE_REFACTOR_OUTPUT || info.outputDir;
    await mkdir(root, { recursive: true });
    for (const row of result.buffers) {
      const data =
        row.type === 'half'
          ? Uint16Array.from(row.data)
          : Uint8Array.from(row.data);
      await writeFile(
        join(root, id + '-' + row.name + '.bin'),
        Buffer.from(data.buffer),
      );
      if (process.env.SURFACE_REFACTOR_BASELINE) {
        const baseline = await readFile(
          join(
            process.env.SURFACE_REFACTOR_BASELINE,
            id + '-' + row.name + '.bin',
          ),
        );
        expect(
          Buffer.compare(Buffer.from(data.buffer), baseline),
          id + '/' + row.name + ' raw parity',
        ).toBe(0);
      }
      row.elements = data.length;
      delete row.data;
    }
    await writeFile(
      join(root, id + '.json'),
      JSON.stringify({ ...result, messages }, null, 2),
    );
    await page.locator('#world').screenshot({ path: join(root, id + '.png') });
    expect(result.gl).toBe(0);
    expect(result.renderedChunks).toBe(441);
    expect(messages).toEqual([]);
  });
