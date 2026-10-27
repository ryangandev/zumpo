import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The design gallery (/design, development only) compares each component
// with the Figma export: its JSON and, when exported with previews, its PNG.
function figmaExport(): Plugin {
  const root = path.resolve(import.meta.dirname, '../design/figma');
  return {
    name: 'zumpo-figma-export',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__figma', (request, response, next) => {
        const file = path.join(root, decodeURIComponent(request.url ?? ''));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
          next();
          return;
        }
        response.setHeader(
          'Content-Type',
          file.endsWith('.png') ? 'image/png' : 'application/json',
        );
        fs.createReadStream(file).pipe(response);
      });
    },
  };
}

/**
 * Sounds are never inlined as `data:` URLs, however small: the engine
 * fetches them, and the Content Security Policy's `connect-src 'self'` would
 * refuse a `data:` URL. Anything else keeps Vite's default limit.
 */
export function inlineLimit(file: string): boolean | undefined {
  return /\.(m4a|webm)$/.test(file) ? false : undefined;
}

/** A test fixture's file (`test-*`, the `test` group): `assets/test-blip-1-a1B2.m4a`. */
export const isTestSound = (fileName: string) =>
  /(^|\/)test-[^/]*\.(m4a|webm)$/.test(fileName);

/**
 * The `test` group's sounds are fixtures for the development sound lab and
 * the pipeline's checks; a build that would ship one fails, so a stray import
 * of the test bank cannot reach players.
 */
export function noTestSounds(): Plugin {
  return {
    name: 'zumpo-no-test-sounds',
    apply: 'build',
    generateBundle(_, bundle) {
      const shipped = Object.keys(bundle).filter(isTestSound);
      if (shipped.length) {
        this.error(
          `The build would ship test sounds (${shipped.join(', ')}); only the development sound lab may import the test bank.`,
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), figmaExport(), noTestSounds()],
  server: {
    port: 3001,
  },
  build: {
    // The Express backend serves the built SPA as static files from
    // server/build/public, so emit directly there instead of building
    // into client/build and moving it afterwards.
    outDir: '../server/build/public',
    emptyOutDir: true,
    sourcemap: true,
    assetsInlineLimit: inlineLimit,
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app, so each ships in a
        // chunk of its own that browsers keep cached across releases.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            { name: 'router', test: /node_modules[\\/]react-router[\\/]/ },
            {
              name: 'base-ui',
              test: /node_modules[\\/](@base-ui|@floating-ui)[\\/]/,
            },
            {
              name: 'socket',
              test: /node_modules[\\/](socket\.io|engine\.io)[^\\/]*[\\/]/,
            },
          ],
        },
      },
    },
  },
});
