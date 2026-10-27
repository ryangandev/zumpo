// The sound pipeline's own tests, run by `npm test` with node:test. The
// check needs nothing; the build needs ffmpeg with aac_at (macOS), so its
// tests are skipped elsewhere, CI included.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildAudio, BuildError } from './build.mjs';
import {
  checkGenerated,
  fileSha256,
  mastersRoot,
  readJson,
  renderModules,
  REPO,
  repoPaths,
  serializeManifest,
  validateSounds,
} from './lib.mjs';

const schema = readJson(repoPaths().schema);
const temps = [];

function temp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zumpo-audio-test-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A copy of this repository's sounds: sounds.json, schema and generated. */
function copyOfRepo() {
  const repo = temp();
  const real = repoPaths(REPO);
  const copy = repoPaths(repo);
  fs.mkdirSync(path.dirname(copy.sounds), { recursive: true });
  fs.copyFileSync(real.sounds, copy.sounds);
  fs.copyFileSync(real.schema, copy.schema);
  fs.cpSync(real.outDir, copy.outDir, { recursive: true });
  return { repo, paths: copy };
}

function editJson(file, change) {
  const value = readJson(file);
  change(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const sound = (over = {}) => ({
  id: 'tap',
  group: 'ui',
  loudness: 'ui',
  gainDb: 0,
  variants: [{ file: 'masters/tap/1.wav', sha256: 'a'.repeat(64) }],
  origin: { kind: 'synth', source: 'test', license: 'own' },
  ...over,
});

const validateOrigin = (origin) =>
  validateSounds({ sounds: [sound({ origin })] }, schema);

describe('validateSounds', () => {
  it('accepts a complete sound', () => {
    assert.deepEqual(validateSounds({ sounds: [sound()] }, schema), []);
  });

  it('names unknown fields, missing ones and bad values plainly', () => {
    const problems = validateSounds(
      {
        sounds: [
          { ...sound({ gainDb: 40, group: 'arcade' }), volume: 1 },
          { ...sound({ id: 'Bad Id' }), origin: undefined },
        ],
      },
      schema,
    );
    assert.ok(
      problems.includes(
        'audio/sounds.json: sounds[0] (tap) has an unknown field "volume"',
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.startsWith(
          'audio/sounds.json: sounds[0] (tap).group must be one of "ui"',
        ),
      ),
    );
    assert.ok(
      problems.includes(
        'audio/sounds.json: sounds[0] (tap).gainDb must be <= 6',
      ),
    );
    assert.ok(
      problems.includes(
        'audio/sounds.json: sounds[1] (Bad Id) is missing "origin"',
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.startsWith(
          'audio/sounds.json: sounds[1] (Bad Id).id must match pattern',
        ),
      ),
    );
  });

  it('allows only CC0 downloads, with their address, and our own sounds', () => {
    assert.deepEqual(
      validateOrigin({
        kind: 'cc0',
        source: 'Kenney',
        url: 'https://kenney.nl/assets/ui-audio',
        license: 'CC0-1.0',
      }),
      [],
    );
    assert.ok(
      validateOrigin({
        kind: 'cc0',
        source: 'Kenney',
        license: 'CC0-1.0',
      }).includes('audio/sounds.json: sounds[0] (tap).origin is missing "url"'),
    );
    assert.ok(
      validateOrigin({
        kind: 'cc0',
        source: 'Someone',
        url: 'https://example.com',
        license: 'own',
      }).includes(
        'audio/sounds.json: sounds[0] (tap).origin.license must be "CC0-1.0"',
      ),
    );
    assert.ok(
      validateOrigin({
        kind: 'foley',
        source: 'Ryan',
        license: 'CC-BY-4.0',
      }).some((p) =>
        p.startsWith(
          'audio/sounds.json: sounds[0] (tap).origin.license must be "own"',
        ),
      ),
    );
  });

  it('keeps each master under its own id, once', () => {
    const problems = validateSounds(
      {
        sounds: [
          sound({
            variants: [
              { file: 'masters/other/1.wav', sha256: 'a'.repeat(64) },
              { file: 'masters/other/1.wav', sha256: 'a'.repeat(64) },
            ],
          }),
          sound(),
        ],
      },
      schema,
    );
    assert.deepEqual(problems, [
      'audio/sounds.json: tap: masters/other/1.wav is not under masters/tap/',
      'audio/sounds.json: tap: masters/other/1.wav is not under masters/tap/',
      'audio/sounds.json: tap: masters/other/1.wav is listed twice',
      'audio/sounds.json: tap is declared twice',
    ]);
  });
});

describe('checkGenerated', () => {
  it('passes on the repository as committed', () => {
    assert.deepEqual(checkGenerated(REPO), []);
  });

  it('fails when a sound changed in sounds.json without a build', () => {
    const { repo, paths } = copyOfRepo();
    editJson(paths.sounds, (doc) => {
      doc.sounds[0].gainDb = -3;
    });
    const [problem] = checkGenerated(repo);
    assert.match(
      problem,
      /changed in sounds.json since it was built \(gainDb\)/,
    );
    assert.match(problem, /npm run audio:build/);
  });

  it('fails when a sound is declared but not built, or built but not declared', () => {
    const { repo, paths } = copyOfRepo();
    editJson(paths.sounds, (doc) => {
      doc.sounds[0].id = 'test-renamed';
      for (const v of doc.sounds[0].variants) {
        v.file = v.file.replace('test-blip', 'test-renamed');
      }
    });
    const problems = checkGenerated(repo);
    assert.ok(
      problems.some((p) =>
        p.includes('"test-renamed" is in sounds.json but was never built'),
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.includes('"test-blip" was built but is not in sounds.json'),
      ),
    );
  });

  it('fails when a generated file was edited, removed or added by hand', () => {
    const { repo, paths } = copyOfRepo();
    const [first, second] = fs.readdirSync(paths.filesDir).toSorted();
    fs.appendFileSync(path.join(paths.filesDir, first), 'x');
    fs.rmSync(path.join(paths.filesDir, second));
    fs.writeFileSync(path.join(paths.filesDir, 'stray.m4a'), 'x');
    const problems = checkGenerated(repo);
    assert.ok(
      problems.some((p) =>
        p.includes(`generated/files/${first} differs from the build`),
      ),
    );
    assert.ok(
      problems.some((p) => p.includes(`generated/files/${second} is missing`)),
    );
    assert.ok(
      problems.some((p) =>
        p.includes('generated/files/stray.m4a is not in the manifest'),
      ),
    );
  });

  it('fails when the manifest lost a variant that sounds.json declares', () => {
    // As a hand edit would leave it: the variant, its files and its module
    // entry all gone, consistently.
    const { repo, paths } = copyOfRepo();
    const manifest = JSON.parse(fs.readFileSync(paths.manifest, 'utf8'));
    const [id, built] = Object.entries(manifest.sounds)[0];
    const [, dropped] = built.variants;
    built.variants = built.variants.slice(0, 1);
    fs.writeFileSync(paths.manifest, serializeManifest(manifest));
    for (const format of ['m4a', 'webm']) {
      fs.rmSync(path.join(paths.filesDir, dropped.files[format].file));
    }
    for (const [name, content] of renderModules(manifest)) {
      fs.writeFileSync(path.join(paths.outDir, name), content);
    }
    assert.deepEqual(checkGenerated(repo), [
      `"${id}" was built from other masters than sounds.json declares. Run \`npm run audio:build\` where the masters are (ZUMPO_AUDIO_DIR), and commit what it writes.`,
    ]);
  });

  it('fails when a generated module is stale or stray', () => {
    const { repo, paths } = copyOfRepo();
    fs.appendFileSync(path.join(paths.outDir, 'index.ts'), '// edited\n');
    fs.writeFileSync(path.join(paths.outDir, 'snap.ts'), 'export {};\n');
    const problems = checkGenerated(repo);
    assert.ok(
      problems.some((p) =>
        p.includes('generated/index.ts is not what the manifest makes'),
      ),
    );
    assert.ok(
      problems.some((p) =>
        p.includes('generated/snap.ts is not a module the build writes'),
      ),
    );
  });

  it('fails without a manifest, and on an invalid sounds.json', () => {
    const { repo, paths } = copyOfRepo();
    fs.rmSync(paths.manifest);
    assert.match(checkGenerated(repo)[0], /manifest.json is missing/);
    editJson(paths.sounds, (doc) => {
      doc.sounds[0].origin.license = 'CC-BY-4.0';
    });
    assert.match(checkGenerated(repo)[0], /origin.license must be "own"/);
  });
});

describe('mastersRoot', () => {
  it('is ZUMPO_AUDIO_DIR, with ~ for home, or the Documents folder', () => {
    assert.equal(
      mastersRoot({}),
      path.join(os.homedir(), 'Documents/assets/zumpo-audio'),
    );
    assert.equal(
      mastersRoot({ ZUMPO_AUDIO_DIR: '~/sounds' }),
      path.join(os.homedir(), 'sounds'),
    );
    assert.equal(mastersRoot({ ZUMPO_AUDIO_DIR: '/srv/a' }), '/srv/a');
  });
});

const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], {
  encoding: 'utf8',
});
const canEncode =
  ffmpeg.status === 0 &&
  / aac_at /.test(ffmpeg.stdout) &&
  / libopus /.test(ffmpeg.stdout);

