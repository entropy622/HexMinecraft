import { DataUtils, Vector3 } from 'three';
export function installBiomeControl(g) {
  const enabled = { value: 1 },
    saved = [];
  for (const material of [
    g.material,
    g.leafMaterials.material,
    g.foliageMaterial,
  ]) {
    const compile = material.onBeforeCompile,
      key = material.customProgramCacheKey;
    saved.push({ material, compile, key });
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.biomeTestEnabled = enabled;
      const needle =
        'diffuseColor.rgb=biomeSurfaceTint(diffuseColor.rgb,vMapUv);';
      if (!shader.fragmentShader.includes(needle))
        throw Error('Biome control injection failed');
      shader.fragmentShader =
        'uniform float biomeTestEnabled;\n' +
        shader.fragmentShader.replace(
          needle,
          'if(biomeTestEnabled>0.5){' + needle + '}',
        );
    };
    material.customProgramCacheKey = () =>
      key.call(material) + '-biome-test-control';
    material.needsUpdate = true;
  }
  return {
    set(value) {
      enabled.value = Number(value);
      g.composer?.effects.temporal.reset();
    },
    dispose() {
      for (const { material, compile, key } of saved) {
        material.onBeforeCompile = compile;
        material.customProgramCacheKey = key;
        material.needsUpdate = true;
      }
    },
  };
}

export function readBiomeAlbedo(g, points) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    root = { value: new Vector3() },
    mode = { value: 0 },
    side = { value: 0 },
    originals = [g.material, g.leafMaterials.material, g.foliageMaterial],
    copies = new Map(),
    objects = [];
  for (const original of originals) {
    const copy = original.clone(),
      compile = original.onBeforeCompile;
    copy.defaultAttributeValues = { ...original.defaultAttributeValues };
    copy.toneMapped = copy.fog = false;
    copy.onBeforeCompile = (shader, renderer) => {
      compile.call(copy, shader, renderer);
      Object.assign(shader.uniforms, {
        biomeProbeRoot: root,
        biomeProbeMode: mode,
        biomeProbeSide: side,
      });
      shader.fragmentShader =
        'uniform vec3 biomeProbeRoot;uniform int biomeProbeMode;uniform float biomeProbeSide;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          /* glsl */ `
        #include <opaque_fragment>
        vec3 result=biomeProbeMode==1?vBiomeTint.rgb:diffuseColor.rgb;
        float radius=length(vLightPosition.xz-biomeProbeRoot.xz);
        bool marked=biomeProbeSide>0.5?abs(vLightPosition.y-biomeProbeRoot.y)<0.08&&radius<0.35:abs(vLightPosition.y-biomeProbeRoot.y)<0.02&&radius<0.6;
        gl_FragColor=biomeProbeMode==2?biomeOverlay(vMapUv):vec4(result,marked?3.0:0.0);`,
        );
    };
    copy.customProgramCacheKey = () =>
      original.customProgramCacheKey() + '-biome-albedo-probe';
    copies.set(original, copy);
  }
  g.scene.traverse((object) => {
    if (copies.has(object.material)) {
      objects.push([object, object.material]);
      object.material = copies.get(object.material);
    }
  });
  try {
    const result = [];
    for (const point of points) {
      root.value.fromArray(point.position);
      side.value = point.side ? 1 : 0;
      const data = { name: point.name };
      for (const [m, name] of ['albedo', 'tint', 'overlay'].entries()) {
        mode.value = m;
        const target = g.composer.passes[0].target;
        g.composer.passes[0].beauty.render(r, null, target);
        const p = root.value.clone().project(g.camera),
          size = 23,
          x = Math.round((p.x * 0.5 + 0.5) * target.width) - 11,
          y = Math.round((p.y * 0.5 + 0.5) * target.height) - 11,
          pixels = new Uint16Array(size * size * 4);
        r.readRenderTargetPixels(target, x, y, size, size, pixels);
        data[name] = Array.from({ length: size * size }, (_, i) =>
          Array.from(pixels.slice(i * 4, i * 4 + 4), DataUtils.fromHalfFloat),
        );
      }
      result.push(data);
    }
    return { points: result, gl: r.getContext().getError() };
  } finally {
    for (const [object, material] of objects) object.material = material;
    r.setRenderTarget(previous);
    for (const copy of copies.values()) copy.dispose();
  }
}
