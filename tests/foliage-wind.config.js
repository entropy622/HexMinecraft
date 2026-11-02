import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: 'foliage-wind.spec.js',
  timeout: 480000,
  use: { ...integration.use, viewport: { width: 900, height: 650 } },
});
