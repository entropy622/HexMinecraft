import { defineConfig } from 'vite';
export default defineConfig({
  cacheDir: 'test-results/survival-vite',
  server: { hmr: false },
  build: { target: 'es2022' },
});
