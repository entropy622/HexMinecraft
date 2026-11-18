import { defineConfig } from '@playwright/test';
import base from './material-coverage.config.js';

export default defineConfig({
  ...base,
  testMatch: [
    'canopy-light.spec.js',
    'forest-depth.spec.js',
    'foliage-wind.spec.js',
    'temporal.spec.js',
    'air-transport.spec.js',
    'soft-shadows.spec.js',
    'native-surface-optics.spec.js',
    'native-material-detail.spec.js',
  ],
  expect: { timeout: 120000 },
  webServer: { ...base.webServer, timeout: 120000 },
});
