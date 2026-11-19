import { defineConfig } from '@playwright/test';
import base from './material-coverage.config.js';
const url = 'http://127.0.0.1:5195';
export default defineConfig({
  ...base,
  testMatch: 'hex-survival.spec.js',
  outputDir: '../test-results/hex-survival',
  use: {
    ...base.use,
    trace: 'off',
    actionTimeout: 25000,
    baseURL: url,
    viewport: { width: 1366, height: 768 },
  },
  webServer: {
    ...base.webServer,
    command:
      'node node_modules/vite/bin/vite.js --config tests/hex-survival.vite.js --configLoader runner --host 127.0.0.1 --port 5195 --strictPort',
    url,
    timeout: 160000,
  },
});
