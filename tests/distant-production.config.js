import { defineConfig } from '@playwright/test';
import reference from './photon-reference.config.js';
export default defineConfig({
  ...reference,
  testMatch: 'distant-production.spec.js',
  timeout: 480000,
});
