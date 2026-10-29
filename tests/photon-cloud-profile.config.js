import { defineConfig } from '@playwright/test';
import reference from './photon-reference.config.js';
import { resolve } from 'node:path';
export default defineConfig({
  ...reference,
  testMatch: 'photon-cloud-profile.capture.js',
  outputDir: resolve(
    process.env.PHOTON_REFERENCE_OUTPUT || 'test-results/cloud-profile',
    'captures',
  ),
  use: { ...reference.use, viewport: { width: 1920, height: 1080 } },
});
