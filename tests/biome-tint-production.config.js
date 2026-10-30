import { defineConfig } from '@playwright/test';
import reference from './photon-reference.config.js';
export default defineConfig({
  ...reference,
  testMatch: 'biome-tint-production.spec.js',
  timeout: 300000,
});
