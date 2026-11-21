// Measure a one-frame luminance reversal while turning the camera around a fixed pose.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const packs = process.argv.slice(2);
if (!packs.length)
  throw Error('Pass the paths to the YSM ZIP files to compare.');
const server = await createServer({
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const pack of packs) {
    const bytes = await readFile(pack);
    const page = await browser.newPage({
      viewport: { width: 520, height: 690 },
    });
    await page.route('**/models/pearl-dragon-hy.zip', (r) =>
      r.fulfill({ body: bytes }),
    );
    await page.goto(
      'http://127.0.0.1:' +
        server.httpServer.address().port +
        '/tools/model-studio.html',
    );
    await page.waitForFunction(() => window.studio);
    const results = await page.evaluate(() => {
      const s = window.studio;
      s.freeze();
      s.select('dragon');
      s.step(0.16);
      const scene = s.root.parent;
      scene.background.set(0x181818);
      scene.fog = null;
      for (const o of scene.children)
        if (o.isMesh && o !== s.root) o.visible = false;
      const meshes = [];
      s.root.traverse((o) => {
        if (o.isMesh && o.visible) meshes.push(o);
      });
      const gl = s.renderer.getContext(),
        width = gl.drawingBufferWidth,
        height = gl.drawingBufferHeight;
      const rgba = new Uint8Array(width * height * 4);
      function capture(angle) {
        s.orient(angle);
        s.renderer.render(scene, s.camera);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const luma = new Uint8Array(width * height),
          mask = new Uint8Array(luma.length);
        for (let i = 0; i < luma.length; i++) {
          const j = i * 4;
          luma[i] =
            (19595 * rgba[j] +
              38470 * rgba[j + 1] +
              7471 * rgba[j + 2] +
              32768) >>>
            16;
          mask[i] = Math.abs(luma[i] - luma[0]) > 15;
        }
        // A two-pixel inset excludes moving silhouettes, not just the background.
        let inside = mask;
        for (let pass = 0; pass < 2; pass++) {
          const next = new Uint8Array(inside.length);
          for (let i = width + 1; i < inside.length - width - 1; i++)
            next[i] =
              inside[i] &
              inside[i - 1] &
              inside[i + 1] &
              inside[i - width] &
              inside[i + width];
          inside = next;
        }
        return { luma, inside };
      }
      const results = [];
      for (const [part, bones] of Object.entries({
        wings: /Wing$/,
        hair: /^(LongHair|LeftLock|RightLock)$/,
        cloth: /^(UpperBody|Skirt|LeftSkirt|RightSkirt)$/,
      })) {
        for (const mesh of meshes) mesh.visible = bones.test(mesh.parent.name);
        let eligible = 0,
          flashes = 0;
        const frames = [];
        for (let frame = 0; frame < 25; frame++) {
          frames.push(capture(2.75 + frame * 0.006));
          if (frames.length < 3) continue;
          const [a, b, c] = frames;
          for (let i = 0; i < b.luma.length; i++) {
            if (!(a.inside[i] && b.inside[i] && c.inside[i])) continue;
            eligible++;
            if (
              b.luma[i] >= Math.max(a.luma[i], c.luma[i]) + 12 ||
              b.luma[i] <= Math.min(a.luma[i], c.luma[i]) - 12
            )
              flashes++;
          }
          frames.shift();
        }
        results.push({
          part,
          flashes,
          eligible,
          percent: +((100 * flashes) / eligible).toFixed(4),
        });
      }
      return results;
    });
    console.log(pack);
    console.table(results);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
