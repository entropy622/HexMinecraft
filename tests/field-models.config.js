import { defineConfig } from '@playwright/test';
import base from './hex-survival.config.js';
export default defineConfig({
  ...base,
  testMatch: 'field-models.spec.js',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5197' },
  webServer: {
    ...base.webServer,
    url: 'http://127.0.0.1:5197',
    command:
      'node node_modules/vite/bin/vite.js --config tests/hex-survival.vite.js --configLoader runner --host 127.0.0.1 --port 5197 --strictPort',
    reuseExistingServer: false,
  },
  outputDir: '../test-results/field-models',
});
