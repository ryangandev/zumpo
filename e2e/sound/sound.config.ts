import { defineConfig, devices } from '@playwright/test';

/**
 * `npm run e2e:sound`: the sound engine in real browsers, through the sound
 * lab that only the dev server has. Chromium and WebKit, since autoplay rules
 * and the decodable formats differ between them; install WebKit once with
 * `npx playwright install webkit`.
 */
const PORT = Number(process.env.SOUND_PORT ?? 3601);

export default defineConfig({
  testDir: '.',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  outputDir: '../../test-results/sound',
  webServer: {
    command: `npm run dev -w client -- --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/dev/sound`,
    reuseExistingServer: false,
    env: {
      // The lab needs no game server; point the socket where none listens,
      // so a dev server already running on 3000 is left alone.
      VITE_SOCKET_URL: `http://localhost:${PORT + 1}`,
    },
  },
});
