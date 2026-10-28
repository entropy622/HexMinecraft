import { isGlass } from './dye-data.js';
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
    } else if (event === 'dig') {
      const wood = /wood|plank|door|fence|gate|chest|workbench|ladder/i.test(
        material,
      );
      const soft = /grass|dirt|sand|gravel|snow|leaves|hay/i.test(material);
      this.noise(0.055, soft ? 0.055 : 0.075, wood ? 650 : soft ? 1100 : 2600);
      this.tone(wood ? 155 : soft ? 100 : 220, 0.035, 'triangle', 0.025);
    } else if (event === 'break') {
      this.noise(0.15, 0.22, isGlass(material) ? 5500 : 1500);
      this.tone(160, 0.08, 'triangle', 0.08);
    } else if (event === 'campfireCrackle') {
      this.noise(0.09, 0.035, 1600);
      this.tone(95 + Math.random() * 75, 0.035, 'triangle', 0.025);
    } else if (event === 'campfireIgnite') {
      this.noise(0.22, 0.1, 2100);
      this.tone(280, 0.12, 'triangle', 0.04);
    } else if (event === 'campfireOut') {
      this.noise(0.35, 0.1, 3300);
    } else if (event === 'campfireCook') {
      this.noise(0.11, 0.055, 2600);
      this.tone(620, 0.08, 'triangle', 0.035);
    } else if (event === 'strip') {
      this.noise(0.19, 0.16, 1800);
      this.tone(145, 0.08, 'triangle', 0.055);
    } else if (event === 'place') {
      this.noise(0.05, 0.13, 600);
      this.tone(230, 0.05, 'triangle', 0.08);
    } else if (event === 'chestOpen' || event === 'chestClose') {
      this.noise(0.16, 0.09, 390);
      this.tone(event === 'chestOpen' ? 180 : 110, 0.14, 'triangle', 0.06);
    } else if (event === 'doorOpen' || event === 'doorClose') {
      this.noise(0.09, 0.08, 480);
      this.tone(event === 'doorOpen' ? 190 : 125, 0.12, 'triangle', 0.05);
    } else if (event === 'shulkerOpen' || event === 'shulkerClose') {
      this.noise(0.16, 0.065, 500);
      this.tone(event === 'shulkerOpen' ? 265 : 160, 0.18, 'triangle', 0.04);
    } else if (event === 'shulkerShoot') {
      this.tone(390, 0.13, 'sine', 0.05);
      this.tone(690, 0.12, 'triangle', 0.03, 0.04);
    } else if (event === 'shulkerPop') {
      this.noise(0.1, 0.06, 2300);
      this.tone(790, 0.08, 'sine', 0.025);
    } else if (event === 'shulkerBlock') {
      this.noise(0.07, 0.07, 850);
      this.tone(280, 0.1, 'triangle', 0.055);
    } else if (event === 'elytraOpen') {
      this.noise(0.2, 0.07, 2100);
    } else if (event === 'glideWind') {
      this.noise(0.26, 0.025, 1300);
    } else if (event === 'rocket') {
      this.noise(0.3, 0.1, 1900);
      this.tone(480, 0.13, 'sine', 0.025);
    } else if (event === 'fireworkBurst') {
      this.noise(0.3, 0.1, 2700);
      this.tone(720, 0.17, 'sine', 0.035);
    } else if (event === 'throw') {
      this.noise(0.09, 0.09, 1800);
      this.tone(240 + Math.random() * 65, 0.07, 'triangle', 0.04);
    } else if (event === 'snowImpact' || event === 'eggImpact') {
      this.noise(0.12, 0.11, event === 'snowImpact' ? 2400 : 1100);
    } else if (['dragonRoar', 'dragonDeath', 'dragonSummon'].includes(event)) {
      this.noise(event === 'dragonDeath' ? 2.0 : 0.9, 0.12, 390);
      [55, 83, 124].forEach((n, i) =>
        this.tone(n, 0.85, 'sawtooth', 0.018, i * 0.07),
      );
    } else if (event === 'dragonBreath') {
      this.noise(0.5, 0.08, 1800);
      this.tone(180, 0.3, 'triangle', 0.035);
    } else if (event === 'dragonHurt') {
      this.noise(0.2, 0.09, 700);
      this.tone(130, 0.18, 'sawtooth', 0.02);
    } else if (event === 'endermanAngry') {
      this.noise(0.55, 0.07, 550);
      [95, 143, 205].forEach((n, i) =>
        this.tone(n, 0.55 - i * 0.1, 'sawtooth', 0.016, i * 0.03),
      );
    } else if (event === 'endermanTeleport') {
      this.noise(0.16, 0.065, 1600);
      this.tone(380, 0.16, 'sine', 0.045);
      this.tone(170, 0.2, 'sine', 0.04, 0.07);
    } else if (event === 'pearlTeleport') {
      this.noise(0.28, 0.08, 850);
      [440, 220, 110].forEach((n, i) =>
        this.tone(n, 0.18, 'sine', 0.06, i * 0.04),
      );
    } else if (event === 'portal') {
      [130.81, 196, 261.63, 392].forEach((n, i) =>
        this.tone(n, 0.75, 'sine', 0.09, i * 0.09),
      );
    } else if (event === 'craft') {
      [440, 554, 659].forEach((n, i) =>
        this.tone(n, 0.15, 'triangle', 0.075, i * 0.065),
      );
    } else if (event === 'anvil' || event === 'anvilBreak') {
      this.noise(event === 'anvilBreak' ? 0.55 : 0.08, 0.16, 2400);
      [660, 1130, 1740].forEach((n, i) =>
        this.tone(n, 0.45 - i * 0.09, 'sine', 0.055 - i * 0.012),
      );
    } else if (event === 'grindstone') {
      this.noise(0.6, 0.14, 1500);
      this.tone(230, 0.35, 'triangle', 0.035);
    } else if (event === 'brew') {
      this.noise(0.3, 0.07, 480);
      [440, 660, 880].forEach((n, i) =>
        this.tone(n, 0.25, 'sine', 0.05, i * 0.08),
      );
    } else if (event === 'xp') {
      this.tone(720 + Math.random() * 280, 0.1, 'sine', 0.045);
    } else if (event === 'levelUp') {
      [523, 659, 784].forEach((n, i) =>
        this.tone(n, 0.24, 'sine', 0.075, i * 0.09),
      );
    } else if (event === 'enchant') {
      [392, 523, 659, 988].forEach((n, i) =>
        this.tone(n, 0.4, 'sine', 0.065, i * 0.07),
      );
    } else if (event === 'shieldBlock') {
      this.noise(0.11, 0.17, 650);
      this.tone(170, 0.09, 'triangle', 0.07);
      this.tone(510, 0.05, 'sine', 0.04);
    } else if (event === 'eat') {
      this.noise(0.08, 0.09, 1800);
    } else if (event === 'drink') {
      this.noise(0.13, 0.07, 380);
      this.tone(260, 0.07, 'sine', 0.025);
    } else if (event === 'drown') {
      this.noise(0.3, 0.15, 340);
      this.tone(78, 0.25, 'sine', 0.04);
    } else if (event === 'hurt') {
      this.noise(0.15, 0.18, 900);
      this.tone(85, 0.2, 'sawtooth', 0.03);
    } else if (event === 'ghastCharge') {
      this.tone(180, 0.6, 'sine', 0.035);
      this.tone(260, 0.5, 'triangle', 0.02, 0.1);
    } else if (event === 'blazeCharge') {
      this.noise(0.28, 0.08, 1250);
      this.tone(330, 0.22, 'sawtooth', 0.018);
    } else if (event === 'ghastFire' || event === 'blazeFire') {
      this.noise(event === 'ghastFire' ? 0.4 : 0.12, 0.11, 850);
      this.tone(event === 'ghastFire' ? 110 : 390, 0.15, 'triangle', 0.04);
    } else if (event === 'fireballDeflect') {
      this.noise(0.13, 0.12, 1750);
      this.tone(720, 0.13, 'sine', 0.06);
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
