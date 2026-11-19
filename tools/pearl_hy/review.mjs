import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const out = process.argv[2] || 'test-results/pearl-hy';
await mkdir(out, { recursive: true });
const s = await createServer({
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await s.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 520, height: 690 } });
  const pack = process.argv.find((v) => v.startsWith('--pack='))?.slice(7);
  if (pack) {
    const bytes = await readFile(pack);
    await page.route('**/models/pearl-dragon-hy.zip', (r) =>
      r.fulfill({ body: bytes }),
    );
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    'http://127.0.0.1:' +
      s.httpServer.address().port +
      '/tools/model-studio.html',
  );
  await page.waitForFunction(() => window.studio);
  for (const [name, a, pose] of [
    ['front', 0, 'idle'],
    ['three-quarter', 0.63, 'idle'],
    ['side', Math.PI / 2, 'idle'],
    ['back', Math.PI, 'idle'],
    ['walk', 0.63, 'walk'],
    ['swing', 0.5, 'swing_hand'],
    ['face', 0.12, 'portrait'],
    ['surprise', 0.12, 'attacked'],
  ]) {
    const png = await page.evaluate(
      ([a, pose]) => {
        const s = window.studio;
        s.freeze();
        s.select('dragon');
        s.orient(a);
        s.walk(pose === 'walk');
        s.hurt(pose === 'attacked' ? 0.11 : Infinity);
        s.strike(pose === 'swing_hand' ? 0.3 : 0);
        if (['portrait', 'attacked'].includes(pose))
          s.camera.setViewOffset(
            innerWidth,
            innerHeight,
            innerWidth * 0.238,
            innerHeight * 0.17,
            innerWidth * 0.54,
            innerHeight * 0.4,
          );
        s.step(pose === 'walk' ? 0.38 : 0.16);
        const img = s.renderer.domElement.toDataURL('image/png');
        s.camera.clearViewOffset();
        return img.split(',')[1];
      },
      [a, pose],
    );
    await writeFile(path.join(out, name + '.png'), Buffer.from(png, 'base64'));
  }
  if (process.argv.includes('--motion')) {
    const dir = path.join(out, 'motion');
    await mkdir(dir, { recursive: true });
    await page.evaluate(() => {
      studio.camera.clearViewOffset();
      studio.select('dragon');
      studio.freeze();
    });
    for (let i = 0; i < 144; i++) {
      const jpg = await page.evaluate((i) => {
        const t = i / 24,
          f = Math.min(1, Math.max(0, (t - 0.6) / 4.35));
        studio.orient(0.12 + 2 * Math.PI * (f * f * (3 - 2 * f)));
        studio.walk(t > 1.5 && t < 4.85);
        studio.hurt(Infinity);
        studio.strike(t > 5.12 && t < 5.56 ? (t - 5.12) / 0.44 : 0);
        studio.step(1 / 24);
        return studio.renderer.domElement
          .toDataURL('image/jpeg', 0.96)
          .split(',')[1];
      }, i);
      await writeFile(
        path.join(dir, String(i).padStart(4, '0') + '.jpg'),
        Buffer.from(jpg, 'base64'),
      );
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
  await s.close();
}
