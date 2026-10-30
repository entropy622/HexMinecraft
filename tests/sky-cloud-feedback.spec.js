import { test, expect } from './browser-fixture.js';
import { DataUtils } from 'three';
import { writeFile } from 'node:fs/promises';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './fixtures/photon-reference-scenes.js';
import { installFrameProbe } from './fixtures/photon-frame-probe.js';
import {
  sourceSkyProject,
  sourceSkyIrradiance,
  hostCoefficients,
  sampleSkyMap,
} from './fixtures/photon-skylight-oracle.js';

test('real clouds enter SH and reflection sky while clear background and cloud fill remain independent', async ({
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
  await page.evaluate(() => {
    const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
    const mode = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(a.cloudSky),
      'mode',
    ).get;
    window.skyCloudEnabled = true;
    Object.defineProperty(a.cloudSky, 'mode', {
      configurable: true,
      get() {
        return window.skyCloudEnabled ? mode.call(this) : 'clear';
      },
    });
  });
  const records = [];
  for (const [label, enabled, time] of [
    ['clear-environment', false, 30],
    ['cloud-environment', true, 30],
    ['restored-clear', false, 30],
    ['twilight-cloud-environment', true, 330],
  ]) {
    await page.evaluate(
      ({ enabled, time }) => {
        window.__hexwild.step(time - window.__hexwild.state.time);
        const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
        window.skyCloudEnabled = enabled;
        a.key = null;
        a.updated = null;
      },
      { enabled, time },
    );
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            return (
              !a.pending && a.key !== null && window.__photonProbe.rendered
            );
          }),
        { timeout: 90000 },
      )
      .toBeTruthy();
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    const record = await page.evaluate(async (label) => {
      const { readReflectionSky } =
        await import('/tests/fixtures/sky-cloud-reflection-probe.js');
      const g = window.__hexwild.graphics,
        a = g.skyEnvironment.atmosphere;
      const read = (texture) => {
        const t = [...a.targets, ...a.cloudSky.targets].find(
            (t) => t.texture === texture,
          ),
          pixels = new Uint16Array(t.width * t.height * 4);
        g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, pixels);
        return { width: t.width, height: t.height, pixels: [...pixels] };
      };
      return {
        label,
        reflected: readReflectionSky(g),
        clear: read(a.uniforms.skyRadianceMap.value),
        environment: read(a.uniforms.skyEnvironmentMap.value),
        sh: a.probe.sh.toArray(),
        up: a.clearIrradiance.up.toArray(),
        down: a.clearIrradiance.down.toArray(),
        boost: a.sourceExposures.z,
        ambient: g.cloudSystem.uniforms.cloudAmbient.value.toArray(),
        ground: g.cloudSystem.uniforms.cloudGround.value.toArray(),
        reflectionShared:
          g.composer.effects.wet.material.uniforms.environmentSky ===
          a.uniforms.skyEnvironmentMap,
        time: window.__hexwild.state.time,
        camera: g.camera.position.toArray(),
        exposure: g.renderer.toneMappingExposure,
        sun: a.directLight.toArray(),
        fog: [g.scene.fog.near, g.scene.fog.far],
        gl: g.renderer.getContext().getError(),
      };
    }, label);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    const map = record.environment,
      clear = record.clear;
    map.pixels = map.pixels.map(DataUtils.fromHalfFloat);
    clear.pixels = clear.pixels.map(DataUtils.fromHalfFloat);
    const source = sourceSkyProject((d) =>
        sampleSkyMap(map.pixels, map.width, map.height, d),
      ),
      expected = hostCoefficients(source).map((v) => v * record.boost);
    let maximum = 0;
    expected.forEach(
      (v, i) =>
        (maximum = Math.max(
          maximum,
          Math.abs(v - record.sh[i]) / Math.max(1, Math.abs(v)),
        )),
    );
    expect(maximum).toBeLessThan(0.005);
    for (const reflected of record.reflected) {
      const expected = sampleSkyMap(
        map.pixels,
        map.width,
        map.height,
        reflected.direction,
      );
      expected.forEach((v, c) =>
        expect(
          Math.abs(v - reflected.rgb[c]) / Math.max(1, Math.abs(v)),
        ).toBeLessThan(0.003),
      );
    }
    const clearSource = sourceSkyProject((d) =>
      sampleSkyMap(clear.pixels, clear.width, clear.height, d),
    );
    for (const [normal, name] of [
      [[0, 1, 0], 'up'],
      [[0, -1, 0], 'down'],
    ]) {
      const expected = sourceSkyIrradiance(clearSource, normal);
      expected.forEach((v, c) =>
        expect(
          Math.abs(v - record[name][c]) / Math.max(1, Math.abs(v)),
        ).toBeLessThan(0.004),
      );
    }
    expect(record.reflectionShared).toBe(true);
    expect(record.gl).toBe(0);
    records.push(record);
  }
  for (const key of [
    'clear',
    'up',
    'down',
    'ambient',
    'ground',
    'time',
    'camera',
    'exposure',
    'sun',
    'fog',
  ])
    expect(records[1][key], key).toEqual(records[0][key]);
  expect(records[2].sh).toEqual(records[0].sh);
  expect(records[3].boost).toBeGreaterThan(1.4);
  expect(
    records[1].sh.some((v, i) => Math.abs(v - records[0].sh[i]) > 0.001),
  ).toBe(true);
  const day = [];
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    const a = window.__hexwild;
    a.step(120 - a.state.time);
  });
  for (const [label, enabled] of [
    ['day-clear-environment', false],
    ['day-cloud-environment', true],
  ]) {
    await page.evaluate((enabled) => {
      window.skyCloudEnabled = enabled;
      const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
      a.key = null;
      a.updated = null;
    }, enabled);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
            return !a.pending && a.key !== null;
          }),
        { timeout: 90000 },
      )
      .toBe(true);
    const at = await page.evaluate(() => window.__photonProbe.rendered);
    await expect
      .poll(() => page.evaluate(() => window.__photonProbe.rendered), {
        timeout: 90000,
      })
      .toBeGreaterThanOrEqual(at + 40);
    await page
      .locator('#world')
      .screenshot({ path: info.outputPath(label + '.png') });
    day.push(
      await page.evaluate((label) => {
        const g = window.__hexwild.graphics,
          a = g.skyEnvironment.atmosphere;
        return {
          label,
          time: window.__hexwild.state.time,
          camera: g.camera.position.toArray(),
          exposure: g.renderer.toneMappingExposure,
          sun: a.directLight.toArray(),
          up: a.clearIrradiance.up.toArray(),
          sh: a.probe.sh.toArray(),
          fog: [g.scene.fog.near, g.scene.fog.far],
        };
      }, label),
    );
  }
  for (const key of ['time', 'camera', 'exposure', 'sun', 'up', 'fog'])
    expect(day[1][key], key).toEqual(day[0][key]);
  const cost = await page.evaluate(async () => {
    const g = window.__hexwild.graphics,
      a = g.skyEnvironment.atmosphere,
      r = g.renderer,
      gl = r.getContext(),
      ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { supported: false };
    const wait = () => new Promise(requestAnimationFrame),
      windows = [];
    for (const enabled of [false, true, false]) {
      window.skyCloudEnabled = enabled;
      const samples = [];
      for (let i = 0; i < 10; i++) {
        if (a.pending) await a.pending;
        const q = gl.createQuery();
        a.key = null;
        a.updated = null;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        try {
          a.update(r, {
            direction: a.uniforms.skySunDirection.value.clone(),
            height: g.camera.position.y,
            position: g.camera.position,
            rain: (a.uniforms.skyAerosol.value - 1) / 5,
            moon: a.uniforms.skyMoonIllumination.value,
            phase: a.uniforms.skyMoonPhase.value,
            quality: g.quality,
            active: true,
            time: window.__hexwild.state.time,
            dt: 0,
          });
        } finally {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
        }
        if (a.pending) await a.pending;
        while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
          await wait();
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT),
          ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
        if (disjoint) throw Error('Disjoint sky update timing');
        if (i >= 2) samples.push(ms);
      }
      windows.push({ enabled, samples });
    }
    window.skyCloudEnabled = true;
    a.key = null;
    a.updated = null;
    return {
      supported: true,
      windows,
      scope:
        'Only synchronous GPU sky-update draws plus async readback submission, not whole frames; two warmups and eight samples per window. Both modes retain clear up/down reduction.',
    };
  });
  expect(cost.supported).toBe(true);
  const resources = await page.evaluate(() => {
    const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
    return {
      cloudTargets: a.cloudSky.targets.map((t) => [t.width, t.height]),
      reduction: [a.targets[2].width, a.targets[2].height],
      bytes: a.cloudSky.targets.reduce((n, t) => n + t.width * t.height * 8, 0),
    };
  });
  expect(resources.cloudTargets).toEqual([
    [96, 48],
    [96, 48],
  ]);
  expect(resources.reduction).toEqual([22, 1]);
  const clearIds = await page.evaluate(() =>
    window.__hexwild.graphics.skyEnvironment.atmosphere.targets
      .slice(0, 2)
      .map((t) => t.texture.uuid)
      .sort(),
  );
  await page.evaluate(() => window.__hexwild.graphics.setQuality(1));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
          return (
            !a.pending &&
            a.key !== null &&
            a.cloudSky.targets.length === 2 &&
            a.uniforms.skyEnvironmentMap.value !==
              a.uniforms.skyRadianceMap.value
          );
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      window.__hexwild.graphics.skyEnvironment.atmosphere.targets
        .slice(0, 2)
        .map((t) => t.texture.uuid)
        .sort(),
    ),
  ).toEqual(clearIds);
  await page.evaluate(() => window.__hexwild.graphics.setQuality(1.7));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = window.__hexwild.graphics.skyEnvironment.atmosphere;
          return (
            !a.pending &&
            a.key !== null &&
            a.cloudSky.targets.length === 2 &&
            a.uniforms.skyEnvironmentMap.value !==
              a.uniforms.skyRadianceMap.value
          );
        }),
      { timeout: 90000 },
    )
    .toBe(true);
  await writeFile(
    info.outputPath('cloud-sky.json'),
    JSON.stringify({ records, day, cost, resources, messages }, null, 2),
  );
  expect(messages).toEqual([]);
});
