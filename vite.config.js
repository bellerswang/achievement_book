import { defineConfig } from 'vite';

// BASE_PATH lets the same code be served from a sub-path, e.g. GitHub Pages:
//   BASE_PATH=/achievement_book/ npm run build
// Local dev/preview keeps the default '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
