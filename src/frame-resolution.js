const scales = [1, 0.85, 0.75, 0.625];

export class FrameResolution {
  constructor(gl) {
    this.gl = gl;
    this.reset();
  }
  reset() {
    const gl = this.gl;
    clearTimeout(this.pollTimer);
    if (!gl.isContextLost()) {
      if (this.pending) gl.deleteQuery(this.pending);
      if (this.fence) gl.deleteSync(this.fence);
    }
    this.fence = this.pending = this.sample = null;
    this.index = this.next = this.since = this.direction = this.streak = 0;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (
      this.ext &&
      !gl.getQuery(this.ext.TIME_ELAPSED_EXT, this.ext.QUERY_COUNTER_BITS_EXT)
    )
      this.ext = null;
  }
  get scale() {
    return scales[this.index];
  }
  adapt(now, low, high) {
    const direction =
      low > 15.5 && this.index < scales.length - 1
        ? 1
        : this.index > 0 &&
            high * (scales[this.index - 1] / this.scale) ** 2 < 12
          ? -1
          : 0;
    if (direction !== this.direction) {
      this.direction = direction;
      this.since = now;
      this.streak = 0;
    }
    this.streak++;
    if (
      !direction ||
      this.streak < 3 ||
      now - this.since < (direction > 0 ? 1000 : 5000)
    )
      return false;
    this.index += direction;
    this.direction = 0;
    this.next = now + 1200;
    return true;
  }
  begin(now, resize) {
    if (now < this.next) return false;
    const gl = this.gl,
      ext = this.ext;
    if (ext) {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        if (this.pending) gl.deleteQuery(this.pending);
        this.pending = null;
        this.direction = 0;
        this.next = now + 250;
        return false;
      }
      if (this.pending) {
        if (!gl.getQueryParameter(this.pending, gl.QUERY_RESULT_AVAILABLE))
          return false;
        const ms = gl.getQueryParameter(this.pending, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(this.pending);
        this.pending = null;
        this.sample = [ms, ms];
      }
    } else if (this.fence) return false;
    if (this.sample) {
      const changed = this.adapt(now, ...this.sample);
      this.sample = null;
      if (changed) {
        resize();
        return false;
      }
    }
    if (ext) {
      if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return false;
      this.pending = gl.createQuery();
      if (!this.pending) return false;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, this.pending);
    }
    this.next = now + 100;
    return true;
  }
  end() {
    const gl = this.gl;
    if (this.ext) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      return;
    }
    // Some normal browser configurations withhold exact GPU timers. A fence
    // brackets outstanding GPU work. A delayed JS callback can only enlarge
    // the upper bound; only a still-unsignalled fence can justify reducing size.
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!this.fence) return;
    gl.flush();
    const start = performance.now();
    let low = 0;
    const poll = () => {
      const elapsed = performance.now() - start;
      const status = gl.clientWaitSync(this.fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) {
        low = elapsed;
        this.pollTimer = setTimeout(poll, 3);
        return;
      }
      gl.deleteSync(this.fence);
      this.fence = null;
      if (status !== gl.WAIT_FAILED) this.sample = [low, elapsed];
    };
    this.pollTimer = setTimeout(poll, 3);
  }
}
