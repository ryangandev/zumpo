import { defineConfig, devices } from '@playwright/test';

/**
 * The production build, served by one server on a port of its own, as a
 * player meets it. Reveals are short so a whole game fits in a test; the
 * windows players act in keep their real lengths.
 */
const PORT = Number(process.env.E2E_PORT ?? 3310);

export default defineConfig({
  testDir: '.',
  // The Figma comparison and the sound check have configs of their own.
  testIgnore: ['screens/**', 'sound/**'],
  // Every test makes its own rooms, so tests share the server safely.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // A folder of its own beside sound/ and screens/: Playwright empties its
  // output folder when a run starts, which would wipe another run's traces.
  outputDir: '../test-results/e2e',
  webServer: {
    command: 'node server/build/server/server.js',
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      // Every player in a run is this one machine.
      PER_ADDRESS_LIMITS: 'off',
      REVIEW_SECONDS: '1',
      MINESWEEPER_REVEAL_SECONDS: '0.5',
      MAKE24_REVEAL_SECONDS: '0.5',
      PAIRS_SHOW_SECONDS: '1',
      TRIOS_TAKEN_SECONDS: '0.5',
      SNAP_TAKEN_SECONDS: '0.5',
      LIARS_DICE_REVEAL_SECONDS: '2',
      HUSH_COUNTDOWN_SECONDS: '1',
      HUSH_MISTAKE_SECONDS: '1',
      HUSH_CLEARED_SECONDS: '1',
      DAILY_WORD_REVEAL_SECONDS: '1',
      CODE_BREAKER_REVEAL_SECONDS: '1',
      DC_PASSING_SECONDS: '1',
    },
  },
});
