import { PointLight, Vector3, DataUtils } from 'three';

export function probeLeafDirectionalDiffuse(g) {
  const r = g.renderer,
    frame = g.composer.passes[0],
    original = g.leafMaterials.material,
    clone = original.clone(),
    compile = original.onBeforeCompile,
    changed = [],
    target = r.getRenderTarget(),
    cameraPosition = g.camera.position.clone(),
    cameraRotation = g.camera.quaternion.clone(),
    amount = g.leafUniforms.leafSssAmount.value,
    intensity = g.sun.intensity,
    direction = g.sun.position.clone().sub(g.sun.target.position).normalize(),
    root = new Vector3(0, 45.5, 0),
    rows = [];
  let point;
  clone.defaultAttributeValues = { ...original.defaultAttributeValues };
  clone.toneMapped = clone.fog = false;
  clone.onBeforeCompile = (shader, renderer) => {
    compile.call(clone, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor.rgb=reflectedLight.directDiffuse;gl_FragColor.a=2.0;',
    );
  };
  clone.customProgramCacheKey = () =>
    original.customProgramCacheKey() + '-direct-sss-probe';
  g.scene.traverse((o) => {
    if (o.material === original) {
      changed.push(o);
      o.material = clone;
    }
  });
  const read = (amount) => {
    g.leafUniforms.leafSssAmount.value = amount;
    r.shadowMap.needsUpdate = true;
    frame.beauty.render(r, null, frame.target);
    const t = frame.target,
      pixels = new Uint16Array(t.width * t.height * 4),
      center = root.clone().project(g.camera),
      x = Math.round((center.x * 0.5 + 0.5) * t.width),
      y = Math.round((center.y * 0.5 + 0.5) * t.height),
      result = [];
    r.readRenderTargetPixels(t, 0, 0, t.width, t.height, pixels);
    for (let dy = -15; dy <= 15; dy++)
      for (let dx = -15; dx <= 15; dx++) {
        const i = ((y + dy) * t.width + x + dx) * 4;
        result.push(
          Array.from(pixels.slice(i, i + 4), DataUtils.fromHalfFloat),
        );
      }
    return result;
  };
  const compare = (source, a, b, weight) => {
    const pairs = [];
    for (let i = 0; i < a.length; i++)
      if (
        a[i][3] === 2 &&
        b[i][3] === 2 &&
        Math.max(...a[i].slice(0, 3)) > 0.0001
      )
        pairs.push({ a: a[i].slice(0, 3), b: b[i].slice(0, 3) });
    rows.push({ source, weight, pairs });
  };
  try {
    g.camera.position.copy(root).addScaledVector(direction, 4);
    g.camera.lookAt(root);
    g.camera.updateMatrixWorld();
    const solar = read(0);
    compare('sun', solar, read(0.5), 0.75);
    compare('sun', solar, read(1), 0.5);
    g.sun.intensity = 0;
    point = new PointLight('#ffffff', 4, 12);
    point.position.copy(root).addScaledVector(direction, 4);
    g.scene.add(point);
    const local = read(0);
    compare('point', local, read(1), 1);
    return { rows, gl: r.getContext().getError() };
  } finally {
    for (const object of changed) object.material = original;
    g.leafUniforms.leafSssAmount.value = amount;
    g.sun.intensity = intensity;
    g.camera.position.copy(cameraPosition);
    g.camera.quaternion.copy(cameraRotation);
    g.camera.updateMatrixWorld();
    if (point) g.scene.remove(point);
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(target);
    clone.dispose();
  }
}
