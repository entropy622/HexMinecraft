// Logical resources describe dependencies without owning a second set of GPU
// targets. EffectComposer still owns colour ping-pong and pass lifetimes.
export function installRenderPipeline(composer, definitions) {
  const produced = new Set(),
    ids = new Set(),
    stages = [];
  for (const definition of definitions) {
    const { id, pass, reads = [], writes = [] } = definition;
    if (!id || !pass || ids.has(id))
      throw Error('Invalid or duplicate render stage: ' + id);
    for (const name of reads)
      if (!produced.has(name))
        throw Error(`${id} reads ${name} before its producer`);
    for (const name of writes) {
      if (produced.has(name))
        throw Error('Multiple render producers for ' + name);
      produced.add(name);
    }
    ids.add(id);
    stages.push(
      Object.freeze({
        id,
        pass,
        reads: Object.freeze([...reads]),
        writes: Object.freeze([...writes]),
      }),
    );
  }
  // Validate the complete order before mutating the composer.
  for (const stage of stages) composer.addPass(stage.pass);
  const pipeline = Object.freeze({
    stages: Object.freeze(stages),
    describe: () =>
      stages.map((s) => ({
        id: s.id,
        enabled: s.pass.enabled,
        reads: [...s.reads],
        writes: [...s.writes],
      })),
  });
  composer.pipeline = pipeline;
  return pipeline;
}
