import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A browser module lets Vite resolve the same Three instance as production.
export {
  DataTexture,
  DataUtils,
  FloatType,
  RGBAFormat,
  LinearFilter,
  HalfFloatType,
  WebGLRenderTarget,
} from 'three';

// Supply HDR pixels at the GPU input boundary, then run the actual game pass.
// This also runs unchanged against the old checkout for measured comparison.
export function readProductionBloom(graphics) {
  const renderer = graphics.renderer,
    pass = graphics.composer.effects.bloom,
    previous = renderer.getRenderTarget(),
    strength = pass.strength,
    screen = pass.renderToScreen,
    width = 256,
    height = 192,
    data = new Float32Array(width * height * 4),
    source = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    ),
    input = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    }),
    output = input.clone(),
    copy = new THREE.MeshBasicMaterial({
      map: source,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    }),
    quad = new FullScreenQuad(copy),
    pixels = new Uint16Array(data.length),
    samples = [];
  source.minFilter = source.magFilter = THREE.LinearFilter;
  pass.setSize(width, height);
  pass.renderToScreen = false;
  try {
    for (const power of [0.4, 1.2, 4, 16])
      for (let phase = 0; phase < 8; phase++) {
        // Cross a full half-resolution sampling period, including its seam.
        const position = phase / 4,
          f = position % 1,
          x = 120 + Math.floor(position),
          y = 90;
        data.fill(0);
        data.set(
          [
            power * (1 - f),
            power * (1 - f) * 0.25,
            power * (1 - f) * 0.0625,
            1,
          ],
          (y * width + x) * 4,
        );
        data.set(
          [power * f, power * f * 0.25, power * f * 0.0625, 1],
          (y * width + x + 1) * 4,
        );
        source.needsUpdate = true;
        renderer.setRenderTarget(input);
        quad.render(renderer);
        pass.render(renderer, output, input);
        renderer.readRenderTargetPixels(
          pass.needsSwap ? output : input,
          0,
          0,
          width,
          height,
          pixels,
        );
        const rgb = [0, 0, 0],
          rings = [0, 0, 0];
        for (let yy = 0; yy < height; yy++)
          for (let xx = 0; xx < width; xx++) {
            const i = (yy * width + xx) * 4,
              distance = Math.hypot(xx - x - f, yy - y);
            for (let c = 0; c < 3; c++)
              rgb[c] += THREE.DataUtils.fromHalfFloat(pixels[i + c]);
            const red = THREE.DataUtils.fromHalfFloat(pixels[i]);
            if (distance > 2 && distance <= 8) rings[0] += red;
            if (distance > 8 && distance <= 24) rings[1] += red;
            if (distance > 24) rings[2] += red;
          }
        samples.push({ power, phase, rgb, rings });
      }
    return { samples, gl: renderer.getContext().getError() };
  } finally {
    pass.strength = strength;
    pass.renderToScreen = screen;
    pass.setSize(
      graphics.composer.readBuffer.width,
      graphics.composer.readBuffer.height,
    );
    source.dispose();
    input.dispose();
    output.dispose();
    copy.dispose();
    quad.dispose();
    renderer.setRenderTarget(previous);
  }
}
