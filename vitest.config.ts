import { defineConfig } from 'vitest/config';

// Own config so Vitest does not load the Cloudflare/React Router Vite plugins.
export default defineConfig({
  test: { include: ['app/**/*.test.ts'] },
});
