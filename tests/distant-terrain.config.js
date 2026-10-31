import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: 'distant-terrain.spec.js',
  timeout: 720000,
});
