import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: ['tree-shape.spec.js', 'mega-trees.spec.js'],
  timeout: 480000,
});
