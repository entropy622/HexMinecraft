import { COLOR_SETTINGS, DEFAULT_COLOR_SETTINGS } from './photon-grading.js';

export const DEFAULT_POST_SETTINGS = {
  ...DEFAULT_COLOR_SETTINGS,
  occlusion: 0.6,
  antialias: true,
  bloom: 0.24,
  clouds: true,
  // Photon defaults to manual EV 0; its light controller compensates the day.
  // Explicit saved choices still override this default in postSettings().
  exposure: false,
  sharpening: true,
  sharpness: 0.5,
  environmentReflections: true,
  skyReflections: true,
  reflectionRays: 4,
  reflectionSteps: 8,
};
export function postSettings(raw) {
  const settings = { ...DEFAULT_POST_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  if (Number.isFinite(raw.occlusion))
    settings.occlusion = Math.max(0, Math.min(1, raw.occlusion));
  if (typeof raw.antialias === 'boolean') settings.antialias = raw.antialias;
  if (typeof raw.clouds === 'boolean') settings.clouds = raw.clouds;
  if (typeof raw.exposure === 'boolean') settings.exposure = raw.exposure;
  if (typeof raw.sharpening === 'boolean') settings.sharpening = raw.sharpening;
  for (const key of ['environmentReflections', 'skyReflections'])
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  if ([1, 2, 4, 8].includes(raw.reflectionRays))
    settings.reflectionRays = raw.reflectionRays;
  if ([4, 8, 16, 32].includes(raw.reflectionSteps))
    settings.reflectionSteps = raw.reflectionSteps;
  if (Number.isFinite(raw.sharpness))
    settings.sharpness =
      Math.round(Math.max(0, Math.min(1, raw.sharpness)) * 100) / 100;
  if (Number.isFinite(raw.bloom))
    settings.bloom = Math.max(0, Math.min(0.5, raw.bloom));
  for (const [key, spec] of Object.entries(COLOR_SETTINGS))
    if (Number.isFinite(raw[key]))
      settings[key] = Number(
        (
          Math.round(
            Math.max(spec.min, Math.min(spec.max, raw[key])) / spec.step,
          ) * spec.step
        ).toFixed(4),
      );
  return settings;
}
