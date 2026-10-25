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
  weather(intensity, sheltered, snow, active) {
    const ctx = this.context;
    if (!ctx) return;
    const level =
      this.enabled && active
        ? intensity * this.volume * (snow ? 0.07 : 0.12) * (sheltered ? 0.2 : 1)
        : 0;
    if (!this.rainSound && level > 0) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = 'lowpass';
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
      this.rainSound = { source, filter, gain };
    }
    if (this.rainSound) {
      this.rainSound.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.15);
      this.rainSound.filter.frequency.setTargetAtTime(
        sheltered ? 420 : snow ? 650 : 3200,
        ctx.currentTime,
        0.2,
      );
    }
  }
  thunder(sheltered = false) {
    this.noise(3.2, sheltered ? 0.11 : 0.22, 280);
    this.tone(54, 1.8, 'sine', sheltered ? 0.025 : 0.055);
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
    } else if (event === 'chestOpen' || event === 'chestClose') {
      this.noise(0.16, 0.09, 390);
      this.tone(event === 'chestOpen' ? 180 : 110, 0.14, 'triangle', 0.06);
    } else if (event === 'doorOpen' || event === 'doorClose') {
      this.noise(0.09, 0.08, 480);
      this.tone(event === 'doorOpen' ? 190 : 125, 0.12, 'triangle', 0.05);
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
