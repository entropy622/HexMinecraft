import { test, expect } from './browser-fixture.js';
import { readFile, writeFile } from 'node:fs/promises';
import { emissionGallery } from './fixtures/emission-gallery.js';
import { wetGallery } from './fixtures/wet-gallery.js';
import { reflectionAirGallery } from './fixtures/reflection-air-gallery.js';
import { referenceSettings } from './fixtures/photon-reference-scenes.js';
import { validateSave } from '../src/save.js';

for (const gallery of [
  {
    name: 'source-emission',
    makeSave: () => emissionGallery().save,
    shader: 'photonSurfaceEmission',
  },
  {
    name: 'wet-material',
    makeSave: wetGallery,
    shader: 'photonPuddleMaterial',
  },
  {
    name: 'reflection-air',
    makeSave: reflectionAirGallery,
    shader: 'surfaceReflectionAir',
  },
])
  test(`release draws ${gallery.name} materials and preserves a v16 gallery through native UI and device recovery`, async ({
    page,
  }, info) => {
    const messages = [];
    page.on('pageerror', (e) => messages.push(e.message));
    page.on('console', (e) => {
      if (['error', 'warning'].includes(e.type())) messages.push(e.text());
    });
    await page.route('https://fonts.googleapis.com/**', (r) =>
      r.fulfill({ body: '', contentType: 'text/css' }),
    );
    await page.addInitScript(
      (s) => localStorage.setItem('hexwild-settings', JSON.stringify(s)),
      {
        ...referenceSettings,
        post: { ...referenceSettings.post, clouds: false },
      },
    );
    await page.addInitScript((shaderFunction) => {
      window.__emissionDevice = { programs: 0, draws: 0 };
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (
          this.id === 'world' &&
          args[0] === 'webgl2' &&
          gl &&
          !gl.__emissionObserved
        ) {
          gl.__emissionObserved = true;
          const shaders = new WeakMap(),
            attached = new WeakMap(),
            emission = new WeakSet(),
            source = gl.shaderSource.bind(gl),
            attach = gl.attachShader.bind(gl),
            link = gl.linkProgram.bind(gl),
            use = gl.useProgram.bind(gl);
          let active = null;
          gl.shaderSource = (shader, text) => {
            shaders.set(shader, text);
            return source(shader, text);
          };
          gl.attachShader = (program, shader) => {
            if (!attached.has(program)) attached.set(program, []);
            attached.get(program).push(shader);
            return attach(program, shader);
          };
          gl.linkProgram = (program) => {
            if (
              attached
                .get(program)
                ?.some((shader) =>
                  shaders.get(shader)?.includes(shaderFunction),
                )
            ) {
              emission.add(program);
              window.__emissionDevice.programs++;
            }
            return link(program);
          };
          gl.useProgram = (program) => {
            active = program;
            return use(program);
          };
          for (const name of [
            'drawArrays',
            'drawElements',
            'drawArraysInstanced',
            'drawElementsInstanced',
          ]) {
            const draw = gl[name].bind(gl);
            gl[name] = (...drawArgs) => {
              if (active && emission.has(active))
                window.__emissionDevice.draws++;
              return draw(...drawArgs);
            };
          }
        }
        return gl;
      };
    }, gallery.shader);
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.__hexwild)).toBe(
      'undefined',
    );
    await page.evaluate(() => {
      const hud = document.querySelector('#hud'),
        observer = new MutationObserver(() => {
          if (hud.classList.contains('hidden')) return;
          observer.disconnect();
          for (const type of ['keydown', 'keyup'])
            document.body.dispatchEvent(
              new KeyboardEvent(type, {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              }),
            );
        });
      observer.observe(hud, { attributes: true, attributeFilter: ['class'] });
    });
    const input = gallery.makeSave();
    await page.locator('#save-file').setInputFiles({
      name: 'emission-gallery-v16.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(input)),
    });
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__emissionDevice.draws), {
        timeout: 180000,
      })
      .toBeGreaterThan(10);
    const before = await page.evaluate(() => window.__emissionDevice.draws);
    await page.evaluate(async () => {
      const canvas = document.querySelector('#world'),
        ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
      if (!ext) throw Error('WEBGL_lose_context unavailable');
      window.__emissionRestore = ext;
      await new Promise((resolve) => {
        canvas.addEventListener('webglcontextlost', resolve, { once: true });
        ext.loseContext();
      });
    });
    await expect(page.locator('#render-recovery')).toBeVisible();
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        document
          .querySelector('#world')
          .addEventListener('webglcontextrestored', resolve, { once: true });
        window.__emissionRestore.restoreContext();
      });
    });
    await expect(page.locator('#render-recovery')).toBeHidden({
      timeout: 180000,
    });
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__emissionDevice.draws), {
        timeout: 120000,
      })
      .toBeGreaterThan(before + 10);
    expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(
      false,
    );
    expect(
      await page.evaluate(() =>
        document.querySelector('#world').getContext('webgl2').getError(),
      ),
    ).toBe(0);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const outputPath = info.outputPath('release-gallery-v16.json');
    await download.saveAs(outputPath);
    const output = JSON.parse(await readFile(outputPath, 'utf8'));
    validateSave(output);
    expect(output.version).toBe(16);
    expect(output.time).toBe(input.time);
    expect(output.inventory).toEqual(input.inventory);
    if (input.weather) expect(output.weather).toEqual(input.weather);
    expect(output.dimensions.overworld.edits).toEqual(
      input.dimensions.overworld.edits,
    );
    expect(output.dimensions.overworld.blockStates).toEqual(
      input.dimensions.overworld.blockStates,
    );
    expect(output.dimensions.overworld.furnaces).toEqual(
      input.dimensions.overworld.furnaces,
    );
    expect(await page.evaluate(() => typeof window.__hexwild)).toBe(
      'undefined',
    );
    await page.screenshot({ path: info.outputPath('release-recovered.png') });
    await writeFile(
      info.outputPath('release.json'),
      JSON.stringify(
        {
          device: await page.evaluate(() => window.__emissionDevice),
          messages,
        },
        null,
        2,
      ),
    );
    expect(messages).toEqual([]);
  });
