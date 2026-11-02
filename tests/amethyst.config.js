import { defineConfig } from '@playwright/test';
import integration from './photon-integration.config.js';
export default defineConfig({
  ...integration,
  testMatch: ['amethyst.spec.js', 'amethyst-render.spec.js'],
  timeout: 600000,
  use: { ...integration.use, screenshot: 'only-on-failure' },
});
