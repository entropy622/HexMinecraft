import { defineConfig } from '@playwright/test';
import reference from './photon-reference.config.js';
export default defineConfig({
  ...reference,
  testMatch: 'photon-fog-production.spec.js',
  timeout: 360000,
});