/** A master made by ffmpeg from an aevalsrc expression. */
function master(root, file, expression, seconds, rate = 48000) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc='${expression}':s=${rate}:d=${seconds}`,
    '-c:a',
    'pcm_s24le',
    full,
  ]);
  assert.equal(result.status, 0, result.stderr?.toString());
  return fileSha256(full);
}

const BLIP = '0.5*sin(2*PI*660*t)*exp(-t*20)*min(1,t/0.004)';

/** A repository and a masters folder of their own, with these sounds. */
function project(sounds) {
  const repo = temp();
  const root = temp();
  const paths = repoPaths(repo);
  fs.mkdirSync(path.dirname(paths.sounds), { recursive: true });
  fs.copyFileSync(repoPaths().schema, paths.schema);
  const write = (list) =>
    fs.writeFileSync(paths.sounds, JSON.stringify({ sounds: list }, null, 2));
  write(sounds(root));
  return { repo, root, paths, write };
}

describe(
  'buildAudio',
  { skip: !canEncode && 'needs ffmpeg with aac_at and libopus' },
  () => {
    it('normalises, encodes both formats, and keeps what did not change', () => {
      const { repo, root, paths, write } = project((dir) => [
        sound({
          variants: [
            {
              file: 'masters/tap/1.wav',
              sha256: master(dir, 'masters/tap/1.wav', BLIP, 0.2),
            },
          ],
        }),
      ]);
      const first = buildAudio({ repo, root });
      const [variant] = first.manifest.sounds.tap.variants;
      assert.equal(variant.frames, 9600);
      assert.ok(Math.abs(variant.loudness.momentaryMax - -22) < 0.5);
      assert.ok(variant.loudness.truePeak.m4a <= -1);
      assert.ok(variant.loudness.truePeak.webm <= -1);
      assert.deepEqual(fs.readdirSync(paths.filesDir).toSorted(), [
        'tap-1.m4a',
        'tap-1.webm',
      ]);
      assert.deepEqual(checkGenerated(repo), []);

      // A runtime field changes: no masters, no encoding, the same files.
      fs.rmSync(path.join(root, 'masters'), { recursive: true });
      const doc = readJson(paths.sounds);
      doc.sounds[0].gainDb = -4;
      write(doc.sounds);
      assert.notDeepEqual(checkGenerated(repo), []);
      const second = buildAudio({ repo, root });
      assert.deepEqual(second.report, ['kept     tap masters/tap/1.wav']);
      assert.deepEqual(checkGenerated(repo), []);
      assert.match(
        fs.readFileSync(path.join(paths.outDir, 'ui.ts'), 'utf8'),
        /gainDb: -4,/,
      );
    });

    it('holds a peaky sound under its true-peak ceiling and says so', () => {
      const { repo, root } = project((dir) => [
        sound({
          loudness: 'event',
          variants: [
            {
              file: 'masters/tap/1.wav',
              // A 3 ms click: loud peaks, little loudness.
              sha256: master(
                dir,
                'masters/tap/1.wav',
                '0.9*sin(2*PI*2000*t)*lt(t,0.003)',
                0.1,
              ),
            },
          ],
        }),
      ]);
      const { manifest, warnings } = buildAudio({ repo, root });
      const [variant] = manifest.sounds.tap.variants;
      assert.ok(variant.loudness.truePeak.m4a <= -1);
      assert.ok(variant.loudness.truePeak.webm <= -1);
      assert.match(warnings[0], /under its target, held back by its true peak/);
    });

    it('refuses a master that is too long, untrimmed, not 48 kHz or changed', () => {
      const cases = [
        [
          'a ui sound of 1.5 s',
          (root) => master(root, 'masters/tap/1.wav', BLIP, 1.5),
          /is 1.50 s; a ui sound is at most 1 s/,
        ],
        [
          '0.1 s of silence first',
          (root) =>
            master(
              root,
              'masters/tap/1.wav',
              `${BLIP.replaceAll('t', '(t-0.1)').replace('exp', 'gt(t,0.1)*exp')}`,
              0.3,
            ),
          /starts after 0.1\d\d s of silence/,
        ],
        [
          '44.1 kHz',
          (root) => master(root, 'masters/tap/1.wav', BLIP, 0.2, 44100),
          /masters are 48 kHz WAV/,
        ],
        [
          'a master edited after hashing',
          (root) => {
            const hash = master(root, 'masters/tap/1.wav', BLIP, 0.2);
            master(root, 'masters/tap/1.wav', BLIP, 0.25);
            return hash;
          },
          /--rehash/,
        ],
      ];
      for (const [name, make, message] of cases) {
        const { repo, root, paths } = project((dir) => [
          sound({
            variants: [{ file: 'masters/tap/1.wav', sha256: make(dir) }],
          }),
        ]);
        assert.throws(
          () => buildAudio({ repo, root }),
          (error) => {
            assert.ok(error instanceof BuildError, name);
            assert.match(error.message, message, name);
            return true;
          },
        );
        assert.equal(
          fs.existsSync(paths.outDir),
          false,
          `${name}: nothing written`,
        );
      }
    });

    it("writes each master's hash into sounds.json when asked to", () => {
      const { repo, root, paths } = project((dir) => {
        master(dir, 'masters/tap/1.wav', BLIP, 0.2);
        return [
          sound({ variants: [{ file: 'masters/tap/1.wav', sha256: '' }] }),
        ];
      });
      assert.throws(() => buildAudio({ repo, root }), BuildError);
      buildAudio({ repo, root, rehash: true });
      assert.equal(
        readJson(paths.sounds).sounds[0].variants[0].sha256,
        fileSha256(path.join(root, 'masters/tap/1.wav')),
      );
      assert.deepEqual(checkGenerated(repo), []);
    });
  },
);
