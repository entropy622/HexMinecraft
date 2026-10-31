import { test, expect } from './browser-fixture.js';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
const png = (size, fn) => {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set(fn(x, y), (y * size + x) * 4);
  return encode({ width: size, height: size, channels: 4, data });
};
function colorPack() {
  const dir = 'assets/minecraft/textures/',
    entries = {};
  for (const name of [
    'oak_leaves',
    'jungle_leaves',
    'birch_leaves',
    'spruce_leaves',
    'grass_block_top',
  ])
    entries[dir + 'block/' + name + '.png'] = png(16, () => [
      160, 160, 160, 255,
    ]);
  entries[dir + 'block/grass_block_side.png'] = png(16, () => [
    120, 80, 40, 255,
  ]);
  entries[dir + 'block/grass_block_side_overlay.png'] = png(16, (_, y) => [
    200,
    200,
    200,
    y < 4 ? 255 : 0,
  ]);
  entries[dir + 'block/oak_leaves_s.png'] = png(16, () => [224, 231, 0, 0]);
  entries[dir + 'colormap/grass.png'] = png(256, (x, y) => [x, 200, y, 255]);
  entries[dir + 'colormap/foliage.png'] = png(256, (x, y) => [200, x, y, 255]);
  return {
    name: 'biome-colors.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(entries)),
  };
}
const frames = (page, n = 8) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        function step() {
          if (--n) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      }),
    n,
  );
async function ready(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            !g.relightQueue.size &&
            !g.skyEnvironment.atmosphere.pending &&
            g.voxelLight.revision === g.world.lightRevision
          );
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  await frames(page);
}
const encodeSrgb = (x) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
const decodeSrgb = (x) =>
  x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
const base = {
  oak: [121, 169, 77],
  jungle: [77, 144, 53],
  grass: [145, 185, 93],
  'grass-side-top': [136, 173, 84],
  'grass-side-dirt': [136, 173, 84],
};

