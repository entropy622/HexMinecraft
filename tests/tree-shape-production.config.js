import { defineConfig } from '@playwright/test';
import reference from './photon-reference.config.js';
export default defineConfig({
  ...reference,
  testMatch: 'tree-shape-production.spec.js',
  timeout: 300000,
});
