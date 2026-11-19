import { defineConfig } from '@playwright/test';
import base from './atmosphere.playwright.config.js';

const url = 'http://127.0.0.1:5204';
export default defineConfig({
  ...base,
  testMatch: [
    'lossless-performance.spec.js',
    'water-shared.spec.js',
    'water-interface.spec.js',
    'foliage-depth.spec.js',
  ],
  timeout: 600000,
  outputDir: '../test-results/lossless-performance',
  use: {
    ...base.use,
    channel: 'msedge',
    headless: true,
    baseURL: url,
    trace: 'off',
    viewport: { width: 1366, height: 768 },
  },
  webServer: {
    ...base.webServer,
    url,
    command:
      'node node_modules/vite/bin/vite.js --config tests/hex-survival.vite.js --configLoader runner --host 127.0.0.1 --port 5204 --strictPort',
    timeout: 160000,
  },
});
