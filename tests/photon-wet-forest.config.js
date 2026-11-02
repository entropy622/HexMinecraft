import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: 'photon-wet-forest.capture.js',
  timeout: 600000,
  use: { ...integration.use, viewport: { width: 1920, height: 1080 } },
});
