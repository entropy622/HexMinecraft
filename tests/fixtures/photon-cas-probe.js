import * as THREE from 'three';

export function probePhotonCas(g, images, cases) {
  const r = g.renderer,
    p = g.composer.effects.output,
    old = {
      target: r.getRenderTarget(),
      viewport: r.getViewport(new THREE.Vector4()),
      screen: p.renderToScreen,
      texture: p.uniforms.tDiffuse.value,
    },
    output = [];
  p.renderToScreen = false;
  try {
    for (const image of images) {
      const texture = new THREE.DataTexture(
          new Float32Array(image.pixels.flatMap((c) => [...c, 0.37])),
          image.width,
          image.height,
          THREE.RGBAFormat,
          THREE.FloatType,
        ),
        target = new THREE.WebGLRenderTarget(image.width, image.height, {
          type: THREE.FloatType,
          depthBuffer: false,
        });
      texture.needsUpdate = true;
      const rows = [];
      try {
        for (const settings of cases) {
          p.setOptions({ ...g.postOptions, ...settings });
          p.render(r, target, { texture });
          const values = new Float32Array(image.width * image.height * 4);
          r.readRenderTargetPixels(
            target,
            0,
            0,
            image.width,
            image.height,
            values,
          );
          rows.push(Array.from(values));
        }
      } finally {
        texture.dispose();
        target.dispose();
      }
      output.push(rows);
    }
    // Draw the actual TAA history copy. Its alpha is metadata; RGB must be an
    // exact half-float copy, with no old neighborhood sharpen left in this pass.
    const t = g.composer.effects.temporal,
      previous = {
        material: t.quad.material,
        texture: t.copy.uniforms.sceneColor.value,
      },
      data = new Uint16Array(8 * 8 * 4);
    for (let i = 0; i < data.length; i++)
      data[i] = THREE.DataUtils.toHalfFloat(
        i % 4 === 3 ? -2.5 : 0.08 + ((i * 37) % 101) / 80,
      );
    const history = new THREE.DataTexture(
        data,
        8,
        8,
        THREE.RGBAFormat,
        THREE.HalfFloatType,
      ),
      copyTarget = new THREE.WebGLRenderTarget(8, 8, {
        type: THREE.FloatType,
        depthBuffer: false,
      }),
      copied = new Float32Array(8 * 8 * 4);
    history.needsUpdate = true;
    try {
      t.copy.uniforms.sceneColor.value = history;
      t.quad.material = t.copy;
      r.setRenderTarget(copyTarget);
      t.quad.render(r);
      r.readRenderTargetPixels(copyTarget, 0, 0, 8, 8, copied);
    } finally {
      t.copy.uniforms.sceneColor.value = previous.texture;
      t.quad.material = previous.material;
      history.dispose();
      copyTarget.dispose();
    }
    return {
      output,
      history: Array.from(data, THREE.DataUtils.fromHalfFloat),
      copied: Array.from(copied),
      gl: r.getContext().getError(),
    };
  } finally {
    p.setOptions(g.postOptions);
    p.renderToScreen = old.screen;
    p.uniforms.tDiffuse.value = old.texture;
    r.setRenderTarget(old.target);
    r.setViewport(old.viewport);
  }
}
