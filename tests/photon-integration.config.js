import { defineConfig } from '@playwright/test';
import atmosphere from './atmosphere.playwright.config.js';

// Sequential real-GPU integration; never reuse the user's running game server.
export default defineConfig({
  ...atmosphere,
  testMatch: [
    'photon-sky.spec.js',
    'plant-lighting.spec.js',
    'foliage-depth.spec.js',
    'leaf-range.spec.js',
    'leaf-sheen.spec.js',
    'leaf-ambient.spec.js',
    'surface-indirect.spec.js',
    'glass-transmission.spec.js',
    'air-transport.spec.js',
    'material-shading.spec.js',
    'foliage-transmission.spec.js',
    'cloud-sky.spec.js',
    'cloud-scattering.spec.js',
    'cloud-coverage.spec.js',
    'cloud-layers.spec.js',
    'clouds.spec.js',
    'cloud-history.spec.js',
    'soft-shadows.spec.js',
    'atmosphere.spec.js',
    'colored-shafts.spec.js',
    'dimensions.spec.js',
    'dripstone.spec.js',
    'grass-ecology.spec.js',
    'cactus-ecology.spec.js',
    'caustics.spec.js',
  ],
  outputDir: '../test-results/photon-integration',
  use: { ...atmosphere.use, headless: true, baseURL: 'http://127.0.0.1:5193' },
  webServer: {
    ...atmosphere.webServer,
    command:
      'node node_modules/vite/bin/vite.js --config tests/fixtures/photon-reference-vite.config.js --configLoader runner --host 127.0.0.1 --port 5193 --strictPort',
    url: 'http://127.0.0.1:5193',
  },
});
