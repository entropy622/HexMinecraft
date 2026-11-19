import { writeFile } from 'node:fs/promises';
import { test, expect } from './browser-fixture.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import {
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';

const duration = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    median: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
    max: sorted.at(-1),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
};
// Optional diagnostic window after the end-to-end sample. No clocks,
// materials or canvas sizes are changed while querying the actual GPU passes.
async function measureGpuPasses() {
  const g = window.__hexwild.graphics,
    gl = g.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext || !gl.getQuery(ext.TIME_ELAPSED_EXT, ext.QUERY_COUNTER_BITS_EXT))
    return null;
  const [scene, ...passes] = g.composer.passes;
  const pending = [],
    undo = [],
    times = {};
  const instrument = (pass, label) => {
    const render = pass.render;
    undo.push(() => {
      pass.render = render;
    });
    pass.render = function (...args) {
      const query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      try {
        return render.apply(this, args);
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push([query, label(...args)]);
      }
    };
  };
  instrument(scene.beauty, (_r, _write, target, select) => {
    if (select) {
      if (scene.beauty.clear) return 'shared opaque scene';
      return target === scene.opaque ? 'water capture tail' : 'main view tail';
    }
    return target === scene.opaque ? 'opaque water capture' : 'scene beauty';
  });
  instrument(scene.clouds, (_r, target) =>
    target === scene.opaque ? 'clouds in water capture' : 'clouds in main view',
  );
  for (const pass of passes) instrument(pass, () => pass.constructor.name);
  const frame = () => new Promise(requestAnimationFrame);
  try {
    for (let i = 0; i < 16; i++) await frame();
  } finally {
    for (const restore of undo) restore();
  }
  const deadline = performance.now() + 10000;
  while (pending.length && performance.now() < deadline) {
    await frame();
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const [query] of pending) gl.deleteQuery(query);
      return null;
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const [query, name] = pending[i];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
      (times[name] ||= []).push(
        gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
      );
      gl.deleteQuery(query);
      pending.splice(i, 1);
    }
  }
  for (const [query] of pending) gl.deleteQuery(query);
  return times;
}

test('lossless forest frame time', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(installFrameProbe);
  await page.addInitScript((s) => {
    if (location.origin !== 'null')
      localStorage.setItem('hexwild-settings', JSON.stringify(s));
  }, referenceSettings);
  await page.goto('/');
  await page.waitForFunction(() => window.__hexwild, null, { timeout: 150000 });
  const save = referenceSave({ eye: [-120, 33, 4], look: [-70, 19, -9] });
  save.time = 70;
  await page.evaluate((s) => {
    window.__hexwild.start(true, s);
    window.__photonFreeze = true;
  }, save);
  await page.waitForFunction(
    () => {
      const g = window.__hexwild.graphics;
      return (
        !g.queue.length &&
        g.distantTerrain.ready &&
        g.distantTerrain.tiles.size === 169 &&
        !g.relightQueue.size &&
        !g.skyEnvironment.atmosphere.pending &&
        g.atmosphere.uniforms.airDistantBlend.value === 1
      );
    },
    null,
    { timeout: 280000 },
  );
  await page.keyboard.press('F1');
  await page.evaluate(async () => {
    const probe = window.__photonProbe,
      end = probe.rendered + 18;
    while (probe.rendered < end) await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: info.outputPath('forest.png') });
  const cdp = process.env.HEX_PROFILE
    ? await page.context().newCDPSession(page)
    : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }
  const measured = await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      gl = g.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    window.__photonFreeze = false;
    api.setPlaying(true);
    const probe = window.__photonProbe;
    probe.start(72);
    while (!probe.done) await new Promise(requestAnimationFrame);
    return {
      ...probe.result(),
      adapter: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      framebuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      tiles: g.distantTerrain.tiles.size,
      vines: api.state.world.vineCells.size,
      shaderErrors: gl.getError(),
    };
  });
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.detach();
    await writeFile(info.outputPath('cpu.cpuprofile'), JSON.stringify(profile));
  }
  const { samples, gpu, ...environment } = measured;
  const interval = duration(samples.slice(1).map((s) => s.frameIntervalMs));
  const summary = {
    ...environment,
    interval,
    fps: 1000 / interval.mean,
    frameCpu: duration(samples.map((s) => s.cpuSubmitMs)),
    gpu: gpu.length ? duration(gpu.map((s) => s.milliseconds)) : null,
    draws: duration(samples.map((s) => s.draws)),
  };
  const passes = process.env.HEX_GPU_PASSES
    ? await page.evaluate(measureGpuPasses)
    : null;
  const gpuPasses =
    passes &&
    Object.fromEntries(
      Object.entries(passes).map(([name, samples]) => [
        name,
        { count: samples.length, ...duration(samples) },
      ]),
    );
  if (gpuPasses) console.log(JSON.stringify({ gpuPasses }));
  await writeFile(
    info.outputPath('forest.json'),
    JSON.stringify({ summary, samples, gpu, gpuPasses }, null, 2),
  );
  console.log(JSON.stringify(summary));
  expect(environment.shaderErrors).toBe(0);
  expect(errors).toEqual([]);
  await page.goto('about:blank', { waitUntil: 'commit' });
});
