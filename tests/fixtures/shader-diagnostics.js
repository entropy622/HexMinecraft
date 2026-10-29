// Observe the native GPU boundary before Three deletes its linked shader
// handles. Reading deleted handles afterwards generates INVALID_OPERATION.
(() => {
  const getContext = HTMLCanvasElement.prototype.getContext,
    wrapped = new WeakSet(),
    records = [];
  Object.defineProperty(window, '__skyShaderDiagnostics', {
    get: () =>
      records.map(({ gl, program, capture }) => ({
        ...capture,
        log: gl.isProgram(program)
          ? gl.getProgramInfoLog(program)
          : capture.log,
      })),
  });
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = getContext.apply(this, args);
    if (this.id !== 'world' || args[0] !== 'webgl2' || !gl || wrapped.has(gl))
      return gl;
    wrapped.add(gl);
    const link = gl.linkProgram.bind(gl),
      translated = gl.getExtension('WEBGL_debug_shaders');
    gl.linkProgram = (program) => {
      link(program);
      const attached = gl.getAttachedShaders(program),
        sources = attached.map((shader) => gl.getShaderSource(shader));
      // ANGLE may finish the backend variant later than linkProgram. Keep its
      // translation while handles are live, and query the program log at export.
      if (
        !sources.some((source) =>
          source.includes('SHADER_NAME SkySHProjection'),
        )
      )
        return;
      const linked = gl.getProgramParameter(program, gl.LINK_STATUS),
        log = gl.getProgramInfoLog(program);
      const shaders = attached.map((shader, index) => ({
        type: gl.getShaderParameter(shader, gl.SHADER_TYPE),
        source: sources[index],
        translated: translated
          ? translated.getTranslatedShaderSource(shader)
          : null,
      }));
      records.push({ gl, program, capture: { linked, log, shaders } });
    };
    return gl;
  };
})();
