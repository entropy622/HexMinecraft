import { writeFile } from 'node:fs/promises';

// Profiling happens after the uninterrupted gameplay window. Locate the live
// Graphics instance through a one-shot local DevTools breakpoint. The served
// production bundle and normal game entry point are identical for both runs.
export async function observeGraphics(page, cdp) {
  const url = await page
    .locator('script[type=module][src]')
    .first()
    .getAttribute('src');
  const scriptUrl = new URL(url, page.url()).href;
  const source = await (await page.request.get(scriptUrl)).text();
  const offset = source.indexOf('this.distantTerrain.frame(');
  if (offset < 0)
    throw Error('Cannot locate Graphics.frame in production bundle');
  const lines = source.slice(0, offset).split('\n');
  await cdp.send('Debugger.enable');
  const captured = new Promise((resolve, reject) =>
    cdp.once('Debugger.paused', async ({ callFrames }) => {
      try {
        await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: callFrames[0].callFrameId,
          expression: 'window.__frameProfileGraphics=this',
        });
        await cdp.send('Debugger.disable');
        resolve();
      } catch (e) {
        reject(e);
      }
    }),
  );
  await cdp.send('Debugger.setBreakpointByUrl', {
    url: scriptUrl,
    lineNumber: lines.length - 1,
    columnNumber: lines.at(-1).length,
  });
  await captured;
}
export async function profileGame(page, cdp, name, output) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const stats = await page.evaluate(async (travel) => {
    const g = window.__frameProfileGraphics,
      gl = g.renderer.getContext(),
      ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const cpu = {},
      gpu = {},
      pending = [],
      startPos = g.camera.position.toArray();
    const record = (o, n, v) => (o[n] ??= []).push(v);
    function wrap(object, method, label, timedGpu = false) {
      if (!object || !object[method]) return;
      const original = object[method];
      object[method] = function (...args) {
        const n = typeof label === 'function' ? label(...args) : label;
        const query =
          timedGpu &&
          ext &&
          !gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
            ? gl.createQuery()
            : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const t = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          record(cpu, n, performance.now() - t);
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            pending.push([n, query]);
          }
        }
      };
    }
    const frame = g.composer.passes[0];
    wrap(
      frame.beauty,
      'render',
      (_r, _w, t) => (t === frame.target ? 'main scene' : 'water scene'),
      true,
    );
    wrap(
      frame.clouds,
      'render',
      (_r, t) => (t === frame.target ? 'main clouds' : 'water clouds'),
      true,
    );
    for (const stage of g.composer.pipeline.stages.slice(1))
      wrap(stage.pass, 'render', stage.id, true);
    for (const [obj, key, label] of [
      [g, 'sync', 'mesh residency'],
      [g, 'streamFrame', 'near queue'],
      [g, 'buildChunk', 'immediate mesh'],
      [g, 'meshStep', 'mesh step'],
      [g, 'relightStep', 'mesh relight'],
      [g.nearStream, 'step', 'chunk stream'],
      [g.world, 'generateChunk', 'chunk generation'],
      [g.world, 'finishChunk', 'chunk install'],
      [g.world, 'unloadChunk', 'chunk eviction'],
      [g.voxelLight, 'update', 'synchronous light'],
      [g.voxelLight, 'relight', 'vertex lighting'],
      [g.world.leafDecay, 'update', 'leaf decay'],
      [g.distantTerrain, 'frame', 'distant updates'],
      [Storage.prototype, 'setItem', 'storage write'],
    ])
      wrap(obj, key, label);
    let disjoint = 0;
    if (travel)
      document
        .querySelector('#world')
        .dispatchEvent(
          new KeyboardEvent('keydown', {
            code: 'KeyW',
            key: 'w',
            bubbles: true,
          }),
        );
    const start = performance.now();
    while (performance.now() - start < 12000) {
      await new Promise(requestAnimationFrame);
      const invalid = ext && gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (invalid) disjoint++;
      while (
        pending.length &&
        (invalid ||
          gl.getQueryParameter(pending[0][1], gl.QUERY_RESULT_AVAILABLE))
      ) {
        const [n, q] = pending.shift();
        if (!invalid)
          record(gpu, n, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
    }
    if (travel)
      document
        .querySelector('#world')
        .dispatchEvent(
          new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }),
        );
    return {
      cpu,
      gpu,
      disjoint,
      startPos,
      endPos: g.camera.position.toArray(),
    };
  }, name === 'travel');
  const { profile } = await cdp.send('Profiler.stop');
  await writeFile(output + '/' + name + '.cpuprofile', JSON.stringify(profile));
  await writeFile(output + '/' + name + '-passes.json', JSON.stringify(stats));
}
