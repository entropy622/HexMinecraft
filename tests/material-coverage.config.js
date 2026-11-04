import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: [
    'material-coverage.spec.js',
    'native-material-detail.spec.js',
    'native-surface-optics.spec.js',
  ],
  timeout: 480000,
  use: {
    ...integration.use,
    channel: 'msedge',
    viewport: { width: 1280, height: 800 },
  },
});
