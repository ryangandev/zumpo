import { defineConfig, devices } from '@playwright/test';

/**
 * `npm run design:compare`: drives the app into each Figma screen's state and
 * captures it beside Figma's preview. One worker and the real phase lengths,
 * so every state holds still long enough to capture and the room lists hold
 * only the rooms a screen means to show.
 */
const PORT = Number(process.env.SCREENS_PORT ?? 3320);
// Daily Word deals a room's words from this seed, so Figma's story plays the
// same every time; the screens spec reads it to know the words.
process.env.DAILY_WORD_SEED ??= 'figma';
// Code Breaker deals a room's codes the same way.
process.env.CODE_BREAKER_SEED ??= 'figma';

export default defineConfig({
  testDir: 'screens',
  workers: 1,
  reporter: 'list',
  timeout: 300_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
  },
  outputDir: '../test-results/screens',
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
      DAILY_WORD_SEED: process.env.DAILY_WORD_SEED,
      CODE_BREAKER_SEED: process.env.CODE_BREAKER_SEED,
    },
  },
});
