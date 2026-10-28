import { defineConfig } from '@playwright/test';
import atmosphere from './atmosphere.playwright.config.js';

// Sequential real-GPU integration; never reuse the user's running game server.
export default defineConfig({
  ...atmosphere,
  testMatch: [
    'cloud-sky.spec.js',
    'cloud-layers.spec.js',
    'clouds.spec.js',
    'cloud-history.spec.js',
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
