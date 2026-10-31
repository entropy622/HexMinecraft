import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: ['jungle-landscape.spec.js', 'vines.spec.js'],
  timeout: 420000,
});
