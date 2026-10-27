#!/usr/bin/env node
// Checks that client/src/audio/generated/ is exactly what audio/sounds.json
// and its masters make, without the masters or ffmpeg, so CI can run it:
//
//   npm run audio:check
//
// It fails when sounds.json is invalid or names a licence other than CC0-1.0
// or own, when a sound changed without a build, and when a generated file was
// edited, added or removed by hand. See docs/architecture.md#sound.

import { checkGenerated } from './lib.mjs';

const problems = checkGenerated();
if (problems.length) {
  console.error('audio:check found the sounds out of date:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('audio:check: the generated sounds match audio/sounds.json.');
