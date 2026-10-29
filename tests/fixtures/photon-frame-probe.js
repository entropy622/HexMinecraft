// Observes browser/device boundaries. No renderer method or shader is replaced.
// This function is installed before the application's first requestAnimationFrame.
export function installFrameProbe() {
  let gl,
    extension,
    counterBits = 0,
    inside = false,
    draws = 0;
  let active = false,
    target = 0,
    lastTimestamp = null;
  let samples = [],
    gpu = [],
    pending = [],
    disjointEvents = 0,
    busy = 0;
  let rendered = 0;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const context = getContext.apply(this, args);
    if (this.id === 'world' && args[0] === 'webgl2' && context && !gl) {
      gl = context;
      const enableTimer = () => {
        extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        counterBits = extension
          ? gl.getQuery(
              extension.TIME_ELAPSED_EXT,
              extension.QUERY_COUNTER_BITS_EXT,
            )
          : 0;
      };
      enableTimer();
      this.addEventListener('webglcontextlost', () => {
        // Extension objects and query handles belong to the lost context.
        extension = null;
        counterBits = 0;
        active = false;
        pending = [];
        gpu = [];
      });
      this.addEventListener('webglcontextrestored', enableTimer);
      for (const name of [
        'drawArrays',
        'drawElements',
        'drawArraysInstanced',
        'drawElementsInstanced',
      ]) {
        const draw = gl[name].bind(gl);
        gl[name] = (...parameters) => {
          if (inside) draws++;
          return draw(...parameters);
        };
      }
    }
    return context;
  };
  function poll() {
    if (!extension || !counterBits) return;
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      if (active || pending.length) disjointEvents++;
      for (const { query } of pending) gl.deleteQuery(query);
      pending = [];
      gpu = [];
      return;
    }
    pending = pending.filter(({ query, index }) => {
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
      gpu.push({
        index,
        milliseconds: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
      });
      gl.deleteQuery(query);
      return false;
    });
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((timestamp) => {
      // Existing development scenario seam freezes only simulation. Real rendering,
      // including history, atmosphere settling and all production passes continues.
      if (window.__photonFreeze && window.__hexwild)
        window.__hexwild.setPlaying(false);
      poll();
      let query = null;
      if (active && extension && counterBits) {
        if (
          pending.length < 8 &&
          !gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
        ) {
          query = gl.createQuery();
          gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        } else busy++;
      }
      draws = 0;
      inside = true;
      const start = performance.now();
      try {
        callback(timestamp);
      } finally {
        const cpuSubmitMs = performance.now() - start;
        inside = false;
        if (query) gl.endQuery(extension.TIME_ELAPSED_EXT);
        if (draws) {
          rendered++;
          if (active) {
            const index = samples.length;
            samples.push({
              index,
              frameIntervalMs:
                lastTimestamp === null ? null : timestamp - lastTimestamp,
              cpuSubmitMs,
              draws,
            });
            lastTimestamp = timestamp;
            if (query) pending.push({ query, index });
            if (samples.length >= target) active = false;
          }
        } else if (query) gl.deleteQuery(query);
      }
    });
  window.__photonProbe = {
    get rendered() {
      return rendered;
    },
    start(count) {
      if (active || pending.length)
        throw Error('A frame measurement is already pending');
      if (extension) gl.getParameter(extension.GPU_DISJOINT_EXT);
      samples = [];
      gpu = [];
      disjointEvents = 0;
      busy = 0;
      lastTimestamp = null;
      target = count;
      active = true;
    },
    stop() {
      active = false;
      for (const { query } of pending) gl.deleteQuery(query);
      pending = [];
    },
    get done() {
      return !active && samples.length === target && pending.length === 0;
    },
    result() {
      return {
        extension: !!extension,
        counterBits,
        disjointEvents,
        busy,
        pendingQueries: pending.length,
        samples,
        gpu,
      };
    },
  };
}
