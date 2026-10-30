export const DEFAULT_POST_SETTINGS = {
  occlusion: 0.6,
  antialias: true,
  bloom: 0.24,
  clouds: true,
  // Photon defaults to manual EV 0; its light controller compensates the day.
  // Explicit saved choices still override this default in postSettings().
  exposure: false,
};
export function postSettings(raw) {
  const settings = { ...DEFAULT_POST_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  if (Number.isFinite(raw.occlusion))
    settings.occlusion = Math.max(0, Math.min(1, raw.occlusion));
  if (typeof raw.antialias === 'boolean') settings.antialias = raw.antialias;
  if (typeof raw.clouds === 'boolean') settings.clouds = raw.clouds;
  if (typeof raw.exposure === 'boolean') settings.exposure = raw.exposure;
  if (Number.isFinite(raw.bloom))
    settings.bloom = Math.max(0, Math.min(0.5, raw.bloom));
  return settings;
}