test('native biome pigment reaches foliage and grass while ZIP maps refresh meshes, fixed species and bare dirt remain stable', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#creative').click();
  const points = await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      { axialToWorld } = await import('/src/core.js'),
      { installBiomeControl } =
        await import('/tests/fixtures/biome-tint-probe.js');
    api.setPlaying(false);
    api.step(120 - api.state.time);
    g.setQuality(1.7);
    g.setPostOptions({
      ...g.postOptions,
      clouds: false,
      bloom: 0,
      exposure: false,
      occlusion: 0,
    });
    const cells = [];
    for (let q = -7; q <= 7; q++)
      for (let r = -5; r <= 5; r++)
        for (let y = 48; y < 64; y++) {
          w.set(q, y, r, y === 48 ? 'calcite' : null);
          cells.push([q, y, r]);
        }
    const points = [
      [-4, 'leaves', 'oak'],
      [-2, 'jungleLeaves', 'jungle'],
      [0, 'birchLeaves', 'birch'],
      [2, 'spruceLeaves', 'spruce'],
      [4, 'grass', 'grass'],
    ].map(([q, type, name]) => {
      w.set(q, 50, 0, type);
      cells.push([q, 50, 0]);
      const p = axialToWorld(q, 0);
      return { q, r: 0, name, position: [p.x, 51, p.z] };
    });
    const grass = points[4];
    points.push(
      {
        name: 'grass-side-top',
        side: true,
        position: [grass.position[0] - 0.433, 50.91, 0.75],
      },
      {
        name: 'grass-side-dirt',
        side: true,
        position: [grass.position[0] - 0.433, 50.25, 0.75],
      },
    );
    g.updateCells(cells);
    api.teleport(0, 55, 10);
    g.camera.position.set(0, 55, 13);
    g.camera.lookAt(0, 50.5, 0);
    g.camera.updateMatrixWorld();
    window.biomeControl = installBiomeControl(g);
    return points;
  });
  await ready(page);
  const probe = () =>
    page.evaluate(async (points) => {
      const { readBiomeAlbedo } =
        await import('/tests/fixtures/biome-tint-probe.js');
      return readBiomeAlbedo(window.__hexwild.graphics, points);
    }, points);
  await page.evaluate(() => window.biomeControl.set(false));
  const nativeOff = await probe();
  await page.evaluate(() => window.biomeControl.set(true));
  const nativeOn = await probe();
  function compare(on, off) {
    let maximum = 0,
      count = 0;
    for (let p = 0; p < points.length; p++) {
      const name = points[p].name,
        a = on.points[p],
        b = off.points[p];
      let selected = 0;
      for (let i = 0; i < a.albedo.length; i++)
        if (
          a.albedo[i][3] === 3 &&
          b.albedo[i][3] === 3 &&
          a.tint[i][3] === 3
        ) {
          selected++;
          for (let c = 0; c < 3; c++) {
            const desired = points[p].side
              ? encodeSrgb(b.albedo[i][c]) +
                b.overlay[i][c] *
                  b.overlay[i][3] *
                  (a.tint[i][c] - base[name][c] / 255)
              : base[name]
                ? Math.min(
                    1,
                    encodeSrgb(b.albedo[i][c]) / (base[name][c] / 255),
                  ) * a.tint[i][c]
                : encodeSrgb(b.albedo[i][c]);
            const expected = decodeSrgb(Math.max(0, Math.min(1, desired)));
            maximum = Math.max(maximum, Math.abs(a.albedo[i][c] - expected));
            count++;
          }
        }
      expect(selected, name).toBeGreaterThan(5);
    }
    expect(maximum).toBeLessThan(0.005);
    return { maximum, count };
  }
  const native = compare(nativeOn, nativeOff);
  expect(nativeOn.gl).toBe(0);
  expect(nativeOff.gl).toBe(0);
  await page.locator('#material-pack-file').setInputFiles(colorPack());
  await expect(page.locator('#material-pack-status')).toContainText(
    'biome-colors.zip',
  );
  await ready(page);
  await page.evaluate(() => window.biomeControl.set(false));
  const packOff = await probe();
  await page.evaluate(() => window.biomeControl.set(true));
  const packOn = await probe();
  const packed = compare(packOn, packOff);
  const tintMedian = (p, c) =>
    p.tint
      .filter((v) => v[3] === 3)
      .map((v) => v[c])
      .sort((a, b) => a - b)[
      Math.floor(p.tint.filter((v) => v[3] === 3).length / 2)
    ];
  expect(tintMedian(packOn.points[0], 0)).toBeCloseTo(200 / 255, 3);
  expect(tintMedian(packOn.points[0], 1)).toBeCloseTo(50 / 255, 3);
  expect(tintMedian(packOn.points[4], 0)).toBeCloseTo(50 / 255, 3);
  expect(tintMedian(packOn.points[4], 1)).toBeCloseTo(200 / 255, 3);
  await frames(page);
  const reflection = await page.evaluate(
    ({ point, visible }) => {
      const g = window.__hexwild.graphics;
      g.composer.effects.protection.render(g.renderer);
      const target = g.composer.effects.protection.target,
        p = g.camera.position.clone().fromArray(point).project(g.camera),
        x = Math.round(((p.x + 1) / 2) * target.width) - 11,
        y = Math.round(((p.y + 1) / 2) * target.height) - 11,
        data = new Uint8Array(23 * 23 * 4),
        pixels = [],
        classes = {};
      g.renderer.readRenderTargetPixels(target, x, y, 23, 23, data, 0, 1);
      for (let i = 0; i < data.length; i += 4) {
        classes[data[i + 3]] = (classes[data[i + 3]] || 0) + 1;
        if (data[i + 3] === 6 && visible[i / 4])
          pixels.push([...data.slice(i, i + 3)]);
      }
      return {
        attachments: target.textures.length,
        pixels,
        classes,
        gl: g.renderer.getContext().getError(),
      };
    },
    {
      point: points[0].position,
      visible: packOn.points[0].albedo.map((p) => p[3] === 3),
    },
  );
  await writeFile(
    info.outputPath('reflection-biome.json'),
    JSON.stringify(reflection, null, 2),
  );
  expect(reflection.attachments).toBe(4);
  expect(reflection.gl).toBe(0);
  expect(reflection.pixels.length).toBeGreaterThan(5);
  const forward = packOn.points[0].albedo.find((p) => p[3] === 3);
  for (const pixel of reflection.pixels)
    for (let c = 0; c < 3; c++)
      expect(Math.abs(pixel[c] / 255 - encodeSrgb(forward[c]))).toBeLessThan(
        0.008,
      );
  const bottom = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    let triangles = 0;
    g.terrain.traverse((o) => {
      const geo = o.geometry;
      if (o.material !== g.material || !geo) return;
      const p = geo.attributes.position,
        n = geo.attributes.normal,
        t = geo.attributes.biomeTint;
      for (let i = 0; i < p.count; i++)
        if (
          n.getY(i) < -0.9 &&
          p.getY(i) === 50 &&
          Math.abs(p.getX(i) + o.position.x - 6.928203) < 1.01 &&
          Math.abs(p.getZ(i) + o.position.z) < 1.01
        ) {
          if (t.getW(i) !== 0) throw Error('Tinted grass bottom');
          triangles++;
        }
    });
    return triangles;
  });
  expect(bottom).toBeGreaterThan(6);
  expect(packOn.gl).toBe(0);
  expect(messages).toEqual([]);
  await page.screenshot({
    path: info.outputPath('biome-map-native-blocks.png'),
  });
  await page.locator('#material-pack-reset').evaluate((b) => b.click());
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  await ready(page);
  const restored = await probe();
  expect(tintMedian(restored.points[0], 0)).toBeCloseTo(109 / 255, 3);
  await writeFile(
    info.outputPath('biome-materials.json'),
    JSON.stringify(
      {
        native,
        packed,
        nativeOn,
        nativeOff,
        packOn,
        packOff,
        restored,
        reflection,
        bottom,
        messages,
      },
      null,
      2,
    ),
  );
});

