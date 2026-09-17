/** Small synthesized sound bank. No network files; audio starts on interaction. */
export class GameAudio {
  constructor() {
    this.enabled = true;
    this.volume = 0.45;
    this.context = null;
    this.events = {};
  }
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume();
    } catch {
      /* Silent fallback for unsupported browsers. */
    }
  }
  tone(
    frequency = 300,
    duration = 0.07,
    type = 'sine',
    volume = 0.06,
    delay = 0,
  ) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
    const start = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      gain = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequency, start);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(30, frequency * 0.6),
      start + duration,
    );
    gain.gain.setValueAtTime(Math.max(0.0001, volume * this.volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    o.connect(gain).connect(ctx.destination);
    o.start(start);
    o.stop(start + duration);
    o.onended = () => {
      o.disconnect();
      gain.disconnect();
    };
  }
  noise(duration = 0.07, volume = 0.1, frequency = 800) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
    const length = Math.ceil(ctx.sampleRate * duration),
      buffer = ctx.createBuffer(1, length, ctx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.value = volume * this.volume;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  play(event, material = 'grass') {
    if (!this.enabled) return;
    this.events[event] = (this.events[event] || 0) + 1;
    if (event === 'step') {
      this.noise(
        0.09,
        0.11,
        ['stone', 'brick', 'endstone', 'basalt'].includes(material)
          ? 2400
          : 650,
      );
      this.tone(material === 'wood' ? 150 : 95, 0.055, 'triangle', 0.045);
    } else if (event === 'break') {
      this.noise(0.15, 0.22, material === 'glass' ? 5500 : 1500);
      this.tone(160, 0.08, 'triangle', 0.08);
    } else if (event === 'place') {
      this.noise(0.05, 0.13, 600);
      this.tone(230, 0.05, 'triangle', 0.08);
    } else if (event === 'portal') {
      [130.81, 196, 261.63, 392].forEach((n, i) =>
        this.tone(n, 0.75, 'sine', 0.09, i * 0.09),
      );
    } else if (event === 'craft') {
      [440, 554, 659].forEach((n, i) =>
        this.tone(n, 0.15, 'triangle', 0.075, i * 0.065),
      );
    } else if (event === 'hurt') {
      this.noise(0.15, 0.18, 900);
      this.tone(85, 0.2, 'sawtooth', 0.03);
    } else if (event === 'splash') this.noise(0.23, 0.18, 3000);
    else if (event === 'ambient') {
      this.tone(
        material === 'overworld' ? 1100 : material === 'nether' ? 65 : 330,
        0.45,
        'sine',
        0.015,
      );
    } else this.tone(480, 0.04, 'triangle', 0.04);
  }
}
