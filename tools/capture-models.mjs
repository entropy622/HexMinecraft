import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const server = process.env.MODEL_URL
  ? null
  : await createServer({
      server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false },
    });
await server?.listen();
const b = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const p = await b.newPage({ viewport: { width: 780, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => {
    console.error(e);
    errors.push(e.message);
  });
  await p.goto(
    (process.env.MODEL_URL || 'http://127.0.0.1:5198') +
      '/tools/model-studio.html',
  );
  await p.waitForFunction(() => window.studio, null, { timeout: 60000 });
  await p.addStyleTag({ content: 'aside,nav{display:none}' });
  await mkdir('docs/media/field-models', { recursive: true });
  for (let [id, angle, file] of [
    ['dragon', 0, 'front'],
    ['dragon', 0.59, 'quarter'],
    ['dragon', 1.57, 'profile'],
    ['dragon', Math.PI, 'back'],
    ['cow', 2.53, 'cow'],
    ['pig', 2.6, 'pig'],
    ['sheep', 2.57, 'sheep'],
    ['chicken', 2.55, 'chicken'],
    ['merchant', 2.82, 'merchant'],
    ['smith', 2.7, 'smith'],
    ['farmer', 2.75, 'farmer'],
    ['fisher', 2.65, 'fisher'],
  ]) {
    if (process.env.MODEL_DRAGON_ONLY && id !== 'dragon') continue;
    await p.evaluate(
      ([id, a]) => {
        studio.freeze();
        studio.select(id);
        studio.orient(a);
        studio.step(0.03);
      },
      [id, angle],
    );
    await p.screenshot({ path: 'docs/media/field-models/' + file + '.png' });
  }
  const expressionDir = 'test-results/dragon-expressions';
  await mkdir(expressionDir, { recursive: true });
  for (const state of ['calm', 'curious', 'focus', 'surprise']) {
    await p.evaluate((state) => {
      studio.strike(0);
      studio.hurt(Infinity);
      studio.select('dragon', state === 'curious');
      studio.freeze();
      studio.orient(0.14);
      const camera = studio.camera;
      // Keep a fixed crop of the head while the authored pose changes.
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        innerWidth * 0.28,
        innerHeight * 0.105,
        innerWidth * 0.42,
        innerHeight * 0.42,
      );
      if (state === 'focus') studio.strike(0.93);
      if (state === 'surprise') studio.hurt(0.15);
      studio.step(0.08);
    }, state);
    await p.screenshot({ path: expressionDir + '/' + state + '.png' });
    await p.evaluate(() => {
      studio.camera.clearViewOffset();
      studio.strike(0);
      studio.hurt(Infinity);
    });
  }
  if (process.env.MODEL_TURNTABLE) {
    await mkdir('test-results/dragon-turntable', { recursive: true });
    await p.setViewportSize({ width: 640, height: 720 });
    await p.evaluate(() => {
      studio.select('dragon');
      studio.freeze();
    });
    for (let i = 0; i < 108; i++) {
      const pixels = await p.evaluate((i) => {
        const a =
          i < 20
            ? 0.11
            : i < 82
              ? 0.11 + ((i - 20) / 62) * Math.PI * 2
              : 0.11 + Math.PI * 2;
        studio.orient(a);
        studio.walk(i >= 22 && i < 80);
        studio.strike(i >= 84 && i <= 97 ? (i - 84) / 13 : 0);
        studio.step(1 / 18);
        return studio.renderer.domElement.toDataURL('image/png').split(',')[1];
      }, i);
      await writeFile(
        'test-results/dragon-turntable/' + String(i).padStart(3, '0') + '.png',
        Buffer.from(pixels, 'base64'),
      );
    }
  }
  if (errors.length) throw Error(errors.join('; '));
} finally {
  await b.close();
  await server?.close();
}
