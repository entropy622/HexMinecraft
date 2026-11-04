import { test, expect } from './browser-fixture.js';
import { materialCoverageScene } from './fixtures/material-coverage-scenes.js';
import { daylightSave } from './fixtures/photon-daylight-scenes.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import { writeFile } from 'node:fs/promises';

for (const kind of ['workshop', 'underground', 'forest'])
  test(`native material coverage in ${kind}`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
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
    await page.locator('#save-file').setInputFiles({
      name: kind + '.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify(
          kind === 'forest' ? daylightSave() : materialCoverageScene(kind),
        ),
      ),
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
      .toBeGreaterThan(start + 50);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(kind + '-after.png') });
    if (kind === 'workshop') {
      const audit = await page.evaluate(async () => {
        const { blockTextures, nativeMaterialCoverage } =
            await import('/src/texture-pack.js'),
          g = window.__hexwild.graphics,
          m = g.textures.materials,
          flags = m.uniforms.surfacePackFlags.value.image.data;
        const rows = nativeMaterialCoverage(blockTextures),
          c = document.createElement('canvas');
        c.width = 1152;
        c.height = Math.ceil(rows.length / 8) * 112;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#20252a';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingEnabled = false;
        ctx.font = '12px Microsoft YaHei';
        const report = rows.map((row, i) => {
          const faces = ['top', 'side'].map((face, n) => {
            const tile = m.tile(row.id + ':' + face),
              pixels = tile
                .getContext('2d')
                .getImageData(0, 0, tile.width, tile.height).data;
            const [u, v] = g.textures.uv(row.id + ':' + face, 0.5, 0.5),
              l = m.layout,
              index =
                Math.floor(((1 - v) * l.height) / l.cell) * 8 +
                Math.floor((u * l.width) / l.cell);
            let visible = 0;
            for (let p = 3; p < pixels.length; p += 4)
              visible += Number(pixels[p] > 0);
            ctx.drawImage(
              tile,
              (i % 8) * 144 + n * 64,
              Math.floor(i / 8) * 112,
              64,
              64,
            );
            return {
              face,
              visible,
              flags: [...flags.slice(index * 4, index * 4 + 4)],
            };
          });
          ctx.fillStyle = '#e7edf1';
          ctx.fillText(
            row.name,
            (i % 8) * 144,
            Math.floor(i / 8) * 112 + 82,
            140,
          );
          ctx.fillStyle = '#a9b8c0';
          ctx.fillText(
            row.id,
            (i % 8) * 144,
            Math.floor(i / 8) * 112 + 100,
            140,
          );
          return { ...row, faces };
        });
        return {
          rows: report,
          normalBytes: m.uniforms.surfacePackNormal.value.image.data.byteLength,
          gl: g.renderer.getContext().getError(),
          sheet: c.toDataURL('image/png'),
        };
      });
      await writeFile(
        info.outputPath('all-block-materials.png'),
        Buffer.from(audit.sheet.split(',')[1], 'base64'),
      );
      delete audit.sheet;
      await writeFile(
        info.outputPath('coverage.json'),
        JSON.stringify(audit, null, 2),
      );
      expect(audit.rows).toHaveLength(236);
      for (const row of audit.rows) {
        expect(row.route, row.id).toBeTruthy();
        for (const face of row.faces)
          expect(face.visible, row.id + '/' + face.face).toBeGreaterThan(0);
      }
      const metal = audit.rows.find((r) => r.id === 'ironBlock');
      expect(metal.faces[0].flags).toEqual([255, 0, 128, 0]);
      const wool = audit.rows.find((r) => r.id === 'redWool');
      expect(wool.faces[0].flags).toEqual([255, 0, 255, 0]);
      expect(audit.gl).toBe(0);
    }
    expect(
      await page.evaluate(() =>
        window.__hexwild.graphics.renderer.getContext().getError(),
      ),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
