import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: 'cloud-edges.spec.js',
  timeout: 600000,
  use: { ...integration.use, viewport: { width: 1280, height: 720 } },
});
