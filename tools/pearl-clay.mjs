// Compare silhouettes in a clean headless profile; keep the cutout alpha on the wings.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const base = '08e9427',
  dir = 'test-results/pearl-clay';
const previous = execFileSync('git', [
  'show',
  base + ':public/models/pearl-dragon.zip',
]);
const s = await createServer({
  server: { host: '127.0.0.1', port: 5205, strictPort: true, hmr: false },
});
await s.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await mkdir(dir, { recursive: true });
  for (const id of ['previous', 'current']) {
    const page = await browser.newPage({
      viewport: { width: 620, height: 780 },
    });
    if (id === 'previous')
      await page.route('**/models/pearl-dragon.zip', (route) =>
        route.fulfill({ contentType: 'application/zip', body: previous }),
      );
    await page.goto('http://127.0.0.1:5205/tools/model-studio.html');
    await page.waitForFunction(() => window.studio);
    await page.addStyleTag({ content: 'aside,nav{display:none}' });
    if (id === 'current') {
      const data = await page.evaluate(async () => {
        const file = await studio.glb();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
      });
      await writeFile(
        'art/models/pearl-dragon.glb',
        Buffer.from(data, 'base64'),
      );
    }
    await page.evaluate(() => {
      studio.freeze();
      studio.select('dragon');
      studio.orient(0.48);
      const lights = studio.root.parent.children.filter((o) => o.isLight);
      const [hemi, key, rim] = lights;
      hemi.intensity = 0.63;
      key.position.set(-3.5, 4.2, 3.3);
      key.intensity = 2.9;
      rim.intensity = 0.75;
      const mats = new Set();
      studio.root.traverse((o) => {
        if (o.isMesh) mats.add(o.material);
      });
      for (const m of mats) {
        m.emissive?.set(0);
        m.emissiveMap = null;
        m.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            '#include <map_fragment>\ndiffuseColor.rgb = vec3(0.47, 0.44, 0.49);',
          );
        };
        m.needsUpdate = true;
      }
      studio.step(0.03);
    });
    await page.screenshot({ path: dir + '/' + id + '.png' });
    await page.evaluate(() => {
      studio.orient(2.58);
      studio.step(0);
    });
    await page.screenshot({ path: dir + '/' + id + '-back.png' });
    await page.close();
  }
} finally {
  await browser.close();
  await s.close();
}
