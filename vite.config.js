import { defineConfig } from 'vite';

// base './' so the built game works from any sub-path (e.g. GitHub Pages next to the wedding card).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  server: { host: true },
});
