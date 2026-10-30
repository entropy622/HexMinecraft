import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: ['material-pack.spec.js'],
  outputDir: '../test-results/material-pack',
});
