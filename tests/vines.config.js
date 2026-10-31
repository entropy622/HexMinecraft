import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: ['vines.spec.js', 'mega-trees.spec.js'],
  timeout: 420000,
});
