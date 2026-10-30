// Photon 6e67b36 weather/core.glsl and shaders.properties. The host supplies
// absolute world seconds and biome noises. Like the source, temporal weather
// is shared; world seeds vary the biomes and spatial cloud field instead.
const clamp = (x) => Math.max(0, Math.min(1, x));
const fract = (x) => x - Math.floor(x);
const hash = (x) => {
  let p = fract(x * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
};
function noise(x) {
  const i = Math.floor(x),
    f = fract(x),
    smooth = f * f * (3 - 2 * f);
  return hash(i) * (1 - smooth) + hash(i + 1) * smooth;
}

export function photonWeather(time, biomeTemperature, biomeHumidity, rain) {
  const angle = (time / 600) * 2 * Math.PI,
    x = Math.cos(angle),
    y = (Math.sin(angle) * 78) / Math.hypot(78, 45),
    fade = y < 0.18 ? 0.37 + 1.2 * Math.max(0, -y) : 1.7,
    edge = clamp(1 - fade * Math.abs(y - 0.18)) ** 2,
    sunrise = x > 0 ? edge : 0,
    midnight = y < 0 ? 1 - edge : 0,
    golden = (1 + Math.sqrt(5)) / 2,
    speed = (0.37 * golden) / 600,
    temperature =
      (noise(time * speed + 2.5) - 0.2 * sunrise - 0.2 * midnight) *
      (1 + (clamp(biomeTemperature) - 0.6) * 0.1),
    humidity =
      (0.2 + 0.6 * noise(time * speed + 46.618)) *
        (1 + (clamp(biomeHumidity) + 0.2) * 0.1) +
      clamp(rain),
    wind = noise((time * 0.5 * golden) / 600 + 83.236) + 0.33 * clamp(rain);
  return {
    temperature: clamp(temperature),
    humidity: clamp(humidity),
    wind: clamp(wind),
  };
}
