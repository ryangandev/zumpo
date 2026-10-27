import { defineConfig, devices } from '@playwright/test';

/**
 * `npm run e2e:design`: the design gallery at /design, which only the dev
 * server has, measured against the committed Figma export. CI runs it in the
 * e2e job; run it after a Figma export or a change to a component.
 */
const PORT = Number(process.env.DESIGN_PORT ?? 3790);

export default defineConfig({
  testDir: '.',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    // The gallery compares only wider than a phone, at Figma's page width.
    viewport: { width: 1440, height: 900 },
    // At 1x, Chromium on Linux hints each glyph to a whole-pixel advance
    // (ui/gfx/font_render_params_linux.cc turns subpixel positioning on only
    // above 1x), so a line of text there drifts up to 2 px from macOS and
    // Figma, which both keep fractional advances. At 2x every platform lays
    // text out as Figma does; layout sizes are in CSS pixels either way.
    deviceScaleFactor: 2,
    // Motion on, as a reviewer sees it: a specimen that animates in must
    // still measure its settled size.
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
  },
  outputDir: '../../test-results/design',
  webServer: {
    command: `npm run dev -w client -- --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/design`,
    reuseExistingServer: false,
    env: {
      // The gallery needs no game server; point the socket where none
      // listens, so a dev server already running on 3000 is left alone.
      VITE_SOCKET_URL: `http://localhost:${PORT + 1}`,
    },
  },
});
