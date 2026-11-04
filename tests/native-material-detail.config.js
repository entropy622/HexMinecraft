import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: ['native-material-detail.spec.js', 'material-pack.spec.js'],
  timeout: 480000,
  use: { ...integration.use, viewport: { width: 1280, height: 800 } },
});
