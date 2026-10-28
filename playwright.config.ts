import { defineConfig, devices } from '@playwright/test';

// The test reads DATABASE_URL (the same branch the app uses) from .env locally, from the job env in CI.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env in CI.
}

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  // Desktop: «Cerrar sesión» is only in the sidebar until Ajustes (B6).
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  // vite dev, not workerd: without RESEND_API_KEY it logs the code instead of emailing it.
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/entrar',
    reuseExistingServer: !process.env.CI,
  },
});
