import { BLOCKS, hash } from './core.js';
import { fluidHeight } from './fluids.js';

export const WEATHER = { clear: '晴朗', rain: '降雨', storm: '雷暴' };
export class Weather {
  constructor(saved = {}) {
    this.kind = saved.kind || 'clear';
    this.remaining = saved.remaining ?? 150;
    this.sequence = saved.sequence || 0;
    this.rain = saved.rain || 0;
    this.storm = saved.storm || 0;
    this.wetness = saved.wetness || 0;
  }
  set(kind, seconds = 180) {
    if (!Object.hasOwn(WEATHER, kind)) return;
    this.kind = kind;
    this.remaining = seconds;
  }
  update(dt, seed) {
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.sequence++;
      const roll = hash(this.sequence, 521, 19, seed);
      const kind =
        this.kind === 'clear' ? (roll < 0.28 ? 'storm' : 'rain') : 'clear';
      this.set(
        kind,
        (kind === 'clear' ? 180 : 100) +
          hash(this.sequence, 722, 39, seed) * 180,
      );
    }
    const approach = (value, target, speed) =>
      value + Math.max(-speed * dt, Math.min(speed * dt, target - value));
    this.rain = approach(this.rain, this.kind === 'clear' ? 0 : 1, 0.055);
    this.storm = approach(this.storm, this.kind === 'storm' ? 1 : 0, 0.035);
    this.wetness = approach(
      this.wetness,
      this.rain,
      this.rain > this.wetness ? 0.025 : 0.007,
    );
  }
  label(biome) {
    if (this.rain < 0.05)
      return this.kind === 'clear' ? '☀ 晴朗' : '☁ 云层渐厚';
    if (biome === '沙漠')
      return this.storm > 0.5 ? '☁ 雷云 · 干燥' : '☁ 阴天 · 干燥';
    if (biome === '雪原') return this.storm > 0.5 ? '❄ 暴风雪' : '❄ 降雪';
    return this.storm > 0.5
      ? 'ϟ 雷暴'
      : this.kind === 'clear'
        ? '☂ 雨势渐歇'
        : '☂ 降雨';
  }
  serialize() {
    return {
      kind: this.kind,
      remaining: this.remaining,
      sequence: this.sequence,
      rain: this.rain,
      storm: this.storm,
      wetness: this.wetness,
    };
  }
}
export function validWeather(s) {
  return (
    s &&
    Object.hasOwn(WEATHER, s.kind) &&
    Number.isFinite(s.remaining) &&
    s.remaining >= 0 &&
    s.remaining <= 3600 &&
    Number.isSafeInteger(s.sequence) &&
    s.sequence >= 0 &&
    ['rain', 'storm', 'wetness'].every(
      (k) => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1,
    )
  );
}

// One shared cache serves precipitation, shelter audio and exposed crop growth.
export class WeatherColumns {
  constructor() {
    this.cache = new Map();
    this.elapsed = 0;
  }
  update(dt, world) {
    this.elapsed += dt;
    if (world !== this.world || this.elapsed > 0.5) {
      this.world = world;
      this.cache.clear();
      this.elapsed = 0;
    }
  }
  get(world, q, r) {
    const k = q + ',' + r;
    if (!world.loaded(q, r)) return { roof: 1000, surface: 1000, biome: '' };
    if (!this.cache.has(k)) {
      let roof = -20,
        surface = -20;
      for (let y = 63; y >= 0; y--) {
        const type = world.get(q, y, r);
        if (type && !BLOCKS[type]?.nonSolid) {
          roof = y + 1;
          break;
        }
      }
      surface = roof;
      for (let y = 63; y >= Math.max(0, roof); y--) {
        const fluid = world.fluids.get(q, y, r);
        if (fluid) {
          surface = y + fluidHeight(fluid);
          break;
        }
      }
      this.cache.set(k, { roof, surface, biome: world.biome(q, r) });
    }
    return this.cache.get(k);
  }
}
