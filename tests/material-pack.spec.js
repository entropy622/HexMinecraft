import { test, expect } from './browser-fixture.js';
import { encode } from 'fast-png';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { writeFile } from 'node:fs/promises';

const png = (size, pixel) => {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set(pixel(x, y), 4 * (y * size + x));
  return encode({ width: size, height: size, channels: 4, data });
};
function fixture(size = 32) {
  const root = 'Test Pack/assets/minecraft/textures/block/';
  return {
    name: 'labpbr-test.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        [root + 'stone.png']: png(size, () => [180, 150, 90, 255]),
        [root + 'stone_s.png']: png(size, () => [224, 231, 0, 0]),
        [root + 'stone_n.png']: png(size, () => [192, 128, 160, 0]),
        [root + 'dirt_s.png']: png(size, () => [128, 32, 32, 128]),
        [root + 'oak_planks_s.png']: png(size, () => [128, 32, 64, 255]),
      }),
    ),
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
async function fresh(page) {
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

test('ZIP controls apply raw labPBR to native surfaces, persist, recover and release optional buffers', async ({
  page,
}, info) => {
  test.setTimeout(480000);
  const messages = [];
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.push(e.text());
  });
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto('/');
  await page.locator('#creative').click();
  const points = await page.evaluate(async () => {
    const api = window.__hexwild,
      g = api.graphics,
      w = g.world,
      { axialToWorld } = await import('/src/core.js');
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
    for (let q = -5; q <= 5; q++)
      for (let r = -5; r <= 5; r++)
        for (let y = 48; y < 64; y++) {
          w.set(q, y, r, y === 48 ? 'calcite' : null);
          cells.push([q, y, r]);
        }
    const points = [
      [-2, 'stone'],
      [0, 'dirt'],
      [2, 'planks'],
    ].map(([q, type]) => {
      w.set(q, 49, 0, type);
      cells.push([q, 49, 0]);
      const p = axialToWorld(q, 0);
      return { type, position: [p.x, 50, p.z] };
    });
    g.updateCells(cells);
    api.teleport(0, 53, 8);
    g.camera.position.set(0, 54, 11);
    g.camera.lookAt(0, 49.5, 0);
    g.camera.updateMatrixWorld();
    return points;
  });
  await fresh(page);
  await page.screenshot({ path: info.outputPath('native-default.png') });
  await page.locator('#material-pack-file').setInputFiles(fixture());
  await expect(page.locator('#material-pack-status')).toContainText(
    'labpbr-test.zip',
  );
  await fresh(page);
  const actual = await page.evaluate(async (points) => {
    const g = window.__hexwild.graphics,
      { readMaterialPack } =
        await import('/tests/fixtures/material-pack-probe.js');
    const result = readMaterialPack(g, points);
    g.composer.effects.protection.render(g.renderer);
    const p = g.composer.effects.protection;
    result.attachments = p.target.textures.length;
    result.sharedMask =
      g.composer.effects.temporal.material.uniforms.protection ===
      p.textureUniform;
    result.numericColorSpace =
      g.textures.materials.uniforms.surfacePackSpecular.value.colorSpace;
    result.hasReflection = [...g.chunks.values()].some((m) =>
      g.textures.materials.reflective(m.geometry),
    );
    result.resources = {
      atlas: [g.textures.canvas.width, g.textures.canvas.height],
      dataBytes: Object.values(g.textures.materials.uniforms).reduce(
        (n, u) => n + (u.value?.image?.data?.byteLength || 0),
        0,
      ),
    };
    return result;
  }, points);
  await writeFile(
    info.outputPath('native-labpbr.json'),
    JSON.stringify(actual, null, 2),
  );
  expect(actual.attachments).toBe(4);
  expect(actual.sharedMask).toBe(true);
  expect(actual.numericColorSpace).toBe('');
  expect(actual.hasReflection).toBe(true);
  const median = (rows, c) =>
    rows.map((r) => r[c]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const stone = actual.points[0],
    dirt = actual.points[1],
    planks = actual.points[2];
  expect(stone.parameters.length).toBeGreaterThan(15);
  expect(median(stone.parameters, 0)).toBeCloseTo((1 - 224 / 255) ** 2, 3);
  expect(median(stone.parameters, 1)).toBeCloseTo(1, 3);
  expect(median(stone.parameters, 2)).toBeCloseTo(1, 3);
  expect(median(stone.rawSpecular, 3)).toBe(0);
  expect(median(stone.rawSpecular, 1)).toBeCloseTo(231 / 255, 3);
  expect(median(stone.normal, 1)).toBeLessThan(0.95);
  expect(median(stone.normal, 1)).toBeGreaterThan(0.7);
  expect(median(dirt.emission, 0)).toBeGreaterThan(0);
  expect(median(planks.emission, 0)).toBe(0);
  expect(median(dirt.extra, 0)).toBeCloseTo(0.5, 2);
  expect(median(dirt.extra, 1)).toBeCloseTo(128 / 255, 3);
  expect(actual.gl).toBe(0);
  expect(messages).toEqual([]);
  const reflection = await page.evaluate(async () => {
    const { probeSurfaceReflections } =
      await import('/tests/fixtures/surface-reflection-probe.js');
    return probeSurfaceReflections(window.__hexwild.graphics);
  });
  await writeFile(
    info.outputPath('labpbr-reflections.json'),
    JSON.stringify(reflection, null, 2),
  );
  expect(reflection.gl).toBe(0);
  expect(reflection.layout).toHaveLength(4);
  expect(reflection.results.full.classes[0].lit).toBeGreaterThan(15);
  await page.screenshot({ path: info.outputPath('native-labpbr.png') });
  const before = await page.evaluate(
    () => window.__hexwild.graphics.textures.atlas.uuid,
  );
  await page.locator('#material-pack-file').setInputFiles({
    name: 'invalid.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from([1, 2, 3]),
  });
  await expect(page.locator('#material-pack-status')).toContainText('未能导入');
  expect(
    await page.evaluate(() => window.__hexwild.graphics.textures.atlas.uuid),
  ).toBe(before);
  await page.reload();
  await expect(page.locator('#material-pack-status')).toContainText(
    'labpbr-test.zip',
  );
  expect(
    await page.evaluate(
      () => window.__hexwild.graphics.textures.materials.hasSpecular,
    ),
  ).toBe(true);
  await page.locator('#creative').click();
  await page.evaluate(() => window.__hexwild.graphics.setQuality(1.7));
  await frames(page);
  await page.evaluate(() => {
    const r = window.__hexwild.graphics.renderer;
    r.forceContextLoss();
    setTimeout(() => r.forceContextRestore(), 500);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.__hexwild.graphics;
          return (
            !g.renderer.getContext().isContextLost() &&
            g.composer?.effects.protection.target.textures.length === 4
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await page
    .locator('#material-pack-reset')
    .evaluate((button) => button.click());
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  await frames(page);
  const reset = await page.evaluate(() => {
    const g = window.__hexwild.graphics;
    g.composer.effects.protection.render(g.renderer);
    return {
      attachments: g.composer.effects.protection.target.textures.length,
      normal: g.textures.materials.uniforms.surfacePackNormal.value,
      spec: g.textures.materials.uniforms.surfacePackSpecular.value,
    };
  });
  expect(reset).toEqual({ attachments: 3, normal: null, spec: null });
  await page.reload();
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  expect(messages).toEqual([]);
});

test('16/32/64 atlas changes preserve UVs, cached block textures and sparse color fallback', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      { BufferGeometry, Float32BufferAttribute, Mesh } =
        await import('/tests/fixtures/material-pack-probe.js');
    const uv = [
        ...g.textures.uv('stone:top', 0, 0),
        ...g.textures.uv('stone:top', 1, 0),
        ...g.textures.uv('stone:top', 1, 1),
      ],
      geo = new BufferGeometry();
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setAttribute('sawNextUV', new Float32BufferAttribute(uv, 2));
    geo.setAttribute('sawLastUV', new Float32BufferAttribute(uv, 2));
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0], 3),
    );
    const mesh = new Mesh(geo, g.material);
    mesh.visible = false;
    g.scene.add(mesh);
    window.packUVTest = {
      geo,
      base: [...geo.attributes.uv.array],
      single: g.textures.single('stone:top'),
      uuid: g.textures.atlas.uuid,
      fallback: [
        ...g.textures.materials
          .tile('calcite:top')
          .getContext('2d')
          .getImageData(3, 7, 1, 1).data,
      ],
    };
  });
  for (const size of [64, 16, 32]) {
    await page.locator('#material-pack-file').setInputFiles(fixture(size));
    await expect(page.locator('#material-pack-status')).toContainText(
      `${size}×`,
    );
    const state = await page.evaluate(() => {
      const g = window.__hexwild.graphics,
        t = window.packUVTest;
      return {
        size: g.textures.materials.layout.size,
        uuid: g.textures.atlas.uuid,
        singleStable: t.single === g.textures.single('stone:top'),
        singleSize: t.single.image.width,
        alternate: [...t.geo.attributes.sawNextUV.array],
        uv: [...t.geo.attributes.uv.array],
        fallback: [
          ...g.textures.materials
            .tile('calcite:top')
            .getContext('2d')
            .getImageData(
              (3 * g.textures.materials.layout.size) / 16,
              (7 * g.textures.materials.layout.size) / 16,
              1,
              1,
            ).data,
        ],
        baseFallback: t.fallback,
      };
    });
    expect(state.size).toBe(size);
    expect(state.singleStable).toBe(true);
    expect(state.singleSize).toBe(size);
    expect(state.alternate).toEqual(state.uv);
    expect(state.fallback).toEqual(state.baseFallback);
  }
  await page.locator('#material-pack-reset').evaluate((b) => b.click());
  await expect(page.locator('#material-pack-status')).toContainText('默认材质');
  const reset = await page.evaluate(() => {
    const t = window.packUVTest;
    return {
      base: t.base,
      current: [...t.geo.attributes.uv.array],
      retained: !!t.geo.userData.packBase_uv,
    };
  });
  expect(reset.current).toEqual(reset.base);
  expect(reset.retained).toBe(false);
});
