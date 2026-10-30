// Transparent device/method observation, enabled only by the recovery profile.
// Every intercepted call retains its original arguments, result and behaviour.
export function installRecoveryDeviceProbe() {
  let active = false,
    phase = 'idle',
    started = 0,
    interval = null,
    lastBeat = 0;
  let timeline = [],
    slow = [],
    frames = [],
    gaps = [],
    stats = {},
    phaseStats = {},
    unwatch = [];
  const shaders = new WeakMap(),
    programs = new WeakMap();
  let programId = 0,
    draws = 0;
  const at = () => performance.now() - started;
  const record = (name, t, detail) => {
    if (!active) return;
    const ms = performance.now() - t,
      group = phaseStats[phase] || (phaseStats[phase] = {});
    for (const map of [stats, group]) {
      const s = map[name] || (map[name] = { count: 0, totalMs: 0, maxMs: 0 });
      s.count++;
      s.totalMs += ms;
      s.maxMs = Math.max(s.maxMs, ms);
    }
    if (ms >= 2 && slow.length < 1500)
      slow.push({ name, phase, startMs: t - started, ms, detail });
  };
  const label = (p) => programs.get(p)?.labels?.join(' + ') || '';
  const names = [
    'compileShader',
    'linkProgram',
    'getProgramInfoLog',
    'getShaderInfoLog',
    'getProgramParameter',
    'getShaderParameter',
    'getActiveUniform',
    'getUniformLocation',
    'getAttribLocation',
    'getParameter',
    'getError',
    'deleteTexture',
    'deleteBuffer',
    'deleteProgram',
    'deleteShader',
    'texImage2D',
    'texImage3D',
    'texSubImage2D',
    'texSubImage3D',
    'texStorage2D',
    'texStorage3D',
    'bufferData',
    'bufferSubData',
    'readPixels',
    'finish',
    'clientWaitSync',
    'drawArrays',
    'drawElements',
    'drawArraysInstanced',
    'drawElementsInstanced',
  ];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = getContext.apply(this, args);
    if (
      this.id !== 'world' ||
      args[0] !== 'webgl2' ||
      !gl ||
      gl.__recoveryObserved
    )
      return gl;
    gl.__recoveryObserved = true;
    const createShader = gl.createShader.bind(gl),
      shaderSource = gl.shaderSource.bind(gl),
      createProgram = gl.createProgram.bind(gl),
      attachShader = gl.attachShader.bind(gl);
    gl.createShader = function (type) {
      const s = createShader(type);
      if (s) shaders.set(s, { type, name: '' });
      return s;
    };
    gl.shaderSource = function (shader, source) {
      const s = shaders.get(shader);
      if (s) {
        s.name = source.match(/#define SHADER_NAME (\S+)/)?.[1] || 'raw';
        s.name +=
          (source.includes('hexCloudRay(') ? '/cloud-ray' : '') +
          (source.includes('HEX_PACK_SPECULAR_OUTPUT') ? '/gbuffer' : '');
        s.length = source.length;
      }
      return shaderSource(shader, source);
    };
    gl.createProgram = function () {
      const p = createProgram();
      if (p) programs.set(p, { id: ++programId, labels: [] });
      return p;
    };
    gl.attachShader = function (p, s) {
      const meta = programs.get(p),
        shader = shaders.get(s);
      if (meta && shader)
        meta.labels.push(
          `${shader.type === gl.FRAGMENT_SHADER ? 'fragment' : 'vertex'}:${shader.name}:${shader.length}`,
        );
      return attachShader(p, s);
    };
    for (const name of names) {
      const original = gl[name].bind(gl);
      gl[name] = function (...values) {
        if (!active) return original(...values);
        const t = performance.now();
        let detail;
        if (name.startsWith('getProgram') || name === 'linkProgram')
          detail = { program: label(values[0]), parameter: values[1] };
        else if (name.startsWith('getShader') || name === 'compileShader')
          detail = shaders.get(values[0]);
        else if (typeof values[0] === 'number') detail = values[0];
        if (name.startsWith('draw')) draws++;
        try {
          return original(...values);
        } finally {
          record('gl.' + name, t, detail);
        }
      };
    }
    for (const type of ['webglcontextlost', 'webglcontextrestored']) {
      this.addEventListener(
        type,
        () => {
          if (!active) return;
          phase = type === 'webglcontextlost' ? 'lost' : 'restored';
          timeline.push({ name: type, ms: at() });
          queueMicrotask(() =>
            timeline.push({ name: type + '-handlers-complete', ms: at() }),
          );
        },
        { capture: true },
      );
    }
    return gl;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((timestamp) => {
      if (!active) return callback(timestamp);
      const t = performance.now(),
        oldDraws = draws;
      try {
        return callback(timestamp);
      } finally {
        const ms = performance.now() - t,
          n = draws - oldDraws;
        if ((n || ms >= 20) && frames.length < 500)
          frames.push({ phase, startMs: t - started, ms, draws: n });
      }
    });
  const watch = (object, key, name) => {
    const original = object[key];
    object[key] = function (...args) {
      if (!active) return original.apply(this, args);
      const t = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        record(name, t);
      }
    };
    unwatch.push(() => (object[key] = original));
  };
  const snapshot = () => ({
    phase,
    timeline,
    slow,
    frames,
    gaps,
    stats,
    phaseStats,
    elapsedMs: at(),
  });
  window.__recoveryDevice = {
    arm(g) {
      started = performance.now();
      phase = 'armed';
      timeline = [];
      slow = [];
      frames = [];
      gaps = [];
      stats = {};
      phaseStats = {};
      draws = 0;
      active = true;
      watch(g, 'setQuality', 'Graphics.setQuality');
      watch(g, 'resizeRendering', 'Graphics.resizeRendering');
      watch(g.skyEnvironment.atmosphere, 'dispose', 'SkyAtmosphere.dispose');
      watch(g.scene, 'traverse', 'Scene.traverse');
      watch(g.renderer, 'render', 'Renderer.render');
      lastBeat = performance.now();
      interval = setInterval(() => {
        const now = performance.now(),
          gap = now - lastBeat;
        if (gap > 200) gaps.push({ phase, ms: at(), gapMs: gap });
        lastBeat = now;
      }, 50);
    },
    snapshot,
    finish() {
      const result = snapshot();
      active = false;
      clearInterval(interval);
      for (const restore of unwatch) restore();
      unwatch = [];
      return result;
    },
  };
}
