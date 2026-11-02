import { test, expect } from './browser-fixture.js';
import { writeFile } from 'node:fs/promises';
import { amethystScene } from './fixtures/amethyst-save.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';

test('native crystal faces retain pigment and local illumination inside a natural geode', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  const scene = amethystScene();
  await page.locator('#save-file').setInputFiles({
    name: 'geode-render-v16.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene.save)),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 180000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { DataUtils } =
        await import('/tests/fixtures/amethyst-render-probe.js'),
      g = window.__hexwild.graphics,
      r = g.renderer,
      original = g.material,
      copy = original.clone(),
      compile = original.onBeforeCompile,
      mode = { value: 0 },
      objects = [],
      previous = r.getRenderTarget();
    const frame = g.composer.passes[0],
      outlines = [g.outline, g.shapeOutline].map((object) => [
        object,
        object.visible,
      ]);
    for (const [object] of outlines) object.visible = false;
    const readBeauty = () => {
      frame.beauty.render(r, null, frame.target);
      const t = frame.target,
        raw = new Uint16Array(5 * 5 * 4);
      r.readRenderTargetPixels(
        t,
        Math.floor(t.width / 2) - 2,
        Math.floor(t.height / 2) - 2,
        5,
        5,
        raw,
      );
      return [0, 1, 2].map(
        (c) =>
          Array.from({ length: 25 }, (_, n) =>
            DataUtils.fromHalfFloat(raw[n * 4 + c]),
          ).reduce((s, v) => s + v, 0) / 25,
      );
    };
    const normalBeauty = readBeauty();
    copy.defaultAttributeValues = { ...original.defaultAttributeValues };
    copy.toneMapped = copy.fog = false;
    copy.onBeforeCompile = (shader, renderer) => {
      compile.call(copy, shader, renderer);
      shader.uniforms.crystalProbeMode = mode;
      shader.fragmentShader =
        'uniform int crystalProbeMode;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
        #include <opaque_fragment>
        if(crystalProbeMode==1)gl_FragColor.rgb=diffuseColor.rgb;
        if(crystalProbeMode==2)gl_FragColor.rgb=vec3(vAmbientOcclusion);
        if(crystalProbeMode==3)gl_FragColor.rgb=surfaceBlockLevel;
        if(crystalProbeMode==4)gl_FragColor.rgb=reflectedLight.indirectDiffuse+reflectedLight.directDiffuse;
      `,
        );
    };
    copy.customProgramCacheKey = () =>
      original.customProgramCacheKey() + '-crystal-probe';
    g.scene.traverse((m) => {
      if (m.material === original) {
        objects.push(m);
        m.material = copy;
      }
    });
    const values = {};
    try {
      for (const [i, name] of [
        'beauty',
        'pigment',
        'ao',
        'light',
        'diffuse',
      ].entries()) {
        mode.value = i;
        frame.beauty.render(r, null, frame.target);
        const t = frame.target,
          raw = new Uint16Array(5 * 5 * 4);
        r.readRenderTargetPixels(
          t,
          Math.floor(t.width / 2) - 2,
          Math.floor(t.height / 2) - 2,
          5,
          5,
          raw,
        );
        values[name] = [0, 1, 2].map(
          (c) =>
            Array.from({ length: 25 }, (_, n) =>
              DataUtils.fromHalfFloat(raw[n * 4 + c]),
            ).reduce((n, v) => n + v, 0) / 25,
        );
      }
      return {
        values,
        normalBeauty,
        gl: r.getContext().getError(),
      };
    } finally {
      for (const m of objects) m.material = original;
      for (const [object, visible] of outlines) object.visible = visible;
      r.setRenderTarget(previous);
      copy.dispose();
    }
  });
  await writeFile(
    info.outputPath('crystal-material.json'),
    JSON.stringify({ result, messages }, null, 2),
  );
  expect(result.values.pigment[2]).toBeGreaterThan(0.1);
  expect(result.values.ao[0]).toBeGreaterThan(0.9);
  expect(result.normalBeauty[2]).toBeGreaterThan(0.02);
  expect(Math.max(...result.values.beauty)).toBeGreaterThan(0.01);
  expect(result.gl).toBe(0);
  expect(messages).toEqual([]);
});
test('native tinted-glass roofs keep the view transparent while leaving a sealed room dark', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ body: '', contentType: 'text/css' }),
  );
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.locator('#creative').click();
  await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      { hexDistance } = await import('/src/core.js');
    api.setPlaying(false);
    api.step(120 - api.state.time);
    g.setPostOptions({
      clouds: false,
      exposure: false,
      occlusion: 0,
      bloom: 0,
    });
    const cells = [];
    for (const [i, type] of ['stone', 'tintedGlass', 'glass'].entries()) {
      const root = -6 + i * 6;
      for (let q = root - 2; q <= root + 2; q++)
        for (let r = -2; r <= 2; r++) {
          const d = hexDistance(q - root, r);
          if (d > 2) continue;
          for (let y = 46; y <= 52; y++) {
            const block =
              y === 46
                ? 'calcite'
                : y === 50
                  ? type
                  : y < 50 && d === 2
                    ? 'stone'
                    : null;
            w.set(q, y, r, block);
            cells.push([q, y, r]);
          }
        }
    }
    g.updateCells(cells);
    g.updateVoxelLight(true);
  });
  await expect
    .poll(
      () => page.evaluate(() => !window.__hexwild.graphics.relightQueue.size),
      { timeout: 180000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { DataUtils, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } =
        await import('/tests/fixtures/amethyst-render-probe.js'),
      { axialToWorld } = await import('/src/core.js');
    const g = window.__hexwild.graphics,
      r = g.renderer,
      frame = g.composer.passes[0],
      camera = g.camera,
      previous = r.getRenderTarget();
    const saved = {
      position: camera.position.clone(),
      rotation: camera.rotation.clone(),
      fov: camera.fov,
    };
    const marker = new Mesh(
      new BoxGeometry(0.8, 0.4, 0.8),
      new MeshBasicMaterial({ color: '#ff00ff' }),
    );
    g.scene.add(marker);
    const read = () => {
        frame.beauty.render(r, null, frame.target);
        const t = frame.target,
          raw = new Uint16Array(5 * 5 * 4);
        r.readRenderTargetPixels(
          t,
          Math.floor(t.width / 2) - 2,
          Math.floor(t.height / 2) - 2,
          5,
          5,
          raw,
        );
        return [0, 1, 2].map(
          (c) =>
            Array.from({ length: 25 }, (_, n) =>
              DataUtils.fromHalfFloat(raw[n * 4 + c]),
            ).reduce((n, v) => n + v, 0) / 25,
        );
      },
      rooms = [];
    try {
      camera.fov = 72;
      camera.updateProjectionMatrix();
      for (const [i, type] of ['stone', 'tintedGlass', 'glass'].entries()) {
        const p = axialToWorld(-6 + i * 6, 0);
        camera.position.set(p.x, 48.4, p.z);
        camera.up.set(0, 0, -1);
        camera.lookAt(new Vector3(p.x, 46, p.z));
        camera.updateMatrixWorld();
        marker.visible = false;
        const floor = read(),
          index = g.voxelLight.index(-6 + i * 6, 48, 0),
          sky = g.voxelLight.sky[index];
        camera.lookAt(new Vector3(p.x, 52, p.z));
        camera.updateMatrixWorld();
        marker.position.set(p.x, 51.8, p.z);
        marker.visible = true;
        const through = read();
        marker.visible = false;
        const without = read();
        rooms.push({
          type,
          floor,
          sky,
          through,
          without,
          visibility: Math.max(
            ...through.map((v, c) => Math.abs(v - without[c])),
          ),
        });
      }
      return { rooms, gl: r.getContext().getError() };
    } finally {
      camera.up.set(0, 1, 0);
      camera.position.copy(saved.position);
      camera.rotation.copy(saved.rotation);
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      g.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
      r.setRenderTarget(previous);
    }
  });
  await writeFile(
    info.outputPath('tinted-glass.json'),
    JSON.stringify({ result, messages }, null, 2),
  );
  const [stone, tinted, glass] = result.rooms;
  expect(stone.sky).toBe(0);
  expect(tinted.sky).toBe(0);
  expect(glass.sky).toBeGreaterThan(0);
  expect(Math.max(...glass.floor)).toBeGreaterThan(
    Math.max(...tinted.floor) * 1.5,
  );
  expect(stone.visibility).toBeLessThan(0.00001);
  expect(tinted.visibility).toBeGreaterThan(0.01);
  expect(glass.visibility).toBeGreaterThan(0.01);
  expect(result.gl).toBe(0);
  expect(messages).toEqual([]);
});
