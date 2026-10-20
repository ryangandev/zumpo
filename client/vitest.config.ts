import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // One jsdom per worker rather than per file, each file still in its own
    // context: building a fresh jsdom for every file was a third of the run.
    pool: 'vmThreads',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // A jsdom render takes about a second at most, but several suites side by
    // side on a busy machine can starve one past the default 5 s.
    testTimeout: 15_000,
  },
});
