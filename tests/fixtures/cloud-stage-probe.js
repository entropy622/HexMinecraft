// Observe real WebGL batches. Production renderers, shaders and work stay intact.
export function installCloudStageProbe() {
  let gl,
    extension,
    bits = 0,
    inside = false,
    measuring = false,
    gpuEnabled = true;
  let count = 0,
    rendered = 0,
    targetFrames = 0,
    batch = null,
    frame = null;
  let pending = [],
    gpu = [],
    frames = [],
    disjoint = 0,
    busy = 0;
  let labels = new WeakMap();
  const context = HTMLCanvasElement.prototype.getContext;
  function finishBatch() {
    if (!batch) return;
    gl.endQuery(extension.TIME_ELAPSED_EXT);
    pending.push(batch);
    batch = null;
  }
  function stage() {
    const g = window.__hexwild.graphics,
      f = g.composer.passes[0];
    const t = g.renderer.getRenderTarget();
    if (f.clouds.coverage?.target && t === f.clouds.coverage.target)
      return 'cloud-coverage';
    if (t === f.clouds.target)
      return f.clouds.volume.uniforms.sceneDepth.value === f.target.depthTexture
        ? 'cloud-integrate-main'
        : 'cloud-integrate-water';
    return t ? labels.get(t) || 'other' : 'output';
  }
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const result = context.apply(this, args);
    if (this.id !== 'world' || args[0] !== 'webgl2' || !result || gl)
      return result;
    gl = result;
    extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (extension)
      bits = gl.getQuery(
        extension.TIME_ELAPSED_EXT,
        extension.QUERY_COUNTER_BITS_EXT,
      );
    const bind = gl.bindFramebuffer.bind(gl);
    gl.bindFramebuffer = (...a) => {
      if (inside && (a[0] === gl.FRAMEBUFFER || a[0] === gl.DRAW_FRAMEBUFFER))
        finishBatch();
      return bind(...a);
    };
    for (const name of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ]) {
      const draw = gl[name].bind(gl);
      gl[name] = (...a) => {
        if (inside) {
          count++;
          if (frame && gpuEnabled && extension && bits && !batch) {
            if (
              pending.length < 256 &&
              !gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
            ) {
              const query = gl.createQuery();
              gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
              batch = { query, index: frames.length, stage: stage() };
            } else busy++;
          }
        }
        return draw(...a);
      };
    }
    return result;
  };
  function poll() {
    if (!gpuEnabled || !extension || !bits) return;
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      if (pending.length || measuring) disjoint++;
      pending.forEach((p) => gl.deleteQuery(p.query));
      pending = [];
      gpu = [];
      return;
    }
    pending = pending.filter((p) => {
      if (!gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE))
        return true;
      gpu.push({
        index: p.index,
        stage: p.stage,
        milliseconds: gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6,
      });
      gl.deleteQuery(p.query);
      return false;
    });
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((timestamp) => {
      if (window.__photonFreeze && window.__hexwild)
        window.__hexwild.setPlaying(false);
      poll();
      frame = measuring ? { index: frames.length, timestamp } : null;
      count = 0;
      inside = true;
      const start = performance.now();
      try {
        callback(timestamp);
      } finally {
        finishBatch();
        inside = false;
        if (count) {
          rendered++;
          if (frame) {
            frames.push({
              ...frame,
              draws: count,
              cpuSubmitMs: performance.now() - start,
            });
            if (frames.length >= targetFrames) measuring = false;
          }
        }
        frame = null;
      }
    });
  window.__cloudStages = {
    get rendered() {
      return rendered;
    },
    start(n, withGpu = true) {
      if (measuring || pending.length)
        throw Error('GPU measurement is pending');
      const g = window.__hexwild.graphics,
        f = g.composer.passes[0];
      labels = new WeakMap([
        [f.target, 'scene-main'],
        [f.opaque, 'scene-water'],
      ]);
      for (const [source, h] of f.clouds.histories)
        for (const t of h.history)
          labels.set(
            t,
            source === f.target ? 'cloud-resolve-main' : 'cloud-resolve-water',
          );
      frames = [];
      gpu = [];
      busy = 0;
      disjoint = 0;
      targetFrames = n;
      gpuEnabled = withGpu;
      measuring = true;
    },
    get done() {
      return (
        !measuring && frames.length === targetFrames && pending.length === 0
      );
    },
    result() {
      return {
        frames,
        gpu,
        disjoint,
        busy,
        counterBits: bits,
        pending: pending.length,
      };
    },
  };
}
