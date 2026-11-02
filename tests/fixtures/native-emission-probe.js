import {
  FloatType,
  PerspectiveCamera,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { axialToWorld } from '../../src/core.js';
import { oracleEmission } from './emission-oracle.js';

// Render the actual meshes/materials into one temporary float target. The
// double-precision oracle receives the shader's own unshaded texture pigment.
export function readNativeEmission(g, models) {
  const r = g.renderer,
    original = g.material,
    copy = original.clone(),
    compile = original.onBeforeCompile,
    root = { value: new Vector3() },
    mode = { value: 0 },
    objects = [],
    hidden = [],
    previous = r.getRenderTarget(),
    target = new WebGLRenderTarget(256, 256, {
      type: FloatType,
      depthBuffer: true,
    }),
    camera = new PerspectiveCamera(50, 1, 0.1, 50),
    shadowAuto = r.shadowMap.autoUpdate,
    shadowUpdate = r.shadowMap.needsUpdate;
  copy.defaultAttributeValues = { ...original.defaultAttributeValues };
  copy.toneMapped = copy.fog = false;
  copy.onBeforeCompile = (shader, renderer) => {
    compile.call(copy, shader, renderer);
    Object.assign(shader.uniforms, {
      emissionProbeRoot: root,
      emissionProbeMode: mode,
    });
    shader.fragmentShader =
      'uniform vec3 emissionProbeRoot;uniform int emissionProbeMode;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      #include <opaque_fragment>
      vec2 delta=vLightPosition.xz-emissionProbeRoot.xz;
      float hexRadius=max(abs(delta.x),0.5*abs(delta.x)+0.866025404*abs(delta.y));
      bool selected=hexRadius<0.866126 && vLightPosition.y>emissionProbeRoot.y+0.005 && vLightPosition.y<emissionProbeRoot.y+1.001;
      vec3 data=totalEmissiveRadiance;
      if(emissionProbeMode==1)data=diffuseColor.rgb;
      if(emissionProbeMode==2)data=vec3(floor(vSurfaceOptics+0.5));
      gl_FragColor=vec4(data,selected?2.0:-1.0);return;
    `,
      );
  };
  copy.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-native-emission-probe';
  g.scene.traverse((object) => {
    if (object.material === original) objects.push(object);
  });
  for (const object of [...g.camera.children, g.outline, g.shapeOutline]) {
    hidden.push([object, object.visible]);
    object.visible = false;
  }
  const read = () => {
      r.setRenderTarget(target);
      r.render(g.scene, camera);
      const pixels = new Float32Array(256 * 256 * 4);
      r.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
      return pixels;
    },
    results = [];
  try {
    r.shadowMap.autoUpdate = r.shadowMap.needsUpdate = false;
    for (const model of models) {
      const p = axialToWorld(model.cell[0], model.cell[2]),
        look = axialToWorld(model.look[0], model.look[2]);
      root.value.set(p.x, model.cell[1], p.z);
      camera.position.set(look.x + 2.1, model.look[1] + 1.3, look.z + 3);
      camera.lookAt(look.x, model.look[1], look.z);
      camera.updateMatrixWorld();
      for (const object of objects) object.material = original;
      const beauty = read();
      for (const object of objects) object.material = copy;
      const data = [];
      for (let i = 0; i < 3; i++) {
        mode.value = i;
        data.push(read());
      }
      const summary = {
        type: model.type,
        samples: 0,
        classes: {},
        emitting: 0,
        peak: 0,
        maxError: 0,
        minBeautyMargin: Infinity,
        invalid: 0,
        worst: null,
      };
      for (let i = 0; i < data[0].length; i += 4) {
        if (data.some((p) => p[i + 3] < 1.5)) continue;
        const albedo = Array.from(data[1].slice(i, i + 3)),
          category = Math.round(data[2][i]),
          expected = oracleEmission(albedo, category);
        summary.samples++;
        summary.classes[category] = (summary.classes[category] || 0) + 1;
        if (data[0][i] + data[0][i + 1] + data[0][i + 2] > 1e-5)
          summary.emitting++;
        for (let c = 0; c < 3; c++) {
          const value = data[0][i + c],
            error = Math.abs(value - expected[c]);
          if (!Number.isFinite(value) || value < 0) summary.invalid++;
          summary.peak = Math.max(summary.peak, value);
          summary.minBeautyMargin = Math.min(
            summary.minBeautyMargin,
            beauty[i + c] - value,
          );
          if (error > summary.maxError) {
            summary.maxError = error;
            summary.worst = {
              albedo,
              category,
              actual: value,
              expected: expected[c],
              channel: c,
            };
          }
        }
      }
      results.push(summary);
    }
    return { models: results, gl: r.getContext().getError() };
  } finally {
    for (const object of objects) object.material = original;
    for (const [object, visible] of hidden) object.visible = visible;
    r.shadowMap.autoUpdate = shadowAuto;
    r.shadowMap.needsUpdate = shadowUpdate;
    r.setRenderTarget(previous);
    target.dispose();
    copy.dispose();
  }
}
