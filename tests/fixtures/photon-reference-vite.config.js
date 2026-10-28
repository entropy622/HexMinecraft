import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  cacheDir: 'test-results/photon-reference-vite-cache',
  build: { target: 'es2022', chunkSizeWarningLimit: 650 },
});
