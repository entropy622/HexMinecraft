import { DataUtils, Vector3 } from 'three';

// Preserve native geometry/atlas/light/visibility. Only expose existing shader
// terms in the actual HDR beauty target; alpha 3 marks the requested top face.
export function readNativeSurfaceOptics(g, points, full = true) {
  const r = g.renderer,
    frame = g.composer.passes[0],
    original = g.material,
    copy = original.clone(),
    compile = original.onBeforeCompile,
    mode = { value: 0 },
    root = { value: new Vector3() },
    objects = [],
    previous = r.getRenderTarget(),
    enabled = g.weatherUniforms.surfaceSpecular.value;
  copy.defaultAttributeValues = { ...original.defaultAttributeValues };
  copy.toneMapped = copy.fog = false;
  copy.onBeforeCompile = (shader, renderer) => {
    compile.call(copy, shader, renderer);
    Object.assign(shader.uniforms, {
      nativeOpticsMode: mode,
      nativeOpticsRoot: root,
    });
    shader.fragmentShader =
      'uniform int nativeOpticsMode;uniform vec3 nativeOpticsRoot;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
      #include <opaque_fragment>
      vec3 nativeOpticsData=reflectedLight.directSpecular;
      if(nativeOpticsMode==1)nativeOpticsData=vec3(surfaceOptical.roughness,surfaceOptical.f0,surfaceOptical.metal);
      if(nativeOpticsMode==2)nativeOpticsData=diffuseColor.rgb;
      // Read the actual integer class used by photonSurfaceOptics, not the
      // interpolated float immediately before its source rounding step.
      if(nativeOpticsMode==3)nativeOpticsData=vec3(floor(vSurfaceOptics+0.5));
      if(nativeOpticsMode==4)nativeOpticsData=reflectedLight.directDiffuse;
      vec2 nativeOpticsDelta=vLightPosition.xz-nativeOpticsRoot.xz;
      bool nativeOpticsTop=abs(vLightPosition.y-nativeOpticsRoot.y)<0.02 && dot(nativeOpticsDelta,nativeOpticsDelta)<0.36;
      gl_FragColor=vec4(nativeOpticsData,nativeOpticsTop?3.0:0.0);`,
      );
  };
  copy.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-native-optics-probe';
  g.scene.traverse((object) => {
    if (object.material === original) {
      objects.push(object);
      object.material = copy;
    }
  });
  function read(point, component) {
    root.value.fromArray(point.position);
    mode.value = component;
    frame.beauty.render(r, null, frame.target);
    const t = frame.target,
      p = root.value.clone().project(g.camera),
      size = 21;
    const x = Math.max(
        0,
        Math.min(t.width - size, Math.round((p.x * 0.5 + 0.5) * t.width) - 10),
      ),
      y = Math.max(
        0,
        Math.min(
          t.height - size,
          Math.round((p.y * 0.5 + 0.5) * t.height) - 10,
        ),
      ),
      raw = new Uint16Array(size * size * 4);
    r.readRenderTargetPixels(t, x, y, size, size, raw);
    return Array.from({ length: size * size }, (_, i) =>
      Array.from(raw.slice(i * 4, i * 4 + 4), DataUtils.fromHalfFloat),
    );
  }
  try {
    r.shadowMap.needsUpdate = true;
    const result = points.map((point) => {
      const data = {};
      for (const [component, name] of [
        [0, 'specular'],
        [1, 'parameters'],
        [2, 'albedo'],
        [3, 'category'],
        [4, 'diffuse'],
      ])
        if (full || component === 0) data[name] = read(point, component);
      return { ...point, data };
    });
    g.weatherUniforms.surfaceSpecular.value = 0;
    for (let i = 0; i < points.length; i++) result[i].off = read(points[i], 0);
    return { points: result, gl: r.getContext().getError() };
  } finally {
    for (const object of objects) object.material = original;
    g.weatherUniforms.surfaceSpecular.value = enabled;
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(previous);
    copy.dispose();
  }
}
