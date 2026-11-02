import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: 'photon-emission.spec.js',
  timeout: 420000,
  use: { ...integration.use, screenshot: 'only-on-failure' },
});
