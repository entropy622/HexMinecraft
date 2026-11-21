// Run against a locally served production build. A separate fullscreen browser
// profile keeps real saves and desktop pointer confinement out of the measurement.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  referenceSave,
  referenceSettings,
} from '../tests/fixtures/photon-reference-scenes.js';
import { installFrameProbe } from '../tests/fixtures/photon-frame-probe.js';
import { monitorForeground } from './local-frame-foreground.mjs';
import { observeGraphics, profileGame } from './local-frame-profile.mjs';
const [url, output, ...only] = process.argv.slice(2);
if (!url || !output)
  throw Error(
    'Usage: node tools/local-frame-budget.mjs URL OUTPUT_DIR [forest shore travel]',
  );
await mkdir(output, { recursive: true });
const scenes = {
  forest: { eye: [-120, 33, 4], look: [-70, 19, -9] },
  shore: { eye: [-128, 7.5, 2], look: [-126, 5.5, -1] },
  travel: { eye: [-120, 39, 4], look: [-70, 35, -9] },
};
for (const name of only.length ? only : Object.keys(scenes)) {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: [
      '--start-fullscreen',
      '--force-device-scale-factor=1',
      '--force_high_performance_gpu',
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--enable-webgl-developer-extensions',
    ],
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
  });
  let monitor;
  try {
    const page = await browser.newPage({ viewport: null });
    page.setDefaultTimeout(240000);
    const errors = [];
    page.on('crash', () => console.error(name, 'renderer crashed'));
    page.on('console', (m) => {
      if (m.type() === 'error' && /shader|webgl|worker/i.test(m.text())) {
        errors.push(m.text().slice(0, 500));
        console.error(name, errors.at(-1));
      }
    });
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.error(name, e.message);
    });
    await page.addInitScript(installFrameProbe);
    await page.addInitScript((settings) => {
      localStorage.setItem('hexwild-settings', JSON.stringify(settings));
      let locked;
      Object.defineProperty(document, 'pointerLockElement', {
        get: () => locked,
      });
      Element.prototype.requestPointerLock = async function () {
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
      document.exitPointerLock = () => {
        if (locked) {
          locked = null;
          document.dispatchEvent(new Event('pointerlockchange'));
        }
      };
    }, referenceSettings);
    await page.route('https://fonts.googleapis.com/**', (r) =>
      r.fulfill({ body: '', contentType: 'text/css' }),
    );
    await page.bringToFront();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const browserCDP = await browser.newBrowserCDPSession();
    const { processInfo } = await browserCDP.send('SystemInfo.getProcessInfo');
    const browserPid = processInfo.find((p) => p.type === 'browser').id;
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'fullscreen' },
    });
    // Edge occasionally reserves a one-pixel fullscreen activation strip.
    // Pin the CSS viewport to the verified physical display on every run.
    const screenSize = await page.evaluate(() => [screen.width, screen.height]);
    if (String(screenSize) !== '2560,1600')
      throw Error('Unexpected screen ' + screenSize);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 2560,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(
      () =>
        typeof document.querySelector('#save-file')?.onchange === 'function',
    );
    const save = referenceSave(scenes[name]);
    save.time = 105;
    console.log(name, 'importing');
    await page
      .locator('#save-file')
      .setInputFiles({
        name: 'scene.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
    console.log(
      name,
      await page.evaluate(() => ({
        toast: document.querySelector('#toast')?.textContent,
        hud: document.querySelector('#hud')?.className,
        focus: document.hasFocus(),
        size: [innerWidth, innerHeight],
        locked: !!document.pointerLockElement,
      })),
    );
    await page.waitForFunction(
      () =>
        !!document.pointerLockElement &&
        !document.querySelector('#hud').classList.contains('hidden'),
    );
    const device = await page.evaluate(() => {
      const gl = document.querySelector('#world').getContext('webgl2');
      return {
        renderer: gl.getParameter(
          gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL,
        ),
        width: innerWidth,
        height: innerHeight,
        focus: document.hasFocus(),
        dpr: devicePixelRatio,
      };
    });
    console.log(name, device, 'warming');
    if (
      !/4060/.test(device.renderer) ||
      device.width !== 2560 ||
      device.height !== 1600 ||
      !device.focus
    )
      throw Error(
        'Invalid hardware or fullscreen window ' + JSON.stringify(device),
      );
    await observeGraphics(page, cdp);
    monitor = await monitorForeground(browserPid);
    const probeStart = await page.evaluate(() => window.__photonProbe.rendered);
    await page.waitForTimeout(30000);
    await page.waitForFunction(
      (n) => window.__photonProbe.rendered >= n + 60,
      probeStart,
    );
    if (!monitor.valid)
      throw Error('Browser lost the Windows foreground during warmup');
    console.log(name, 'sampling');
    const result = await page.evaluate(async (name) => {
      const probe = window.__photonProbe,
        canvas = document.querySelector('#world');
      const sizes = {},
        key = (type) =>
          document
            .querySelector('#world')
            .dispatchEvent(
              new KeyboardEvent(type, {
                code: 'KeyW',
                key: 'w',
                bubbles: true,
              }),
            );
      const startPosition =
        window.__frameProfileGraphics.camera.position.toArray();
      let start = performance.now(),
        last = 0,
        foreground = true,
        playing = true;
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        const angle =
          name === 'forest' ? Math.round(180 * Math.sin(t * 0.28)) : 0;
        if (angle !== last)
          document.dispatchEvent(
            new MouseEvent('mousemove', {
              movementX: angle - last,
              bubbles: true,
            }),
          );
        last = angle;
        const size = canvas.width + 'x' + canvas.height;
        sizes[size] = (sizes[size] || 0) + 1;
        foreground &&= document.hasFocus() && !document.hidden;
        playing &&= !!document.pointerLockElement;
      };
      if (name === 'travel') key('keydown');
      probe.start(Number.MAX_SAFE_INTEGER, 8);
      tick();
      const clock = setInterval(tick, 100);
      await new Promise((r) => setTimeout(r, 60000));
      clearInterval(clock);
      if (name === 'travel') key('keyup');
      const elapsedMs = performance.now() - start;
      probe.stop();
      return {
        ...probe.result(),
        elapsedMs,
        sizes,
        foreground,
        playing,
        startPosition,
        endPosition: window.__frameProfileGraphics.camera.position.toArray(),
      };
    }, name);
    if (!monitor.valid || !result.foreground || !result.playing)
      throw Error('Sampling window lost focus or paused');
    const dist = (arr) => {
      arr.sort((a, b) => a - b);
      return [0.5, 0.95, 0.99].map(
        (q) => arr[Math.floor((arr.length - 1) * q)] ?? null,
      );
    };
    const intervals = result.samples
      .map((s) => s.frameIntervalMs)
      .filter((v) => v > 0);
    const distance = Math.hypot(
      ...result.endPosition.map((n, i) => n - result.startPosition[i]),
    );
    if (name === 'travel' ? distance < 16 : distance > 2)
      throw Error(
        'Camera did not follow the requested route, displacement ' + distance,
      );
    if (!result.gpu.length || result.disjointEvents || errors.length)
      throw Error('Invalid GPU timing or application errors');
    monitor.stop();
    monitor = null;
    const lastSave = await page.evaluate(() => {
      const current = localStorage.getItem('hexwild-selected-world');
      return current
        ? JSON.parse(localStorage.getItem(current)).position
        : null;
    });
    const summary = {
      name,
      device,
      startPosition: result.startPosition,
      endPosition: result.endPosition,
      lastAutosavePosition: lastSave,
      elapsedMs: result.elapsedMs,
      frames: result.samples.length,
      fps: (result.samples.length * 1000) / result.elapsedMs,
      intervals: dist(intervals),
      cpu: dist(result.samples.map((s) => s.cpuSubmitMs)),
      gpu: dist(result.gpu.map((s) => s.milliseconds)),
      gpuSamples: result.gpu.length,
      disjoint: result.disjointEvents,
      sizes: result.sizes,
      errors,
    };
    await writeFile(
      output + '/' + name + '.json',
      JSON.stringify({ summary, result }),
    );
    console.log(JSON.stringify(summary));
    if (name === 'shore')
      await page.screenshot({ path: output + '/shore.png', timeout: 120000 });
    if (process.env.HEX_FRAME_PROFILE)
      await profileGame(page, cdp, name, output);
    if (name === 'shore') {
      const site = await page.evaluate(() => {
        const g = window.__frameProfileGraphics,
          w = g.world,
          p = g.camera.position;
        let nearest = Infinity,
          found;
        for (const cells of w.fluids.chunks.values())
          for (const [k, f] of cells) {
            if (f.type !== 'water') continue;
            const [q, y, r] = k.split(',').map(Number),
              x = Math.sqrt(3) * (q + r / 2),
              z = 1.5 * r;
            const distance = Math.hypot(x - p.x, z - p.z);
            if (
              distance >= nearest ||
              !w.fluids.get(q, y - 1, r) ||
              w.fluids.get(q, y + 1, r)
            )
              continue;
            nearest = distance;
            found = [x, y + 0.48, z];
          }
        if (found) p.fromArray(found);
        return found;
      });
      if (!site) throw Error('Underwater verification site unavailable');
      await page.waitForFunction(
        () => window.__frameProfileGraphics.fluidRenderer.medium === 'water',
      );
      await page.waitForTimeout(800);
      await page.screenshot({
        path: output + '/underwater.png',
        timeout: 120000,
      });
    }
    if (errors.length) throw Error(errors.join(' / '));
  } finally {
    monitor?.stop();
    await browser.close();
  }
}
