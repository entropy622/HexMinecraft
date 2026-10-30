import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Object3D,
  OrthographicCamera,
  Scene,
} from 'three';

async function compileScene(renderer, scene, camera, target, current) {
  const objects = [],
    batch = new Object3D();
  scene.traverse((object) => {
    if (
      (object.isMesh || object.isPoints || object.isLine || object.isSprite) &&
      object.material
    )
      objects.push(object);
  });
  let start = 0,
    end = 0,
    deadline = performance.now() + 8;
  // A compilation-only view: keep original objects/geometry and parent links.
  // targetScene supplies the actual lights, fog and environment exactly once.
  batch.traverse = (visit) => {
    for (let i = start; i < end; i++) visit(objects[i]);
  };
  batch.traverseVisible = () => {};
  for (; start < objects.length; start = end) {
    if (!current()) return false;
    end = Math.min(start + 4, objects.length);
    const previous = renderer.getRenderTarget(),
      face = renderer.getActiveCubeFace(),
      level = renderer.getActiveMipmapLevel();
    try {
      renderer.setRenderTarget(target);
      renderer.compile(batch, camera, scene);
    } finally {
      renderer.setRenderTarget(previous, face, level);
    }
    if (performance.now() >= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      deadline = performance.now() + 8;
    }
  }
  return current();
}

// Launch the actual scene and fullscreen programs without drawing. Checking
// Three's program readiness uses KHR_parallel_shader_compile where available;
// shader diagnostics remain enabled on the first real use of each program.
export async function prepareRecoveredRenderer(graphics, current) {
  // Let the recovery message paint before submitting compiler work.
  await new Promise((resolve) => setTimeout(resolve, 16));
  if (!current()) return false;
  const { renderer, scene, camera, composer } = graphics,
    sky = graphics.skyEnvironment.atmosphere,
    target = renderer.getRenderTarget(),
    face = renderer.getActiveCubeFace(),
    level = renderer.getActiveMipmapLevel(),
    geometry = new BufferGeometry(),
    fullscreen = new Scene(),
    ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3),
  );
  geometry.setAttribute(
    'uv',
    new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2),
  );
  const materials = new Set(),
    collect = (owner) => {
      // Only each pass's own material fields; never walk uniforms, scenes,
      // shared geometry or the renderer's resource graph.
      for (const value of Object.values(owner || {}))
        if (value?.isMaterial) materials.add(value);
    };
  try {
    if (graphics.world?.dimension === 'overworld') {
      // Allocation invalidates old sky programs, so it precedes compilation.
      sky.allocate(renderer, graphics.quality);
      sky.cloudSky.material.defines.SKY_CAPTURE_CLOUDS = Number(
        graphics.usePost && graphics.postOptions.clouds,
      );
      sky.cloudSky.material.needsUpdate = true;
      collect(sky);
      collect(sky.cloudSky);
    }
    if (composer) {
      const frame = composer.passes[0],
        protection = composer.effects.protection;
      for (const pass of composer.passes)
        if (pass !== protection) collect(pass);
      collect(frame.clouds);
      collect(frame.clouds.coverage);
      collect(composer.effects.wet.radiance);
      // OutputPass normally chooses these defines during its first draw.
      composer.effects.output.prepare(renderer);
    }
    const output = composer?.effects.output.material;
    for (const material of materials)
      if (material !== output) fullscreen.add(new Mesh(geometry, material));
    // Start the expensive sky/cloud programs first; submit scene programs in
    // short batches so compiler submission itself does not freeze the UI.
    if (
      !(await compileScene(
        renderer,
        fullscreen,
        ortho,
        composer?.passes[0].target || sky.targets[0] || null,
        current,
      ))
    )
      return false;
    if (output) {
      fullscreen.clear();
      fullscreen.add(new Mesh(geometry, output));
      if (!(await compileScene(renderer, fullscreen, ortho, null, current)))
        return false;
    }
    if (
      !(await compileScene(
        renderer,
        scene,
        camera,
        composer?.passes[0].target || null,
        current,
      ))
    )
      return false;
    composer?.effects.protection.compile(renderer);
  } finally {
    renderer.setRenderTarget(target, face, level);
    // Borrowed materials and scene geometry still belong to their owners.
    fullscreen.clear();
    geometry.dispose();
  }
  // compileAsync tracks only a material's last program. A transparent
  // DoubleSide material also has a back-face program: wait for both, and for
  // every scene/gbuffer/fullscreen variant submitted above. This adapter uses
  // the same isReady() contract as Three r186's compileAsync implementation.
  const programs = [...renderer.info.programs];
  while (current()) {
    if (programs.every((program) => program.isReady())) return true;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  return false;
}
