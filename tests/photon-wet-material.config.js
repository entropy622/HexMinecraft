import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: 'photon-wet-material.spec.js',
  timeout: 480000,
});
