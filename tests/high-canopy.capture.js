import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';

test('real planted high jungle canopy separates pigment, direct light, ambient light, transmission, sheen and specular', async ({
  page,
}, info) => {
  test.setTimeout(360000);
  test.skip(
    !process.env.HIGH_CANOPY_SAVE,
    'Supply an actual grown giant-tree v16 export through HIGH_CANOPY_SAVE',
  );
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['warning', 'error'].includes(e.type())) messages.push(e.text());
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.addInitScript(installFrameProbe);
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  const input = await readFile(process.env.HIGH_CANOPY_SAVE);
  await page.locator('#save-file').setInputFiles({
    name: 'actual-grown-giants.json',
    mimeType: 'application/json',
    buffer: input,
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.setPlaying(false);
    a.step(120 - a.state.time);
    a.teleport(-105, 26, 16);
    a.lookAt(-119, 37, 8);
    a.graphics.stepOffset = 0;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return !g.relightQueue.size && !g.skyEnvironment.atmosphere.pending;
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  const start = await page.evaluate(() => window.__photonProbe.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
      timeout: 90000,
    })
    .toBeGreaterThan(start + 40);
  await page
    .locator('#world')
    .screenshot({ path: info.outputPath('high-canopy.png') });
  const result = await page.evaluate(async () => {
    const a = window.__hexwild,
      g = a.graphics,
      { axialToWorld } = await import('/src/core.js'),
      { readForestLighting } =
        await import('/tests/fixtures/forest-lighting-probe.js'),
      p = axialToWorld(-119, 8);
    const out = readForestLighting(g, {
      minimum: [p.x - 18, 35, p.z - 18],
      maximum: [p.x + 18, 52, p.z + 18],
    });
    return {
      ...out,
      meta: {
        time: a.state.time,
        camera: g.camera.position.toArray(),
        rotation: g.camera.quaternion.toArray(),
        fov: g.camera.fov,
        exposure: g.renderer.toneMappingExposure,
        fog: [g.scene.fog.near, g.scene.fog.far],
        leafAmount: g.leafUniforms.leafSssAmount.value,
        skySH: g.skyEnvironment.atmosphere.probe.sh.toArray(),
        quality: g.quality,
        lightBounds: [
          g.voxelLight.minQ,
          g.voxelLight.minR,
          g.voxelLight.width,
          g.voxelLight.depth,
          g.voxelLight.opticalTop,
        ],
      },
    };
  });
  for (const map of result.maps) {
    await writeFile(
      info.outputPath(`${map.name}.png`),
      Buffer.from(map.png, 'base64'),
    );
    delete map.png;
  }
  await writeFile(
    info.outputPath('high-canopy-lighting.json'),
    JSON.stringify({ result, messages }, null, 2),
  );
  expect(result.leafPixels).toBeGreaterThan(500);
  expect(result.gl).toBe(0);
  expect(result.restored).toBe(true);
  expect(result.meta.exposure).toBe(1);
  const pigment = result.maps.find((m) => m.name === 'untinted-pigment');
  expect(pigment.stats.finite).toBe(true);
  // Tinting a native leaf should multiply a bounded pigment, just as a gray
  // imported leaf does. Allow byte tinting, shader and half-float rounding.
  for (const channel of pigment.stats.rgb)
    expect(channel.maximum).toBeLessThan(1.03);
  expect(messages).toEqual([]);
});
