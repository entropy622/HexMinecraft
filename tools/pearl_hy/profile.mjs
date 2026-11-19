import { chromium } from 'playwright';
import { createServer } from 'vite';
// Profile the player separately from chunk rebuilds, skies, postprocessing and vsync.
// A readback at each boundary waits for the submitted GPU work in both cases.
const s = await createServer({
  configFile: false,
  logLevel: 'error',
  server: { port: 0, host: '127.0.0.1', hmr: false },
});
await s.listen();
const b = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--use-gl=angle',
    '--disable-renderer-backgrounding',
  ],
  ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
});
try {
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p.goto(
    'http://127.0.0.1:' +
      s.httpServer.address().port +
      '/tools/model-studio.html',
  );
  await p.waitForFunction(() => window.studio);
  const result = await p.evaluate(() => {
    const s = studio;
    s.freeze();
    s.select('dragon');
    s.walk(true);
    s.orient(0.4);
    const gl = s.renderer.getContext(),
      pixel = new Uint8Array(4),
      fence = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel),
      samples = [[], []];
    for (let i = 0; i < 10; i++) {
      s.step(1 / 60);
      fence();
    }
    let info;
    for (let i = 0; i < 24; i++)
      for (const visible of i % 2 ? [true, false] : [false, true]) {
        s.root.visible = visible;
        const t = performance.now();
        for (let j = 0; j < 6; j++) s.step(1 / 60);
        fence();
        samples[+visible].push((performance.now() - t) / 6);
        if (visible)
          info = {
            calls: s.renderer.info.render.calls,
            triangles: s.renderer.info.render.triangles,
          };
      }
    s.root.visible = true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const stats = (a) => {
      a.sort((x, y) => x - y);
      return { medianMs: a[12], p90Ms: a[21] };
    };
    return {
      renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      empty: stats(samples[0]),
      visible: stats(samples[1]),
      studioIncludingFloor: info,
    };
  });
  console.log(JSON.stringify(result));
} finally {
  await b.close();
  await s.close();
}
