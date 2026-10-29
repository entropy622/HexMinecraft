import { DataUtils, Vector3 } from 'three';

// Read the actual material's inputs and transmitted response independently.
// No substitute scene, lights, geometry, shadow map or transport implementation.
export function readFoliageRange(g, position, plants = false) {
  const r = g.renderer,
    frame = g.composer.passes[0],
    original = plants ? g.foliageMaterial : g.leafMaterials.material,
    clone = original.clone(),
    compile = original.onBeforeCompile,
    mode = { value: 0 },
    objects = [],
    target = r.getRenderTarget(),
    root = new Vector3(...position),
    maps = [];
  clone.defaultAttributeValues = { ...original.defaultAttributeValues };
  clone.toneMapped = clone.fog = false;
  clone.onBeforeCompile = (shader, renderer) => {
    compile.call(clone, shader, renderer);
    shader.uniforms.rangeProbeMode = mode;
    shader.fragmentShader =
      'uniform int rangeProbeMode;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      #include <opaque_fragment>
      float rangeNoL=clamp(dot(inverseTransformDirection(geometryNormal,viewMatrix),leafSunDirection),0.0,1.0);
      float rangeAmbient=0.5*clamp(vLeafAmbient,0.0,1.0);
      vec4 rangePoint=softShadowMatrix*vec4(vLightPosition,1.0);
      vec3 rangeProjection=rangePoint.xyz/rangePoint.w;
      #ifdef USE_REVERSED_DEPTH_BUFFER
        rangeProjection.z=1.0-rangeProjection.z;
      #endif
      float rangeFade=leafShadowRangeFade(rangeProjection);
      if(rangeProbeMode==0)gl_FragColor.rgb=vec3(vAmbientOcclusion,rangeAmbient,rangeNoL);
      if(rangeProbeMode==1)gl_FragColor.rgb=leafTransmittance(diffuseColor.rgb,rangeNoL,vAmbientOcclusion,rangeAmbient);
      if(rangeProbeMode==2)gl_FragColor.rgb=diffuseColor.rgb;
      if(rangeProbeMode==3)gl_FragColor.rgb=vec3(rangeFade);
      gl_FragColor.a=2.0;
    `,
      );
  };
  clone.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-range-input-probe';
  g.scene.traverse((o) => {
    if (o.material === original) {
      objects.push(o);
      o.material = clone;
    }
  });
  try {
    for (mode.value = 0; mode.value < 4; mode.value++) {
      r.shadowMap.needsUpdate = true;
      frame.beauty.render(r, null, frame.target);
      const t = frame.target,
        raw = new Uint16Array(t.width * t.height * 4),
        center = root.clone().project(g.camera),
        x = Math.round((center.x * 0.5 + 0.5) * t.width),
        y = Math.round((center.y * 0.5 + 0.5) * t.height),
        pixels = [];
      r.readRenderTargetPixels(t, 0, 0, t.width, t.height, raw);
      for (let dy = -15; dy <= 15; dy++)
        for (let dx = -15; dx <= 15; dx++) {
          const i = ((y + dy) * t.width + x + dx) * 4;
          pixels.push(Array.from(raw.slice(i, i + 4), DataUtils.fromHalfFloat));
        }
      maps.push(pixels);
    }
    return {
      inputs: maps[0],
      transmission: maps[1],
      albedo: maps[2],
      fade: maps[3],
      amount: (plants ? g.plantUniforms : g.leafUniforms).leafSssAmount.value,
      gl: r.getContext().getError(),
    };
  } finally {
    for (const o of objects) o.material = original;
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(target);
    clone.dispose();
  }
}
