import { defineConfig } from '@playwright/test';
import reference from './photon-reference.config.js';
export default defineConfig({
  ...reference,
  testMatch: 'sky-cloud-production.spec.js',
  timeout: 300000,
});
