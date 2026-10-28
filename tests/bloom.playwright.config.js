import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'bloom.spec.js',
  timeout: 180000,
  workers: 1,
  outputDir: '../test-results/bloom-runs',
  reporter: 'list',
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 640, height: 480 },
    deviceScaleFactor: 1,
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
      'node node_modules/vite/bin/vite.js --config tests/bloom.vite.config.js',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
  },
});
