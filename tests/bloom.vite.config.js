import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: 'test-results/bloom-vite-cache',
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
});
