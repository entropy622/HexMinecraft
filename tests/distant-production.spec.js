import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { distantArchitectureSave } from './fixtures/distant-architecture-save.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('shipped distant terrain reaches the GPU and preserves a native v16 world through real controls', async ({
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
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    window.__distantDevice = { ready: false };
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = get.apply(this, args);
      if (
        this.id === 'world' &&
        args[0] === 'webgl2' &&
        gl &&
        !gl.__distantObserved
      ) {
        gl.__distantObserved = true;
        const locations = new WeakMap(),
          location = gl.getUniformLocation.bind(gl),
          scalar = gl.uniform1f.bind(gl);
        gl.getUniformLocation = (program, name) => {
          const result = location(program, name);
          if (result) locations.set(result, name);
          return result;
        };
        gl.uniform1f = (loc, value) => {
          if (locations.get(loc) === 'airDistantBlend' && value === 1)
            window.__distantDevice.ready = true;
          return scalar(loc, value);
        };
      }
      return gl;
    };
  });
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.__hexwild)).toBe('undefined');
  await page.evaluate(() => {
    const hud = document.querySelector('#hud'),
      observer = new MutationObserver(() => {
        if (hud.classList.contains('hidden')) return;
        observer.disconnect();
        for (const type of ['keydown', 'keyup'])
          document.body.dispatchEvent(
            new KeyboardEvent(type, {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
            }),
          );
      });
    observer.observe(hud, { attributes: true, attributeFilter: ['class'] });
  });
  const input = distantArchitectureSave();
  await page.locator('#save-file').setInputFiles({
    name: 'distant-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(input)),
  });
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__distantDevice.ready), {
      timeout: 240000,
    })
    .toBe(true);
  await page.evaluate(() => window.__photonProbe.start(80));
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.done), {
      timeout: 120000,
    })
    .toBe(true);
  const timing = await page.evaluate(() => window.__photonProbe.result());
  expect(timing.disjointEvents).toBe(0);
  expect(
    await page.evaluate(() =>
      document.querySelector('#world').getContext('webgl2').getError(),
    ),
  ).toBe(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const path = info.outputPath('distant-v16.json');
  await download.saveAs(path);
  const output = JSON.parse(await readFile(path, 'utf8'));
  expect(output.version).toBe(16);
  expect(output.time).toBe(input.time);
  expect(output.position).toEqual(input.position);
  expect(output.weather).toEqual(input.weather);
  expect(output.inventory).toEqual(input.inventory);
  expect(output.dimensions.overworld.edits).toEqual(
    input.dimensions.overworld.edits,
  );
  expect(output.dimensions.overworld.blockStates).toEqual(
    input.dimensions.overworld.blockStates,
  );
  expect(output.dimensions.overworld.fluids).toEqual(
    input.dimensions.overworld.fluids,
  );
  expect(await page.evaluate(() => typeof window.__hexwild)).toBe('undefined');
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await page.screenshot({ path: info.outputPath('production-controls.png') });
  await writeFile(
    info.outputPath('production.json'),
    JSON.stringify({ timing, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