test('native forest records biome color changes at the fixed morning camera and daylight without moving the fog or light', async ({
  page,
}, info) => {
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (['error', 'warning'].includes(e.type())) messages.push(e.text());
  });
  await page.addInitScript(
    (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
    referenceSettings,
  );
  await page.addInitScript(installFrameProbe);
  await page.goto('/');
  await page.evaluate(() => (window.__photonFreeze = true));
  await page.locator('#save-file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceSave(referenceScenes[0]))),
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('F1');
  await ready(page);
  await page.evaluate(async () => {
    const { installBiomeControl } =
      await import('/tests/fixtures/biome-tint-probe.js');
    window.biomeControl = installBiomeControl(window.__hexwild.graphics);
  });
  const records = [];
  for (const [label, on] of [
    ['fixed-tint', false],
    ['biome-tint', true],
    ['restored-fixed', false],
  ]) {
    await page.evaluate((on) => window.biomeControl.set(on), on);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    records.push(
      await page.evaluate((label) => {
        const g = window.__hexwild.graphics,
          a = g.skyEnvironment.atmosphere;
        return {
          label,
          time: window.__hexwild.state.time,
          exposure: g.renderer.toneMappingExposure,
          camera: g.camera.position.toArray(),
          sun: a.directLight.toArray(),
          sh: a.probe.sh.toArray(),
          fog: [g.scene.fog.near, g.scene.fog.far],
        };
      }, label),
    );
  }
  for (const row of records.slice(1))
    for (const key of ['time', 'exposure', 'camera', 'sun', 'sh', 'fog'])
      expect(row[key]).toEqual(records[0][key]);
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.step(120 - a.state.time);
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  for (const [label, on] of [
    ['day-fixed-tint', false],
    ['day-biome-tint', true],
  ]) {
    await page.evaluate((on) => window.biomeControl.set(on), on);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
  }
  const resources = await page.evaluate(() => {
    const g = window.__hexwild.graphics,
      geometries = new Set();
    g.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
    });
    return {
      tintBytes: [...geometries].reduce(
        (n, geo) => n + (geo.attributes.biomeTint?.array.byteLength || 0),
        0,
      ),
      rangeBytes: [...geometries].reduce(
        (n, geo) => n + (geo.userData.biomeRanges?.byteLength || 0),
        0,
      ),
      overlayBytes:
        g.textures.materials.uniforms.biomeGrassOverlay.value.image.data
          .byteLength,
      baseCache: g.textures.biomes.base.size,
      blendCache: g.textures.biomes.blended.size,
    };
  });
  await writeFile(
    info.outputPath('forest-biomes.json'),
    JSON.stringify({ records, resources, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
