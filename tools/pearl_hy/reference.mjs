import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Compare both resting meshes in the game's units, camera and studio lighting.
// Inputs stay local; the heavy reference is never part of the game download.
const [source, out, pack = 'public/models/pearl-dragon-hy.zip'] =
  process.argv.slice(2);
if (!source || !out)
  throw Error('Usage: node reference.mjs source.glb output-dir [pack.zip]');
await mkdir(out, { recursive: true });
const s = await createServer({
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await s.listen();
const b = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const p = await b.newPage({ viewport: { width: 520, height: 690 } });
  const bytes = await readFile(pack);
  await p.route('**/models/pearl-dragon-hy.zip', (r) =>
    r.fulfill({ body: bytes }),
  );
  await p.route('**/__reference.glb', (r) =>
    r.fulfill({ path: path.resolve(source), contentType: 'model/gltf-binary' }),
  );
  await p.goto(
    'http://127.0.0.1:' +
      s.httpServer.address().port +
      '/tools/model-studio.html',
  );
  await p.waitForFunction(() => window.studio);
  await p.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js'),
      { GLTFLoader } =
        await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),
      { readYsm, makeSkeleton } = await import('/src/ysm-model.js');
    const s = studio;
    s.freeze();
    const scene = s.root.parent,
      asset = readYsm(
        new Uint8Array(
          await (await fetch('/models/pearl-dragon-hy.zip')).arrayBuffer(),
        ),
      );
    let material;
    s.root.traverse((o) => {
      if (o.isMesh && o.material.map) material = o.material;
    });
    const ysm = makeSkeleton(asset.geometry, material);
    ysm.scale.set(asset.width / 16, asset.height / 16, asset.width / 16);
    const hy = (await new GLTFLoader().loadAsync('/__reference.glb')).scene;
    hy.scale.setScalar(
      (34 * asset.height) / 16 / new T.Box3().setFromObject(hy).max.y,
    );
    hy.traverse((o) => {
      if (!o.isMesh) return;
      const m = material.clone();
      m.map = m.emissiveMap = o.material.map;
      o.material = m;
    });
    s.root.visible = false;
    scene.add(ysm, hy);
    window.capture = (angle, reference) => {
      hy.visible = reference;
      ysm.visible = !reference;
      s.orient(angle);
      s.renderer.render(scene, s.camera);
      return s.renderer.domElement.toDataURL('image/png').split(',')[1];
    };
  });
  for (const [name, a] of [
    ['front', 0],
    ['three-quarter', 0.63],
    ['side', Math.PI / 2],
    ['back', Math.PI],
  ]) {
    for (const ref of [true, false]) {
      const png = await p.evaluate(
        ([a, ref]) => window.capture(a, ref),
        [a, ref],
      );
      await writeFile(
        path.join(out, (ref ? 'hy' : 'ysm') + '-' + name + '.png'),
        Buffer.from(png, 'base64'),
      );
    }
  }
} finally {
  await b.close();
  await s.close();
}
