// Same-process ablation of one production uniform. frame() normally owns the
// dimension value, so hold only that scalar while the real renderer keeps running.
// No render-pass replacement or application debug API is involved.
export function setSurfaceDiffuseControl(enabled) {
  if (enabled) {
    window.__restoreSurfaceDiffuse?.();
    delete window.__restoreSurfaceDiffuse;
  } else if (!window.__restoreSurfaceDiffuse) {
    const uniform = window.__hexwild.graphics.weatherUniforms.surfaceDiffuse;
    const descriptor = Object.getOwnPropertyDescriptor(uniform, 'value');
    window.__restoreSurfaceDiffuse = () =>
      Object.defineProperty(uniform, 'value', descriptor);
    Object.defineProperty(uniform, 'value', {
      configurable: true,
      enumerable: true,
      get: () => 0,
      set() {},
    });
  }
  return window.__hexwild.graphics.weatherUniforms.surfaceDiffuse.value;
}

// A uniform bypass still executes the mixed arithmetic. For timing, compile
// native material copies with just the new arithmetic removed, then dispose
// those copies and restore every original material/callback/cache identity.
export function beginCompiledSurfaceDiffuseControl() {
  const g = window.__hexwild.graphics,
    copies = new Map(),
    objects = [];
  const diagnostics = { materials: 0, compiles: 0, replacements: 0 };
  const kernel =
    /float surfaceNoL=clamp\(dot\(geometryNormal,directLight\.direction\),0\.0,1\.0\);\s*directLight\.color\*=mix\(1\.0,1\.25\/\(1\.0\+0\.25\*surfaceNoL\)\*clamp\(vAmbientOcclusion,0\.0,1\.0\),surfaceDiffuse\);/g;
  function copy(original) {
    if (!original?.userData.geometricShade) return original;
    if (copies.has(original)) return copies.get(original);
    const material = original.clone(),
      compile = original.onBeforeCompile,
      key = original.customProgramCacheKey();
    material.defaultAttributeValues = { ...original.defaultAttributeValues };
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      let count = 0;
      shader.fragmentShader = shader.fragmentShader.replace(kernel, () => {
        count++;
        return '';
      });
      if (count !== 1)
        throw Error(
          'Compiled legacy diffuse control did not remove exactly one production kernel',
        );
      diagnostics.compiles++;
      diagnostics.replacements += count;
    };
    material.customProgramCacheKey = () =>
      key + '-compiled-legacy-diffuse-control';
    copies.set(original, material);
    diagnostics.materials++;
    return material;
  }
  g.scene.traverse((object) => {
    if (!object.material) return;
    const original = object.material;
    const next = Array.isArray(original) ? original.map(copy) : copy(original);
    if (
      Array.isArray(original)
        ? next.some((m, i) => m !== original[i])
        : next !== original
    ) {
      objects.push({ object, original });
      object.material = next;
    }
  });
  if (!diagnostics.materials)
    throw Error('Compiled diffuse control found no geometric materials');
  window.__compiledSurfaceDiffuseControl = {
    diagnostics,
    restore() {
      for (const { object, original } of objects) object.material = original;
      for (const material of copies.values()) material.dispose();
      delete window.__compiledSurfaceDiffuseControl;
    },
  };
  return diagnostics;
}
