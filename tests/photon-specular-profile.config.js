import { defineConfig } from '@playwright/test';
import profile from './photon-cloud-profile.config.js';
export default defineConfig({
  ...profile,
  testMatch: 'photon-specular-profile.capture.js',
});
