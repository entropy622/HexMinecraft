import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: ['atmosphere.spec.js'],
  timeout: 240000,
  workers: 1,
  outputDir: '../test-results/atmosphere-runs',
  reporter: 'list',
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 900, height: 650 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-cmd-decoder=passthrough',
        '--use-gl=angle',
        '--use-angle=d3d11',
      ],
      ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command:
      'node node_modules/vite/bin/vite.js --config tests/atmosphere.vite.config.js',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
  },
});
