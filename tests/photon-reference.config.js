import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(
  root,
  process.env.PHOTON_REFERENCE_OUTPUT ||
    'test-results/photon-reference-hardware',
);
const preview = process.env.PHOTON_REFERENCE_PRODUCTION === '1';
export default defineConfig({
  testDir: '.',
  testMatch: 'photon-reference-scenes.capture.js',
  timeout: 180000,
  workers: 1,
  retries: 0,
  outputDir: resolve(output, preview ? 'production' : 'captures'),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          output,
          preview ? 'production-report.json' : 'hardware-report.json',
        ),
      },
    ],
  ],
  use: {
    channel: 'chrome',
    headless: true,
    baseURL: 'http://127.0.0.1:5191',
    viewport: { width: 900, height: 650 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
      args: [
        '--use-cmd-decoder=passthrough',
        '--use-gl=angle',
        '--use-angle=d3d11',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
      ],
    },
  },
  webServer: {
    cwd: root,
    command: `node node_modules/vite/bin/vite.js ${preview ? 'preview' : '--config tests/fixtures/photon-reference-vite.config.js --configLoader runner'} --host 127.0.0.1 --port 5191 --strictPort`,
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
