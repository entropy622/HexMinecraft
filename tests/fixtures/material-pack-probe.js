import { DataUtils, Vector3 } from 'three';
export { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
// Diagnostic output from the actual terrain shader, preserving UV/light/geometry.
export function readMaterialPack(g, points) {
  const r = g.renderer,
    original = g.material,
    copy = original.clone(),
    compile = original.onBeforeCompile,
    mode = { value: 0 },
    root = { value: new Vector3() },
    objects = [],
    previous = r.getRenderTarget();
  copy.defaultAttributeValues = { ...original.defaultAttributeValues };
  copy.toneMapped = copy.fog = false;
  copy.onBeforeCompile = (shader, renderer) => {
    compile.call(copy, shader, renderer);
    Object.assign(shader.uniforms, {
      packProbeMode: mode,
      packProbeRoot: root,
    });
    shader.fragmentShader =
      'uniform int packProbeMode;uniform vec3 packProbeRoot;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
      #include <opaque_fragment>
      vec4 result=vec4(surfaceOptical.roughness,surfaceOptical.f0,surfaceOptical.metal,1.0);
      if(packProbeMode==1)result=surfacePackSpec;
      if(packProbeMode==2)result=vec4(inverseTransformDirection(normal,viewMatrix),1.0);
      if(packProbeMode==3)result=vec4(totalEmissiveRadiance,1.0);
      if(packProbeMode==4)result=vec4(surfacePorosity,surfaceOptical.emission,surfaceSkyLevel,1.0);
      vec2 delta=vLightPosition.xz-packProbeRoot.xz;
      bool top=abs(vLightPosition.y-packProbeRoot.y)<0.02&&dot(delta,delta)<0.36;
      gl_FragColor=top?result:vec4(-1.0);`,
      );
  };
  copy.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-pack-probe';
  g.scene.traverse((o) => {
    if (o.material === original) {
      objects.push(o);
      o.material = copy;
    }
  });
  try {
    const out = points.map((point) => {
      root.value.fromArray(point.position);
      const data = { type: point.type };
      for (const [component, name] of [
        'parameters',
        'rawSpecular',
        'normal',
        'emission',
        'extra',
      ].entries()) {
        mode.value = component;
        g.composer.passes[0].beauty.render(
          r,
          null,
          g.composer.passes[0].target,
        );
        const target = g.composer.passes[0].target,
          p = root.value.clone().project(g.camera),
          size = 17,
          x = Math.round((p.x * 0.5 + 0.5) * target.width) - 8,
          y = Math.round((p.y * 0.5 + 0.5) * target.height) - 8,
          raw = new Uint16Array(size * size * 4);
        r.readRenderTargetPixels(target, x, y, size, size, raw);
        data[name] = Array.from({ length: size * size }, (_, i) =>
          Array.from(raw.slice(i * 4, i * 4 + 4), DataUtils.fromHalfFloat),
        ).filter((pixel) => pixel[0] >= 0);
      }
      return data;
    });
    return { points: out, gl: r.getContext().getError() };
  } finally {
    for (const o of objects) o.material = original;
    r.setRenderTarget(previous);
    copy.dispose();
  }
}
