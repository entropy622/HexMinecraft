import {
  HalfFloatType,
  ShaderMaterial,
  WebGLRenderTarget,
  DataUtils,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Read at the actual reflection pass boundary, before later composer passes
// reuse the ping-pong HDR texture. Isolation changes only incident sources.
export function probeSurfaceReflections(g) {
  const pass = g.composer.effects.wet,
    render = pass.render;
  return new Promise((resolve, reject) => {
    pass.render = function (renderer, write, read) {
      render.call(this, renderer, write, read);
      pass.render = render;
      const saved = renderer.getRenderTarget(),
        protection = g.composer.effects.protection.target;
      const target = new WebGLRenderTarget(
        protection.width,
        protection.height,
        { type: HalfFloatType, depthBuffer: false },
      );
      const quad = new FullScreenQuad(),
        materials = [];
      try {
        const size = protection.width * protection.height,
          encoded = new Uint8Array(size * 4),
          geometry = new Uint8Array(size * 4);
        renderer.readRenderTargetPixels(
          protection,
          0,
          0,
          protection.width,
          protection.height,
          encoded,
          0,
          1,
        );
        renderer.readRenderTargetPixels(
          protection,
          0,
          0,
          protection.width,
          protection.height,
          geometry,
          0,
          2,
        );
        const results = {};
        for (const mode of ['full', 'ssr', 'sky']) {
          let fragment = pass.material.fragmentShader.replace(
            'base.rgb+=environment*(1.0-coverage);',
            'gl_FragColor=vec4(environment,1.0);return;',
          );
          if (mode === 'ssr')
            fragment = fragment.replace(
              'textureLod(environmentSky,uv,0.0).rgb*visible',
              'vec3(0.0)',
            );
          if (mode === 'sky')
            fragment = fragment.replace(
              'vec4 hit=environmentScene>0.5?reflectedScene(position+normal*0.045,ray,environmentSteps,mip,dither):vec4(0.0);',
              'vec4 hit=vec4(0.0);',
            );
          const material = new ShaderMaterial({
            uniforms: {
              ...pass.material.uniforms,
              environmentFrame: { value: 0 },
            },
            vertexShader: pass.material.vertexShader,
            fragmentShader: fragment,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          });
          materials.push(material);
          quad.material = material;
          renderer.setRenderTarget(target);
          quad.render(renderer);
          const values = new Uint16Array(size * 4),
            classes = {};
          renderer.readRenderTargetPixels(
            target,
            0,
            0,
            target.width,
            target.height,
            values,
          );
          let invalid = 0;
          for (let i = 0; i < size; i++) {
            const category = encoded[i * 4 + 3] - 1;
            if (![0, 11, 12, 13].includes(category)) continue;
            const row = (classes[category] ||= {
              count: 0,
              rgb: [0, 0, 0],
              lit: 0,
              skylight: 0,
            });
            row.count++;
            row.skylight += geometry[i * 4 + 2] / 255;
            let peak = 0;
            for (let c = 0; c < 3; c++) {
              const n = DataUtils.fromHalfFloat(values[i * 4 + c]);
              if (!Number.isFinite(n) || n < 0) invalid++;
              row.rgb[c] += n;
              peak = Math.max(peak, n);
            }
            if (peak > 0.005) row.lit++;
          }
          for (const row of Object.values(classes)) {
            row.rgb = row.rgb.map((n) => n / row.count);
            row.skylight /= row.count;
          }
          results[mode] = { classes, invalid };
        }
        resolve({
          results,
          layout: protection.textures.map((t) => ({
            type: t.type,
            format: t.format,
          })),
          gl: renderer.getContext().getError(),
        });
      } catch (e) {
        reject(e);
      } finally {
        renderer.setRenderTarget(saved);
        materials.forEach((m) => m.dispose());
        target.dispose();
        quad.dispose();
      }
    };
  });
}
